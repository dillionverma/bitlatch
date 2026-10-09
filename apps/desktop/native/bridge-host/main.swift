import Darwin
import Foundation

@_silgen_name("latch_verify_server")
private func verifyServer(_ fd: Int32) -> Bool

private let maxMessageBytes = 1_048_576
private let chromeOrigin = "chrome-extension://bigjnomcnbhpgdekneagdbikmneibplj/"
private let firefoxId = "latch@latch.local"

private func readExact(_ fd: Int32, count: Int) -> [UInt8]? {
  var bytes = [UInt8](repeating: 0, count: count)
  var offset = 0
  while offset < count {
    let amount = bytes.withUnsafeMutableBytes { pointer in
      Darwin.read(fd, pointer.baseAddress!.advanced(by: offset), count - offset)
    }
    if amount <= 0 { return nil }
    offset += amount
  }
  return bytes
}

private func writeAll(_ fd: Int32, bytes: [UInt8]) -> Bool {
  var offset = 0
  while offset < bytes.count {
    let amount = bytes.withUnsafeBytes { pointer in
      Darwin.write(fd, pointer.baseAddress!.advanced(by: offset), bytes.count - offset)
    }
    if amount <= 0 { return false }
    offset += amount
  }
  return true
}

private func connectSocket(_ path: String) -> Int32? {
  let fd = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
  guard fd >= 0 else { return nil }
  var address = sockaddr_un()
  address.sun_family = sa_family_t(AF_UNIX)
  let pathBytes = Array(path.utf8CString)
  let capacity = MemoryLayout.size(ofValue: address.sun_path)
  guard pathBytes.count <= capacity else { Darwin.close(fd); return nil }
  withUnsafeMutableBytes(of: &address.sun_path) { destination in
    destination.copyBytes(from: pathBytes.map { UInt8(bitPattern: $0) })
  }
  let connected = withUnsafePointer(to: &address) { pointer in
    pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
      Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
    }
  }
  guard connected == 0, verifyServer(fd) else { Darwin.close(fd); return nil }
  return fd
}

private func forward(_ request: Any, raycast: Bool) -> Any {
  let configPath = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent(
      raycast ? "Library/Application Support/Latch/raycast-bridge.json"
        : "Library/Application Support/Latch/bridge.json")
  guard let data = try? Data(contentsOf: configPath),
    let config = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
    let path = config["socketPath"] as? String,
    let token = config["token"] as? String,
    token.count == 64,
    let fd = connectSocket(path)
  else { return ["ok": false, "error": "Open Bitlatch to connect your vault."] }
  defer { Darwin.close(fd) }
  var noSignal: Int32 = 1
  _ = setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
  var timeout = timeval(tv_sec: 120, tv_usec: 0)
  _ = setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
  _ = setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
  guard let payload = try? JSONSerialization.data(withJSONObject: ["token": token, "request": request]),
    payload.count < maxMessageBytes,
    writeAll(fd, bytes: Array(payload) + [10])
  else { return ["ok": false, "error": "Bitlatch request failed."] }
  var reply = [UInt8]()
  var buffer = [UInt8](repeating: 0, count: 4096)
  var complete = false
  while reply.count < maxMessageBytes {
    let amount = buffer.withUnsafeMutableBytes { Darwin.read(fd, $0.baseAddress, $0.count) }
    guard amount > 0 else { break }
    if let newline = buffer.prefix(amount).firstIndex(of: 10) {
      reply.append(contentsOf: buffer.prefix(upTo: newline))
      complete = true
      break
    }
    reply.append(contentsOf: buffer.prefix(amount))
  }
  guard complete, reply.count < maxMessageBytes,
    let response = try? JSONSerialization.jsonObject(with: Data(reply)) else {
    return ["ok": false, "error": "Bitlatch disconnected."]
  }
  return response
}

let arguments = Array(CommandLine.arguments.dropFirst())
let chrome = arguments.first == chromeOrigin &&
  (arguments.count == 1 || arguments.count == 2 && arguments[1].hasPrefix("--parent-window="))
let firefox = arguments.count == 2 &&
  URL(fileURLWithPath: arguments[0]).lastPathComponent == "app.latch.vault.json" &&
  arguments[1] == firefoxId
let raycast = arguments == ["--raycast"]
guard chrome || firefox || raycast else { exit(1) }

while let header = readExact(STDIN_FILENO, count: 4) {
  let size = Int(header[0]) | Int(header[1]) << 8 | Int(header[2]) << 16 | Int(header[3]) << 24
  guard size <= maxMessageBytes, let payload = readExact(STDIN_FILENO, count: size),
    let request = try? JSONSerialization.jsonObject(with: Data(payload))
  else { exit(1) }
  let response = forward(request, raycast: raycast)
  guard let data = try? JSONSerialization.data(withJSONObject: response), data.count <= maxMessageBytes
  else { exit(1) }
  let count = UInt32(data.count)
  let output = [UInt8(truncatingIfNeeded: count), UInt8(truncatingIfNeeded: count >> 8),
    UInt8(truncatingIfNeeded: count >> 16), UInt8(truncatingIfNeeded: count >> 24)] + Array(data)
  guard writeAll(STDOUT_FILENO, bytes: output) else { exit(0) }
}
