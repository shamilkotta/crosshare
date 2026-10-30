import AppKit
import CrosshareKit
import SwiftUI

/// Floating Accept/Decline card, used when macOS notifications are unavailable.
enum RequestToast {
  private static var panels: [String: NSPanel] = [:]

  static func show(_ transfer: Transfer) {
    guard panels[transfer.id] == nil, let screen = NSScreen.main else { return }
    let view = RequestPopupRow(transfer: transfer)
      .environmentObject(AppModel.shared)
      .frame(width: 320)
      .padding(8)
      .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
    let host = NSHostingView(rootView: view)
    host.layoutSubtreeIfNeeded()
    let size = host.fittingSize
    let panel = NSPanel(
      contentRect: NSRect(origin: .zero, size: size),
      styleMask: [.nonactivatingPanel, .borderless], backing: .buffered, defer: false)
    panel.contentView = host
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = true
    panel.level = .statusBar
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    let frame = screen.visibleFrame
    let offset = CGFloat(panels.count) * (size.height + 8)
    panel.setFrameOrigin(NSPoint(x: frame.maxX - size.width - 12, y: frame.maxY - size.height - 12 - offset))
    panel.orderFrontRegardless()
    panels[transfer.id] = panel
    NSSound(named: "Glass")?.play()
  }

  static func dismiss(_ id: String) {
    panels.removeValue(forKey: id)?.close()
  }
}
