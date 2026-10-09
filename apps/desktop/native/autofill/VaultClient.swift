import Darwin
import Foundation

@_silgen_name("latch_verify_server")
private func verifyServer(_ fd: Int32) -> Bool

private final class SocketLease: @unchecked Sendable {
  private let lock = NSLock()
  private var fd: Int32 = -1
  private var cancelled = false

  func adopt(_ value: Int32) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if cancelled { return false }
    fd = value
    return true
  }

  func cancel() {
    lock.lock()
    cancelled = true
    if fd >= 0 { _ = shutdown(fd, SHUT_RDWR) }
    lock.unlock()
  }

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelled
  }

  func close() {
    lock.lock()
    if fd >= 0 { Darwin.close(fd); fd = -1 }
    lock.unlock()
  }
}

@MainActor
final class VaultClient {
  private let directory: URL?

  init(directory: URL? = nil) {
    self.directory =
      directory
      ?? (Bundle.main.object(forInfoDictionaryKey: "LatchAppGroup") as? String)
      .flatMap { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) }
  }

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
    else { throw Failure() }
    let message = try JSONSerialization.data(
      withJSONObject: ["token": token, "request": payload]) + Data([10])
    guard message.count <= 70_000 else { throw Failure("This credential request is too large.") }
    let path = directory.appendingPathComponent("autofill.sock").path
    let lease = SocketLease()
    let data = try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        DispatchQueue.global(qos: .userInitiated).async {
          do { continuation.resume(returning: try Self.exchange(path, message, lease)) }
          catch { continuation.resume(throwing: error) }
        }
      }
    } onCancel: {
      lease.cancel()
    }
    try Task.checkCancellation()
    let reply = try JSONDecoder().decode(Reply<Value>.self, from: data)
    guard reply.ok, let value = reply.value else {
      throw Failure(
        reply.error.flatMap { $0.isEmpty ? nil : $0 } ?? "Open and unlock Bitlatch, then try again.")
    }
    return value
  }

  nonisolated private static func exchange(_ path: String, _ message: Data, _ lease: SocketLease)
    throws -> Data
  {
    let fd = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else { throw Failure() }
    guard lease.adopt(fd) else { Darwin.close(fd); throw CancellationError() }
    defer { lease.close() }
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let bytes = Array(path.utf8CString)
    guard bytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { throw Failure() }
    withUnsafeMutableBytes(of: &address.sun_path) {
      $0.copyBytes(from: bytes.map { UInt8(bitPattern: $0) })
    }
    let connected = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }
    guard connected == 0, verifyServer(fd) else { throw Failure() }
    if lease.isCancelled { throw CancellationError() }
    var noSignal: Int32 = 1
    _ = setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
    var timeout = timeval(tv_sec: 120, tv_usec: 0)
    _ = setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
    _ = setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
    var sent = 0
    try message.withUnsafeBytes { pointer in
      while sent < message.count {
        let amount = Darwin.write(fd, pointer.baseAddress!.advanced(by: sent), message.count - sent)
        guard amount > 0 else { throw Failure() }
        sent += amount
      }
    }
    var response = Data()
    var buffer = [UInt8](repeating: 0, count: 4096)
    while response.count < 1_048_576 {
      let amount = buffer.withUnsafeMutableBytes { Darwin.read(fd, $0.baseAddress, $0.count) }
      guard amount > 0 else { throw Failure() }
      response.append(contentsOf: buffer.prefix(amount))
      if let newline = response.firstIndex(of: 10) { return response.prefix(upTo: newline) }
    }
    throw Failure()
  }
}
