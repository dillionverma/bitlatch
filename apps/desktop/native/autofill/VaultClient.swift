import Foundation
import Network

// One authenticated, bounded connection per request. No vault data is persisted here.
@MainActor
final class VaultClient {
  private let directory: URL?

  init(directory: URL? = nil) {
    self.directory =
      directory
      ?? (Bundle.main.object(forInfoDictionaryKey: "LatchAppGroup") as? String)
      .flatMap { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) }
  }

  private var connection: NWConnection?
  private var continuation: CheckedContinuation<Data, Error>?
  private var timeout: Task<Void, Never>?
  private var response = Data()

  struct Failure: LocalizedError {
    let errorDescription: String?
    init(_ message: String = "Open and unlock Bitlatch, then try again.") {
      errorDescription = message
    }
  }
  private struct Reply<Value: Decodable>: Decodable {
    let ok: Bool
    let value: Value?
    let error: String?
  }

  func request<Value: Decodable>(_ payload: [String: Any], as: Value.Type = Value.self) async throws
    -> Value
  {
    guard let directory,
      let config = try? Data(contentsOf: directory.appendingPathComponent("autofill.json")),
      let token = (try? JSONDecoder().decode([String: String].self, from: config))?["token"]
    else {
      throw Failure()
    }
    let message =
      try JSONSerialization.data(withJSONObject: ["token": token, "request": payload]) + Data([10])
    guard message.count <= 70_000 else { throw Failure("This credential request is too large.") }
    let connection = NWConnection(
      to: .unix(path: directory.appendingPathComponent("autofill.sock").path), using: .tcp)
    self.connection = connection
    let data = try await withTaskCancellationHandler {
      try Task.checkCancellation()
      return try await withCheckedThrowingContinuation { continuation in
        self.continuation = continuation
        timeout = Task { [weak self] in
          do { try await Task.sleep(for: .seconds(20)) } catch { return }
          self?.finish(.failure(Failure("Bitlatch took too long to respond. Try again.")))
        }
        connection.stateUpdateHandler = { [weak self] state in
          // All Network callbacks are delivered on the main queue.
          MainActor.assumeIsolated {
            guard let self else { return }
            switch state {
            case .ready:
              connection.send(
                content: message,
                completion: .contentProcessed { [weak self] error in
                  MainActor.assumeIsolated {
                    if error != nil { self?.finish(.failure(Failure())) } else { self?.receive() }
                  }
                })
            case .failed, .waiting: self.finish(.failure(Failure()))
            default: break
            }
          }
        }
        connection.start(queue: .main)
      }
    } onCancel: {
      Task { @MainActor in self.finish(.failure(CancellationError())) }
    }
    let reply = try JSONDecoder().decode(Reply<Value>.self, from: data)
    guard reply.ok, let value = reply.value else {
      throw Failure(
        reply.error.flatMap { $0.isEmpty ? nil : $0 } ?? "Open and unlock Bitlatch, then try again.")
    }
    return value
  }

  private func receive() {
    connection?.receive(minimumIncompleteLength: 1, maximumLength: 4096) {
      [weak self] data, _, complete, error in
      MainActor.assumeIsolated {
        guard let self, self.continuation != nil else { return }
        if let data { self.response.append(data) }
        if self.response.count >= 1_048_576 {
          self.finish(.failure(Failure()))
        } else if let end = self.response.firstIndex(of: 10) {
          self.finish(.success(self.response.prefix(upTo: end)))
        } else if complete || error != nil {
          self.finish(.failure(Failure()))
        } else {
          self.receive()
        }
      }
    }
  }

  private func finish(_ result: Result<Data, Error>) {
    let pending = continuation
    continuation = nil
    timeout?.cancel()
    timeout = nil
    connection?.stateUpdateHandler = nil
    connection?.cancel()
    connection = nil
    response.removeAll()
    pending?.resume(with: result)
  }
}
