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

final class AppModel: ObservableObject, CrosshareEngineDelegate {
  static let shared = AppModel()

  @Published private(set) var peers: [Peer] = []
  /// Newest first.
  @Published private(set) var transfers: [Transfer] = []
  @Published private(set) var bluetooth = "unknown"
  @Published var deviceName: String
  /// From Finder's Open With, the Dock icon, or the Share menu.
  @Published var pending: PendingShare?
  @Published var visible: Bool {
    didSet {
      engine.setVisible(visible)
      UserDefaults.standard.set(visible, forKey: "visible")
    }
  }

  let engine: CrosshareEngine

  /// Incoming transfers waiting for a decision, oldest first.
  var requests: [Transfer] {
    transfers.filter { $0.direction == .incoming && $0.status == .waiting }.reversed()
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
    pending = nil
    do {
      let files = try expand(share.files).map { try OutgoingFile(url: $0) }
      guard !files.isEmpty || share.text != nil else { return }
      try engine.send(files: files, text: share.text, to: peer.id)
    } catch {
      alert("Could not send", error.localizedDescription)
    }
  }

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
    postIncomingNotification(for: transfer)
  }

  private func postIncomingNotification(for transfer: Transfer) {
    let content = UNMutableNotificationContent()
    content.title = "\(transfer.peerName) wants to share"
    content.body = notificationBody(for: transfer)
    content.sound = .default
    content.categoryIdentifier = "INCOMING_TRANSFER"
    let request = UNNotificationRequest(identifier: transfer.id, content: content, trigger: nil)
    let center = UNUserNotificationCenter.current()
    center.getNotificationSettings { settings in
      let allowed = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
      DispatchQueue.main.async {
        if allowed {
          center.add(request) { error in
            if error != nil { DispatchQueue.main.async { RequestToast.show(transfer) } }
          }
        } else {
          RequestToast.show(transfer)
        }
      }
    }
  }

  private func notificationBody(for transfer: Transfer) -> String {
    if transfer.files.isEmpty { return transfer.text ?? "" }
    let size = ByteCountFormatter.string(fromByteCount: transfer.totalBytes, countStyle: .file)
    let names = transfer.files.prefix(2).map(\.name).joined(separator: ", ")
    let more = transfer.files.count > 2 ? " +\(transfer.files.count - 2) more" : ""
    return "\(names)\(more) · \(size)"
  }

  func engineDidUpdateTransfer(_ transfer: Transfer) {
    upsert(transfer)
  }

  func engineDidUpdateBluetooth(state: String) {
    bluetooth = state
  }

  private func upsert(_ t: Transfer) {
    if t.status != .waiting {
      RequestToast.dismiss(t.id)
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [t.id])
    }
    if let i = transfers.firstIndex(where: { $0.id == t.id }) {
      transfers[i] = t
    } else {
      transfers.insert(t, at: 0)
    }
  }
}
