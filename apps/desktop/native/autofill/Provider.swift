import AppKit
import AuthenticationServices

@objc(LatchCredentialProvider)
@MainActor
final class CredentialProvider: ASCredentialProviderViewController {
  private let stack = NSStackView()
  private var task: Task<Void, Never>?
  private var retryAction: (() -> Void)?
  private var choices: [() -> Void] = []

  override func loadView() {
    view = NSView(frame: NSRect(x: 0, y: 0, width: 440, height: 300))
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 12
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
      stack.topAnchor.constraint(equalTo: view.topAnchor, constant: 24),
      stack.bottomAnchor.constraint(lessThanOrEqualTo: view.bottomAnchor, constant: -24),
    ])
  }

  override func viewDidDisappear() {
    super.viewDidDisappear()
    stop()
  }

  private func stop() {
    task?.cancel()
    task = nil
    choices = []
  }

  private func cancel(_ code: ASExtensionError.Code) {
    stop()
    retryAction = nil
    extensionContext.cancelRequest(
      withError: NSError(domain: ASExtensionErrorDomain, code: code.rawValue))
  }

  @objc private func cancelClicked() { cancel(.userCanceled) }
  @objc private func retryClicked() { retryAction?() }
  @objc private func select(_ sender: NSButton) {
    guard choices.indices.contains(sender.tag) else { return }
    let action = choices[sender.tag]
    action()
  }

  private func show(
    _ message: String, title: String = "AutoFill from Bitlatch", retry: Bool = false,
    options: [(String, () -> Void)] = []
  ) {
    loadViewIfNeeded()
    for child in stack.arrangedSubviews {
      stack.removeArrangedSubview(child)
      child.removeFromSuperview()
    }
    let heading = NSTextField(labelWithString: title)
    heading.font = .boldSystemFont(ofSize: 20)
    stack.addArrangedSubview(heading)
    stack.addArrangedSubview(NSTextField(wrappingLabelWithString: message))
    choices = options.map(\.1)
    for (index, option) in options.enumerated() {
      let button = NSButton(title: option.0, target: self, action: #selector(select(_:)))
      button.tag = index
      stack.addArrangedSubview(button)
    }
    if retry {
      stack.addArrangedSubview(
        NSButton(title: "Try Again", target: self, action: #selector(retryClicked)))
    }
    let cancel = NSButton(title: "Cancel", target: self, action: #selector(cancelClicked))
    cancel.keyEquivalent = "\u{1b}"
    stack.addArrangedSubview(cancel)
    preferredContentSize = NSSize(width: 440, height: min(700, 180 + options.count * 40))
  }

  // All requests share cancellation and error handling; a superseded task cannot fill.
  private func run(interactive: Bool = true, _ operation: @escaping () async throws -> Void) {
    stop()
    task = Task { [weak self] in
      do {
        try Task.checkCancellation()
        try await operation()
      } catch {
        guard !Task.isCancelled, let self else { return }
        if !interactive {
          self.cancel(.userInteractionRequired)
        } else if let failure = error as? VaultClient.Failure {
          self.show(failure.localizedDescription, retry: true)
        } else {
          self.show("Could not complete AutoFill. Unlock Bitlatch and try again.", retry: true)
        }
      }
    }
  }

  private struct Login: Decodable {
    let id, name, username, url: String
    var identity: ASPasswordCredentialIdentity {
      .init(
        serviceIdentifier: .init(identifier: url, type: .URL), user: username, recordIdentifier: id)
    }
  }
  private struct Password: Decodable { let username, password: String }
  private struct Passkey: Decodable { let id, name, userName, credentialId: String }
  private struct Assertion: Decodable {
    let signature, authenticatorData, credentialId, userHandle: String
  }
  private struct Registration: Decodable { let credentialId, attestationObject: String }

  private func bytes(_ text: String, allowEmpty: Bool = false) throws -> Data {
    guard let data = Data(base64URL: text), allowEmpty || !data.isEmpty else {
      throw CocoaError(.coderInvalidValue)
    }
    return data
  }

  private func url(_ service: ASCredentialServiceIdentifier) -> String {
    service.type == .domain ? "https://" + service.identifier : service.identifier
  }

  override func prepareCredentialList(for services: [ASCredentialServiceIdentifier]) {
    retryAction = { [weak self] in self?.prepareCredentialList(for: services) }
    let urls = services.prefix(16).map(url).filter { $0.count <= 4096 }
    run { [self] in
      guard !urls.isEmpty else {
        self.show("This app did not provide a website to match. Open Bitlatch to copy your login.")
        return
      }
      self.show("Looking for matching logins…")
      let logins: [Login] = try await VaultClient().request(["type": "matches", "urls": urls])
      try Task.checkCancellation()
      var seen = Set<String>()
      let options = logins.filter { seen.insert($0.id).inserted }.prefix(12).map { login in
        (
          "\(login.name) — \(login.username)",
          { [weak self] in
            self?.fill(login.identity)
            return
          }
        )
      }
      self.show(
        options.isEmpty
          ? "No matching logins. Add this website to a login in Bitlatch." : "Choose a login.",
        retry: true, options: options)
    }
  }

  private func fill(_ identity: ASPasswordCredentialIdentity, interactive: Bool = true) {
    retryAction = { [weak self] in self?.fill(identity) }
    guard let record = identity.recordIdentifier, !record.isEmpty else {
      cancel(.credentialIdentityNotFound)
      return
    }
    run(interactive: interactive) {
      if interactive { self.show("Filling login…") }
      let login: Password = try await VaultClient().request([
        "type": "fill", "id": record, "url": self.url(identity.serviceIdentifier),
      ])
      try Task.checkCancellation()
      self.extensionContext.completeRequest(
        withSelectedCredential: .init(user: login.username, password: login.password),
        completionHandler: nil)
    }
  }

  override func prepareCredentialList(
    for services: [ASCredentialServiceIdentifier],
    requestParameters parameters: ASPasskeyCredentialRequestParameters
  ) {
    retryAction = { [weak self] in
      self?.prepareCredentialList(for: services, requestParameters: parameters)
    }
    run { [self] in
      self.show("Looking for passkeys…", title: "Passkey from Bitlatch")
      // Refuse oversized allow lists, never truncate security constraints.
      guard parameters.allowedCredentials.count <= 64 else {
        throw VaultClient.Failure("This passkey request is too large.")
      }
      let keys: [Passkey] = try await VaultClient().request([
        "type": "passkeys", "rpId": parameters.relyingPartyIdentifier,
        "allowed": parameters.allowedCredentials.map(\.base64URL),
      ])
      try Task.checkCancellation()
      self.show(
        keys.isEmpty
          ? "No saved passkey for \(parameters.relyingPartyIdentifier)."
          : "Choose a passkey for \(parameters.relyingPartyIdentifier).",
        title: "Passkey from Bitlatch", retry: true,
        options: keys.prefix(12).map { key in
          (
            "\(key.name) — \(key.userName)",
            { [weak self] in
              self?.assert(
                record: key.id, credential: key.credentialId, rp: parameters.relyingPartyIdentifier,
                hash: parameters.clientDataHash)
            }
          )
        })
    }
  }

  private func assert(
    record: String?, credential: String, rp: String, hash: Data
  ) {
    guard let record, !record.isEmpty, hash.count == 32 else {
      cancel(.credentialIdentityNotFound)
      return
    }
    retryAction = { [weak self] in
      self?.assert(
        record: record, credential: credential, rp: rp, hash: hash)
    }
    run { [self] in
      self.show("Signing in to \(rp)…", title: "Passkey from Bitlatch")
      let result: Assertion = try await VaultClient().request([
        "type": "assert", "id": record, "credentialId": credential,
        "rpId": rp, "clientDataHash": hash.base64URL,
      ])
      try Task.checkCancellation()
      let assertion = try ASPasskeyAssertionCredential(
        userHandle: self.bytes(result.userHandle, allowEmpty: true), relyingParty: rp,
        signature: self.bytes(result.signature), clientDataHash: hash,
        authenticatorData: self.bytes(result.authenticatorData),
        credentialID: self.bytes(result.credentialId))
      self.extensionContext.completeAssertionRequest(using: assertion, completionHandler: nil)
    }
  }

  override func prepareInterface(forPasskeyRegistration request: any ASCredentialRequest) {
    stop()
    guard let request = request as? ASPasskeyCredentialRequest,
      let identity = request.credentialIdentity as? ASPasskeyCredentialIdentity
    else {
      cancel(.failed)
      return
    }
    retryAction = { [weak self] in self?.prepareInterface(forPasskeyRegistration: request) }
    show(
      "Create a passkey for \(identity.relyingPartyIdentifier) as \(identity.userName)? It will be saved in your Bitwarden vault.",
      title: "Save a passkey in Bitlatch",
      options: [("Save Passkey", { [weak self] in self?.register(request, identity: identity) })])
  }

  private func register(
    _ request: ASPasskeyCredentialRequest, identity: ASPasskeyCredentialIdentity
  ) {
    run { [self] in
      let rp = identity.relyingPartyIdentifier
      var excluded: [String] = []
      if #available(macOS 15, *) {
        excluded = request.excludedCredentials?.map { $0.credentialID.base64URL } ?? []
      }
      guard request.clientDataHash.count == 32, excluded.count <= 64,
        request.supportedAlgorithms.count <= 32
      else {
        throw VaultClient.Failure("This passkey request is not supported.")
      }
      self.show("Creating a passkey for \(rp)…", title: "Save a passkey in Bitlatch")
      let result: Registration = try await VaultClient().request([
        "type": "register", "rpId": rp,
        "userName": identity.userName, "userHandle": identity.userHandle.base64URL,
        "clientDataHash": request.clientDataHash.base64URL,
        "algorithms": request.supportedAlgorithms.map(\.rawValue), "excluded": excluded,
      ])
      try Task.checkCancellation()
      let credential = try ASPasskeyRegistrationCredential(
        relyingParty: rp, clientDataHash: request.clientDataHash,
        credentialID: self.bytes(result.credentialId),
        attestationObject: self.bytes(result.attestationObject))
      self.extensionContext.completeRegistrationRequest(using: credential, completionHandler: nil)
    }
  }

  override func provideCredentialWithoutUserInteraction(for request: any ASCredentialRequest) {
    if request is ASPasskeyCredentialRequest {
      cancel(.userInteractionRequired)
    } else if let identity = request.credentialIdentity as? ASPasswordCredentialIdentity {
      fill(identity, interactive: false)
    } else {
      cancel(.failed)
    }
  }

  override func prepareInterfaceToProvideCredential(for request: any ASCredentialRequest) {
    if let key = request as? ASPasskeyCredentialRequest,
      let identity = key.credentialIdentity as? ASPasskeyCredentialIdentity
    {
      assert(
        record: identity.recordIdentifier, credential: identity.credentialID.base64URL,
        rp: identity.relyingPartyIdentifier,
        hash: key.clientDataHash)
    } else if let identity = request.credentialIdentity as? ASPasswordCredentialIdentity {
      fill(identity)
    } else {
      cancel(.failed)
    }
  }

  override func prepareInterfaceForExtensionConfiguration() {
    extensionContext.completeExtensionConfigurationRequest()
  }
}
