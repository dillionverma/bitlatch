import Foundation

extension Data {
  var base64URL: String {
    base64EncodedString().replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  }

  init?(base64URL: String) {
    let text = base64URL.replacingOccurrences(of: "-", with: "+").replacingOccurrences(
      of: "_", with: "/")
    self.init(base64Encoded: text + String(repeating: "=", count: (4 - text.count % 4) % 4))
  }
}
