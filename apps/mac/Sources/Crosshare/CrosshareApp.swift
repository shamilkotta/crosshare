import AppKit
import ServiceManagement
import CrosshareKit
import SwiftUI
import UserNotifications

@main
struct CrosshareApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var model = AppModel.shared

  var body: some Scene {
    Window("Crosshare", id: "main") {
      ContentView()
        .environmentObject(model)
        .frame(minWidth: 520, minHeight: 480)
    }
    .windowResizability(.contentMinSize)
    .commands {
      CommandGroup(replacing: .appTermination) {
        Button("Close Crosshare") { AppDelegate.closeToTray() }
          .keyboardShortcut("q")
      }
    }

    MenuBarExtra {
      MenuBarPopup().environmentObject(model)
    } label: {
      MenuBarIcon().environmentObject(model)
    }
    .menuBarExtraStyle(.window)
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
  static func closeToTray() {
    NSApp.windows.filter(isAppWindow).forEach { $0.close() }
    NSApp.setActivationPolicy(.accessory)
  }

  /// The main window, as opposed to the menu bar popup panel.
  private static func isAppWindow(_ w: NSWindow) -> Bool { !(w is NSPanel) && w.canBecomeMain }

  private var launchedAtLogin = false

  func applicationWillFinishLaunching(_ notification: Notification) {
    let event = NSAppleEventManager.shared().currentAppleEvent
    launchedAtLogin = event?.eventID == kAEOpenApplication
      && event?.paramDescriptor(forKeyword: keyAEPropData)?.enumCodeValue == keyAELaunchedAsLogInItem
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    if !UserDefaults.standard.bool(forKey: "loginItemConfigured") {
      try? SMAppService.mainApp.register()
      UserDefaults.standard.set(true, forKey: "loginItemConfigured")
    }
    if launchedAtLogin {
      NSApp.setActivationPolicy(.accessory)
      DispatchQueue.main.async { Self.closeToTray() }
    }
    let nc = NotificationCenter.default
    nc.addObserver(forName: NSWindow.didBecomeKeyNotification, object: nil, queue: .main) { note in
      guard let w = note.object as? NSWindow, Self.isAppWindow(w) else { return }
      if NSApp.activationPolicy() != .regular { NSApp.setActivationPolicy(.regular) }
    }
    nc.addObserver(forName: NSWindow.willCloseNotification, object: nil, queue: .main) { note in
      guard let w = note.object as? NSWindow, Self.isAppWindow(w) else { return }
      DispatchQueue.main.async {
        if !NSApp.windows.contains(where: { Self.isAppWindow($0) && $0.isVisible }) {
          NSApp.setActivationPolicy(.accessory)
        }
      }
    }
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.requestAuthorization(options: [.alert, .sound]) { ok, err in NSLog("CSNOTIF auth ok=\(ok) err=\(String(describing: err))") }
    let accept = UNNotificationAction(identifier: "ACCEPT", title: "Accept", options: [])
    let decline = UNNotificationAction(identifier: "DECLINE", title: "Decline", options: [.destructive])
    let category = UNNotificationCategory(
      identifier: "INCOMING_TRANSFER",
      actions: [accept, decline],
      intentIdentifiers: [],
      options: []
    )
    center.setNotificationCategories([category])
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

  func application(_ application: NSApplication, open urls: [URL]) {
    AppModel.shared.receive(urls)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let id = response.notification.request.identifier
    switch response.actionIdentifier {
    case "ACCEPT":
      DispatchQueue.main.async { AppModel.shared.respondToNotification(transferId: id, accept: true) }
    case "DECLINE":
      DispatchQueue.main.async { AppModel.shared.respondToNotification(transferId: id, accept: false) }
    case UNNotificationDefaultActionIdentifier:
      DispatchQueue.main.async {
        NSApp.windows.first { $0.title == "Crosshare" }?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
      }
    default: break
    }
    completionHandler()
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound])
  }
}

// MARK: - Menu bar icon

struct MenuBarIcon: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.openWindow) private var openWindow

  private static let logo: NSImage? = {
    guard let image = Bundle.main.image(forResource: "MenuBarIcon") else { return nil }
    image.isTemplate = true
    return image
  }()

  var body: some View {
    icon
      .onChange(of: model.pending?.id) { id in
        guard id != nil else { return }
        openWindow(id: "main")
        NSApp.activate(ignoringOtherApps: true)
      }
  }

  @ViewBuilder private var icon: some View {
    if !model.requests.isEmpty {
      Image(systemName: "tray.and.arrow.down.fill")
    } else if model.transfers.contains(where: { !$0.status.isFinal }) {
      Image(systemName: "arrow.up.arrow.down.circle.fill")
    } else if let logo = Self.logo {
      Image(nsImage: logo)
    } else {
      Image(systemName: "antenna.radiowaves.left.and.right")
    }
  }
}

// MARK: - Menu bar popup

struct MenuBarPopup: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.openWindow) private var openWindow

  var body: some View {
    VStack(spacing: 0) {
      popupHeader
      Divider()
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          if !model.requests.isEmpty {
            requestsSection
            Divider().padding(.vertical, 4)
          }
          nearbySection
          if !model.transfers.filter({ !($0.direction == .incoming && $0.status == .waiting) }).isEmpty {
            Divider().padding(.vertical, 4)
            transfersSection
          }
        }
        .padding(12)
      }
      .frame(maxHeight: 380)
      Divider()
      popupFooter
    }
    .frame(width: 300)
  }

  private var popupHeader: some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text(model.deviceName)
          .font(.headline)
          .lineLimit(1)
        Text(model.visible ? "Visible to nearby devices" : "Hidden from nearby devices")
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer()
      Toggle("", isOn: $model.visible)
        .toggleStyle(.switch)
        .labelsHidden()
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
  }

  private var requestsSection: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("INCOMING")
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
      ForEach(model.requests, id: \.id) { transfer in
        RequestPopupRow(transfer: transfer)
      }
    }
  }

  private var nearbySection: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("NEARBY")
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
      if model.peers.isEmpty {
        HStack(spacing: 8) {
          ProgressView().controlSize(.mini)
          Text("Looking for devices…")
            .font(.callout)
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 4)
      } else {
        ForEach(model.peers, id: \.id) { peer in
          PeerPopupRow(peer: peer)
        }
      }
    }
  }

  private var transfersSection: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text("TRANSFERS")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
        Spacer()
        if model.transfers.contains(where: { $0.status.isFinal }) {
          Button("Clear") { model.clearFinished() }
            .buttonStyle(.link)
            .font(.caption)
        }
      }
      let visible = model.transfers.filter { !($0.direction == .incoming && $0.status == .waiting) }.prefix(4)
      ForEach(Array(visible), id: \.id) { transfer in
        CompactTransferRow(transfer: transfer)
      }
    }
  }

  private var popupFooter: some View {
    VStack(spacing: 8) {
    HStack {
      Button("Open Crosshare") {
        openWindow(id: "main")
        NSApp.activate(ignoringOtherApps: true)
      }
      .buttonStyle(.link)
      .font(.callout)
      Spacer()
      Button("Quit") { NSApp.terminate(nil) }
        .buttonStyle(.link)
        .font(.callout)
        .foregroundStyle(.secondary)
    }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
  }
}

// MARK: - Request row in popup

struct RequestPopupRow: View {
  @EnvironmentObject var model: AppModel
  let transfer: Transfer

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        Image(systemName: "tray.and.arrow.down.fill")
          .foregroundStyle(Color.accentColor)
        VStack(alignment: .leading, spacing: 1) {
          Text("\(transfer.peerName) wants to share")
            .font(.callout.weight(.medium))
            .lineLimit(1)
          Text(summary)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(2)
        }
      }
      HStack(spacing: 8) {
        Spacer()
        Button("Decline") { model.respond(transfer, accept: false) }
          .buttonStyle(.bordered)
          .controlSize(.small)
        Button("Accept") { model.respond(transfer, accept: true) }
          .buttonStyle(.borderedProminent)
          .controlSize(.small)
      }
    }
    .padding(10)
    .background(RoundedRectangle(cornerRadius: 8).fill(Color.accentColor.opacity(0.1)))
  }

  private var summary: String {
    if transfer.files.isEmpty { return transfer.text ?? "" }
    let size = ByteCountFormatter.string(fromByteCount: transfer.totalBytes, countStyle: .file)
    let names = transfer.files.prefix(2).map(\.name).joined(separator: ", ")
    let more = transfer.files.count > 2 ? " +\(transfer.files.count - 2)" : ""
    return "\(names)\(more) · \(size)"
  }
}

// MARK: - Peer row in popup

struct PeerPopupRow: View {
  @EnvironmentObject var model: AppModel
  let peer: Peer

  private var icon: String {
    switch peer.platform {
    case .macos: return "laptopcomputer"
    case .android: return "candybarphone"
    case .ios: return "iphone"
    }
  }

  var body: some View {
    Button {
      if model.pending != nil { model.sendPending(to: peer) } else { chooseFiles() }
    } label: {
      HStack(spacing: 10) {
        Image(systemName: icon)
          .frame(width: 28, height: 28)
          .background(Circle().fill(Color.secondary.opacity(0.12)))
        VStack(alignment: .leading, spacing: 1) {
          Text(peer.name)
            .font(.callout.weight(.medium))
            .lineLimit(1)
          Text(peer.routes.contains("wifi") ? "Wi-Fi" : "Bluetooth")
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Image(systemName: "chevron.right")
          .font(.caption)
          .foregroundStyle(.tertiary)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .dropDestination(for: URL.self) { urls, _ in
      model.send(urls: urls, to: peer)
      return true
    }
  }

  private func chooseFiles() {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = true
    panel.canChooseDirectories = true
    panel.prompt = "Send"
    panel.message = "Send to \(peer.name)"
    if panel.runModal() == .OK { model.send(urls: panel.urls, to: peer) }
  }
}

// MARK: - Compact transfer row in popup

struct CompactTransferRow: View {
  @EnvironmentObject var model: AppModel
  let transfer: Transfer

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: transfer.direction == .incoming ? "arrow.down.circle" : "arrow.up.circle")
        .foregroundStyle(.secondary)
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.callout)
          .lineLimit(1)
        if !transfer.status.isFinal, transfer.totalBytes > 0 {
          ProgressView(value: Double(transfer.transferredBytes), total: Double(max(transfer.totalBytes, 1)))
            .progressViewStyle(.linear)
        }
        Text(caption)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer()
      if !transfer.status.isFinal {
        Button("Cancel") { model.cancel(transfer) }
          .buttonStyle(.link)
          .font(.caption)
      }
    }
  }

  private var title: String {
    if transfer.files.isEmpty { return transfer.text ?? "Text" }
    return transfer.files.count == 1 ? transfer.files[0].name : "\(transfer.files.count) files"
  }

  private var caption: String {
    let who = (transfer.direction == .incoming ? "From " : "To ") + transfer.peerName
    switch transfer.status {
    case .connecting: return "\(who) · connecting…"
    case .waiting: return "\(who) · waiting…"
    case .upgrading: return "\(who) · upgrading…"
    case .transferring:
      let bytes = ByteCountFormatter.string(fromByteCount: transfer.transferredBytes, countStyle: .file)
      let total = ByteCountFormatter.string(fromByteCount: transfer.totalBytes, countStyle: .file)
      return "\(who) · \(bytes)/\(total)"
    case .completed: return "\(who) · done"
    case .declined: return "\(who) · declined"
    case .cancelled: return "\(who) · cancelled"
    case .failed: return "\(who) · failed"
    }
  }
}
