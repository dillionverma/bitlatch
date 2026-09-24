import AuthenticationServices
import Foundation

// Runs inside Electron: Apple checks the containing app's bundle/entitlements.
@_cdecl("latch_invoke")
func invoke(
  _ operation: UnsafePointer<CChar>, _ input: UnsafePointer<CChar>,
  _ context: UnsafeMutableRawPointer?, _ reply: @escaping LatchReply
) {
  let operation = String(cString: operation)
  let input = Data(String(cString: input).utf8)
  let finish = Completion(context: context, reply: reply)
  DispatchQueue.main.async {
    if operation == "settings" {
      ASSettingsHelper.openCredentialProviderAppSettings { finish(["ok": $0 == nil]) }
      return
    }
    let bundle = Bundle.main
    guard let task = SecTaskCreateFromSelf(nil),
      SecTaskCopyValueForEntitlement(
        task,
        "com.apple.developer.authentication-services.autofill-credential-provider" as CFString, nil)
        as? Bool == true,
      let extensionURL = bundle.builtInPlugInsURL?.appendingPathComponent("LatchAutoFill.appex"),
      FileManager.default.fileExists(atPath: extensionURL.path),
      let group = bundle.object(forInfoDictionaryKey: "LatchAppGroup") as? String,
      let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    else {
      finish(["ok": true, "available": false, "enabled": false])
      return
    }
    switch operation {
    case "status":
      ASCredentialIdentityStore.shared.getState {
        finish([
          "ok": true, "available": true, "enabled": $0.isEnabled, "container": container.path,
        ])
      }
    case "enable":
      if #available(macOS 15, *) {
        ASSettingsHelper.requestToTurnOnCredentialProviderExtension {
          finish(["ok": true, "enabled": $0])
        }
      } else {
        ASSettingsHelper.openCredentialProviderAppSettings { finish(["ok": $0 == nil]) }
      }
    case "identities":
      do {
        let rows = try JSONDecoder().decode([Identity].self, from: input)
        let identities = try rows.map { try $0.native() }
        ASCredentialIdentityStore.shared.replaceCredentialIdentities(identities) { success, _ in
          finish(["ok": success])
        }
      } catch { finish(["ok": false]) }
    default: finish(["ok": false])
    }
  }
}

private struct Identity: Decodable {
  let id: String
  let kind, url, username, rpId, userName, credentialId, userHandle: String?

  func native() throws -> any ASCredentialIdentity {
    if kind == "passkey", let rpId, let userName, let credentialId, let userHandle,
      let credential = Data(base64URL: credentialId), let handle = Data(base64URL: userHandle)
    {
      return ASPasskeyCredentialIdentity(
        relyingPartyIdentifier: rpId, userName: userName,
        credentialID: credential, userHandle: handle, recordIdentifier: id)
    }
    if kind != "passkey", let url, let username {
      return ASPasswordCredentialIdentity(
        serviceIdentifier: .init(identifier: url, type: .URL),
        user: username, recordIdentifier: id)
    }
    throw CocoaError(.coderInvalidValue)
  }
}

// Node-API's threadsafe function owns this context until its single completion.
private struct Completion: @unchecked Sendable {
  let context: UnsafeMutableRawPointer?
  let reply: LatchReply

  func callAsFunction(_ value: [String: Any]) {
    let data = (try? JSONSerialization.data(withJSONObject: value)) ?? Data("{\"ok\":false}".utf8)
    String(decoding: data, as: UTF8.self).withCString { reply(context, $0) }
  }
}
