import AppKit
import CrosshareKit
import Foundation
import UserNotifications

/// Files or text handed to Crosshare by another app, waiting for the user to pick a device.
struct PendingShare: Equatable {
  let id = UUID()
  var files: [URL]
  var text: String?
}

/// "123456" -> "123 456".
func formatCode(_ code: String?) -> String {
  guard let code else { return "" }
  return "\(code.prefix(3)) \(code.dropFirst(3))"
}

/// Title for a transfer that needs a decision.
func requestTitle(_ t: Transfer) -> String {
  guard t.kind == .link else { return "\(t.peerName) wants to share" }
  return t.direction == .outgoing ? "Confirm link with \(t.peerName)" : "\(t.peerName) wants to link"
}

/// A nearby peer, or a linked device that isn't nearby right now.
struct Device: Identifiable, Equatable {
  let id: String
  let name: String
  let platform: CSPlatform
  let linked: Bool
  /// Set when the device is nearby and can be sent to.
  let peer: Peer?
}

final class AppModel: ObservableObject, CrosshareEngineDelegate {
  static let shared = AppModel()

  @Published private(set) var peers: [Peer] = []
  /// Newest first.
  @Published private(set) var transfers: [Transfer] = []
  @Published private(set) var bluetooth = "unknown"
  /// Devices whose text is accepted without asking.
  @Published private(set) var links: [LinkedDevice] = []
  @Published var deviceName: String
  /// From Finder's Open With, the Dock icon, or the Share menu.
  @Published var pending: PendingShare? {
    didSet { if pending?.id != oldValue?.id { pendingSentTo = [] } }
  }
  /// Devices the pending share was sent to. It stays pending so it can go to more devices.
  @Published private(set) var pendingSentTo: Set<String> = []
  /// Device the text composer sheet is sending to.
  @Published var textTarget: Peer?
  @Published var visible: Bool {
    didSet {
      engine.setVisible(visible)
      UserDefaults.standard.set(visible, forKey: "visible")
    }
  }

  let engine: CrosshareEngine

  /// Transfers waiting for a decision, oldest first: incoming requests, and link codes to confirm.
  var requests: [Transfer] {
    transfers.filter(Self.needsDecision).reversed()
  }

  /// Linked devices first (nearby before away), then other nearby devices.
  var devices: [Device] {
    let linkedIds = Set(links.map(\.id))
    let nearby = peers.map {
      Device(id: $0.id, name: $0.name, platform: $0.platform, linked: linkedIds.contains($0.id), peer: $0)
    }
    let away = links.filter { l in !peers.contains { $0.id == l.id } }
      .map { Device(id: $0.id, name: $0.name, platform: $0.platform, linked: true, peer: nil) }
    return nearby.filter(\.linked) + away + nearby.filter { !$0.linked }
  }

  /// Transfers that don't need a decision, newest first.
  var activity: [Transfer] { transfers.filter { !Self.needsDecision($0) } }

  static func needsDecision(_ t: Transfer) -> Bool {
    t.status == .waiting && (t.direction == .incoming || (t.kind == .link && t.code != nil))
  }

  private init() {
    let defaults = UserDefaults.standard
    let id = defaults.string(forKey: "id") ?? {
      let id = UUID().uuidString
      defaults.set(id, forKey: "id")
      return id
    }()
    let name = defaults.string(forKey: "name") ?? Host.current().localizedName ?? "Mac"
    deviceName = name
    visible = defaults.object(forKey: "visible") as? Bool ?? true

    let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
    engine = CrosshareEngine(device: LocalDevice(id: id, name: name, platform: .macos), downloads: downloads)
    engine.delegate = self
    links = engine.linkedDevices
    engine.setVisible(visible)
    engine.setDiscovering(true)
  }

  func rename(_ name: String) {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    deviceName = trimmed
    UserDefaults.standard.set(trimmed, forKey: "name")
    engine.rename(trimmed)
  }

  func send(urls: [URL], to peer: Peer) {
    do {
      let files = try expand(urls).map { try OutgoingFile(url: $0) }
      guard !files.isEmpty else { return }
      try engine.send(files: files, to: peer.id)
    } catch {
      alert("Could not send", error.localizedDescription)
    }
  }

  func send(text: String, to peer: Peer) {
    do {
      try engine.send(files: [], text: text, to: peer.id)
    } catch {
      alert("Could not send", error.localizedDescription)
    }
  }

  /// File URLs and crosshare://share?text=… links handed to the app.
  func receive(_ urls: [URL]) {
    let files = urls.filter(\.isFileURL)
    let texts = urls.compactMap { url -> String? in
      guard url.scheme == "crosshare", url.host == "share" else { return nil }
      return URLComponents(url: url, resolvingAgainstBaseURL: false)?
        .queryItems?.first { $0.name == "text" }?.value
    }
    guard !files.isEmpty || !texts.isEmpty else { return }
    pending = PendingShare(files: files, text: texts.isEmpty ? nil : texts.joined(separator: "\n"))
  }

  func sendPending(to peer: Peer) {
    guard let share = pending else { return }
    do {
      let files = try expand(share.files).map { try OutgoingFile(url: $0) }
      guard !files.isEmpty || share.text != nil else { return }
      try engine.send(files: files, text: share.text, to: peer.id)
      pendingSentTo.insert(peer.id)
    } catch {
      alert("Could not send", error.localizedDescription)
    }
  }

  /// Puts files or text in the composer, ready to pick a device.
  func select(files: [URL] = [], text: String? = nil) {
    guard !files.isEmpty || text != nil else { return }
    pending = PendingShare(files: files, text: text)
  }

  /// Asks for files (and folders) to send, then sends them or puts them in the composer.
  func chooseFiles(for peer: Peer? = nil) {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = true
    panel.canChooseDirectories = true
    panel.prompt = peer == nil ? "Choose" : "Send"
    panel.message = peer.map { "Send to \($0.name)" } ?? "Choose files to send"
    NSApp.activate(ignoringOtherApps: true)
    guard panel.runModal() == .OK, !panel.urls.isEmpty else { return }
    if let peer { send(urls: panel.urls, to: peer) } else { select(files: panel.urls) }
  }

  var clipboardText: String? {
    let text = NSPasteboard.general.string(forType: .string)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return text?.isEmpty == false ? text : nil
  }

  /// Files copied in Finder, or else text.
  func pasteIntoComposer() {
    let pb = NSPasteboard.general
    let urls = pb.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
    if !urls.isEmpty { select(files: urls) } else if let text = clipboardText { select(text: text) }
  }

  func isLinked(_ peer: Peer) -> Bool { links.contains { $0.id == peer.id } }

  func link(_ peer: Peer) {
    do {
      try engine.link(peerId: peer.id)
    } catch {
      alert("Could not link", error.localizedDescription)
    }
  }

  func unlink(_ device: LinkedDevice) { engine.unlink(id: device.id) }

  func respond(_ t: Transfer, accept: Bool) { engine.respond(transferId: t.id, accept: accept) }
  func cancel(_ t: Transfer) { engine.cancel(transferId: t.id) }
  func clearFinished() { transfers.removeAll { $0.status.isFinal } }

  func respondToNotification(transferId: String, accept: Bool) {
    guard let transfer = transfers.first(where: { $0.id == transferId }) else { return }
    respond(transfer, accept: accept)
  }

  /// Folders are sent as their files (flattened).
  private func expand(_ urls: [URL]) -> [URL] {
    urls.flatMap { url -> [URL] in
      var isDir: ObjCBool = false
      guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir), isDir.boolValue else {
        return [url]
      }
      let walker = FileManager.default.enumerator(
        at: url, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles])
      return (walker?.allObjects as? [URL] ?? []).filter {
        (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true
      }
    }
  }

  private func alert(_ title: String, _ message: String) {
    let a = NSAlert()
    a.messageText = title
    a.informativeText = message
    a.runModal()
  }

  // MARK: CrosshareEngineDelegate (main queue)

  func engineDidUpdatePeers(_ peers: [Peer]) {
    self.peers = peers
  }

  func engineDidReceiveRequest(_ transfer: Transfer) {
    upsert(transfer)
    if transfer.direction == .incoming { postIncomingNotification(for: transfer) }
  }

  private func postIncomingNotification(for transfer: Transfer) {
    let content = UNMutableNotificationContent()
    content.title = transfer.kind == .link
      ? "\(transfer.peerName) wants to link" : "\(transfer.peerName) wants to share"
    content.body = notificationBody(for: transfer)
    content.sound = .default
    content.categoryIdentifier = "INCOMING_TRANSFER"
    let request = UNNotificationRequest(identifier: transfer.id, content: content, trigger: nil)
    let center = UNUserNotificationCenter.current()
    center.getNotificationSettings { settings in
      guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
      center.add(request)
    }
  }

  private func notificationBody(for transfer: Transfer) -> String {
    if transfer.kind == .link { return "Check it shows \(formatCode(transfer.code))" }
    if transfer.files.isEmpty { return transfer.text ?? "" }
    let size = ByteCountFormatter.string(fromByteCount: transfer.totalBytes, countStyle: .file)
    let names = transfer.files.prefix(2).map(\.name).joined(separator: ", ")
    let more = transfer.files.count > 2 ? " +\(transfer.files.count - 2) more" : ""
    return "\(names)\(more) · \(size)"
  }

  func engineDidUpdateTransfer(_ transfer: Transfer) {
    // Received text goes straight to the clipboard.
    if transfer.direction == .incoming, transfer.kind == .transfer, transfer.status == .completed,
      transfer.files.isEmpty, let text = transfer.text,
      transfers.first(where: { $0.id == transfer.id })?.status != .completed
    {
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(text, forType: .string)
    }
    upsert(transfer)
  }

  func engineDidUpdateLinks(_ links: [LinkedDevice]) {
    self.links = links
  }

  func engineDidUpdateBluetooth(state: String) {
    bluetooth = state
  }

  private func upsert(_ t: Transfer) {
    guard t.kind != .unlink else { return }
    if t.status != .waiting {
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [t.id])
    }
    if let i = transfers.firstIndex(where: { $0.id == t.id }) {
      transfers[i] = t
    } else {
      transfers.insert(t, at: 0)
    }
  }
}
