import CoreGraphics
import Foundation

guard CommandLine.arguments.count == 3,
      let xRatio = Double(CommandLine.arguments[1]),
      let yRatio = Double(CommandLine.arguments[2]) else {
    fputs("usage: simulator-rcu-click.swift <x-ratio> <y-ratio>\n", stderr)
    exit(2)
}

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let windowList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    fputs("unable to inspect simulator windows\n", stderr)
    exit(1)
}

var target: CGRect?
for window in windowList {
    let title = window[kCGWindowName as String] as? String
    guard title == "RCU", let rawBounds = window[kCGWindowBounds as String] as? NSDictionary else {
        continue
    }

    var bounds = CGRect.zero
    if CGRectMakeWithDictionaryRepresentation(rawBounds as CFDictionary, &bounds) {
        target = bounds
        break
    }
}

guard let bounds = target else {
    fputs("the webOS simulator RCU window is not visible\n", stderr)
    exit(1)
}

let point = CGPoint(
    x: bounds.origin.x + (bounds.size.width * xRatio),
    y: bounds.origin.y + (bounds.size.height * yRatio)
)
let source = CGEventSource(stateID: .combinedSessionState)
let down = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)
let up = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
down?.post(tap: .cghidEventTap)
up?.post(tap: .cghidEventTap)
