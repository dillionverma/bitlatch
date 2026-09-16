import AppKit

let output = CommandLine.arguments[1]
let size = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
NSColor(calibratedRed: 0.12, green: 0.135, blue: 0.105, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 40, y: 40, width: 944, height: 944), xRadius: 205, yRadius: 205).fill()
NSColor(calibratedRed: 0.67, green: 0.75, blue: 0.52, alpha: 1).setStroke()
let path = NSBezierPath()
path.lineWidth = 43
path.lineCapStyle = .round
path.lineJoinStyle = .round
path.move(to: NSPoint(x: 330, y: 535))
path.line(to: NSPoint(x: 330, y: 671))
path.curve(to: NSPoint(x: 694, y: 671), controlPoint1: NSPoint(x: 330, y: 896), controlPoint2: NSPoint(x: 694, y: 896))
path.line(to: NSPoint(x: 694, y: 631))
path.stroke()
let body = NSBezierPath(roundedRect: NSRect(x: 290, y: 253, width: 444, height: 326), xRadius: 18, yRadius: 18)
body.lineWidth = 43
body.stroke()
let keyhole = NSBezierPath()
keyhole.lineWidth = 43
keyhole.lineCapStyle = .round
keyhole.move(to: NSPoint(x: 512, y: 437))
keyhole.line(to: NSPoint(x: 512, y: 380))
keyhole.stroke()
image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
