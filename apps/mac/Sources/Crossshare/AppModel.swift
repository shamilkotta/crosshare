import AppKit
import CrossshareKit
import Foundation

final class AppModel: ObservableObject, CrossshareEngineDelegate {
  @Published private(set) var peers: [Peer] = []
  /// Newest first.
  @Published private(set) var transfers: [Transfer] = []
  @Published private(set) var bluetooth = "unknown"
  @Published var deviceName: String
  @Published var visible: Bool {
    didSet {
      engine.setVisible(visible)
      UserDefaults.standard.set(visible, forKey: "visible")
    }
  }

  let engine: CrossshareEngine

  /// Incoming transfers waiting for a decision, oldest first.
  var requests: [Transfer] {
    transfers.filter { $0.direction == .incoming && $0.status == .waiting }.reversed()
  }

  init() {
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
    engine = CrossshareEngine(device: LocalDevice(id: id, name: name, platform: .macos), downloads: downloads)
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

  func respond(_ t: Transfer, accept: Bool) { engine.respond(transferId: t.id, accept: accept) }
  func cancel(_ t: Transfer) { engine.cancel(transferId: t.id) }
  func clearFinished() { transfers.removeAll { $0.status.isFinal } }

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

  // MARK: CrossshareEngineDelegate (main queue)

  func engineDidUpdatePeers(_ peers: [Peer]) {
    self.peers = peers
  }

  func engineDidReceiveRequest(_ transfer: Transfer) {
    upsert(transfer)
    NSApp.requestUserAttention(.criticalRequest)
    NSApp.activate(ignoringOtherApps: true)
  }

  func engineDidUpdateTransfer(_ transfer: Transfer) {
    upsert(transfer)
  }

  func engineDidUpdateBluetooth(state: String) {
    bluetooth = state
  }

  private func upsert(_ t: Transfer) {
    if let i = transfers.firstIndex(where: { $0.id == t.id }) {
      transfers[i] = t
    } else {
      transfers.insert(t, at: 0)
    }
  }
}
