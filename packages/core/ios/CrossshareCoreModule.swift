import ExpoModulesCore
import UIKit

public class CrossshareCoreModule: Module, CrossshareEngineDelegate {
  private var engine: CrossshareEngine?
  private var bluetoothState = "unknown"

  public func definition() -> ModuleDefinition {
    Name("CrossshareCore")

    Events("onPeersChanged", "onTransferRequest", "onTransferUpdate", "onBluetoothState")

    Function("getDeviceInfo") { () -> [String: String] in
      let d = Self.localDevice()
      return ["id": d.id, "name": d.name, "platform": d.platform.rawValue]
    }

    Function("setDeviceName") { (name: String) in
      let trimmed = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(60))
      guard !trimmed.isEmpty else { return }
      UserDefaults.standard.set(trimmed, forKey: "crossshare.name")
      self.engine?.rename(trimmed)
    }

    // iOS asks for Bluetooth and local network access on first use.
    Function("requiredPermissions") { () -> [String] in [] }

    Function("setVisible") { (on: Bool) in self.getEngine().setVisible(on) }

    Function("setDiscovering") { (on: Bool) in self.getEngine().setDiscovering(on) }

    Function("refresh") {}

    Function("getPeers") { () -> [[String: Any]] in self.getEngine().peers.map(Self.peerDict) }

    Function("getBluetoothState") { () -> String in self.bluetoothState }

    Function("isWifiAwareSupported") { () -> Bool in CrossshareEngine.isWifiAwareSupported }

    /// "show": make this device pairable and display a code. "find": pick a nearby device and enter its code.
    AsyncFunction("pairWifiAware") { (mode: String) async throws in
      #if canImport(WiFiAware)
      let utilities = self.appContext?.utilities
      let presenter = await MainActor.run { utilities?.currentViewController() }
      guard let presenter else { throw CSError.unreachable("No screen to present on") }
      if mode == "show" {
        try await MainActor.run { try AwareTransport.presentPairingCode(from: presenter) }
      } else {
        try await AwareTransport.presentPicker(from: presenter)
      }
      #else
      throw CSError.unreachable("Wi-Fi Aware needs iOS 26")
      #endif
    }

    AsyncFunction("send") { (peerId: String, files: [[String: Any]], text: String?) throws -> String in
      let outgoing = try files.map { spec -> OutgoingFile in
        guard let uri = spec["uri"] as? String else { throw CSError.protocolError("uri is required") }
        let url = uri.hasPrefix("file://") ? URL(string: uri)! : URL(fileURLWithPath: uri)
        return try OutgoingFile(url: url, name: spec["name"] as? String, mime: spec["mimeType"] as? String)
      }
      return try self.getEngine().send(files: outgoing, text: text, to: peerId)
    }

    Function("respond") { (transferId: String, accept: Bool) in
      self.engine?.respond(transferId: transferId, accept: accept)
    }

    Function("cancel") { (transferId: String) in
      self.engine?.cancel(transferId: transferId)
    }

    AsyncFunction("openFile") { (uri: String, _: String?) in
      guard let url = URL(string: uri), let presenter = self.appContext?.utilities?.currentViewController() else {
        return
      }
      let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
      sheet.popoverPresentationController?.sourceView = presenter.view
      presenter.present(sheet, animated: true)
    }.runOnQueue(.main)

    OnDestroy {
      self.engine?.setDiscovering(false)
      self.engine?.setVisible(false)
    }
  }

  // MARK: Engine

  private func getEngine() -> CrossshareEngine {
    if let engine { return engine }
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let e = CrossshareEngine(device: Self.localDevice(), downloads: docs.appendingPathComponent("Crossshare"))
    e.delegate = self
    engine = e
    return e
  }

  private static func localDevice() -> LocalDevice {
    let defaults = UserDefaults.standard
    let id: String
    if let saved = defaults.string(forKey: "crossshare.id") {
      id = saved
    } else {
      id = UUID().uuidString
      defaults.set(id, forKey: "crossshare.id")
    }
    let name = defaults.string(forKey: "crossshare.name") ?? UIDevice.current.name
    return LocalDevice(id: id, name: name, platform: .ios)
  }

  // MARK: CrossshareEngineDelegate

  public func engineDidUpdatePeers(_ peers: [Peer]) {
    sendEvent("onPeersChanged", ["peers": peers.map(Self.peerDict)])
  }

  public func engineDidReceiveRequest(_ transfer: Transfer) {
    sendEvent("onTransferRequest", Self.transferDict(transfer))
  }

  public func engineDidUpdateTransfer(_ transfer: Transfer) {
    sendEvent("onTransferUpdate", Self.transferDict(transfer))
  }

  public func engineDidUpdateBluetooth(state: String) {
    bluetoothState = state
    sendEvent("onBluetoothState", ["state": state])
  }

  // MARK: Conversions

  private static func peerDict(_ p: Peer) -> [String: Any] {
    ["id": p.id, "name": p.name, "platform": p.platform.rawValue, "routes": p.routes]
  }

  private static func transferDict(_ t: Transfer) -> [String: Any] {
    var d: [String: Any] = [
      "id": t.id,
      "direction": t.direction.rawValue,
      "peerId": t.peerId,
      "peerName": t.peerName,
      "peerPlatform": t.peerPlatform.rawValue,
      "status": t.status.rawValue,
      "files": t.files.map { f -> [String: Any] in
        var d: [String: Any] = ["name": f.name, "size": Double(f.size), "transferred": Double(f.transferred)]
        if let url = f.savedURL { d["uri"] = url.absoluteString }
        return d
      },
      "transport": t.transport,
      "totalBytes": Double(t.totalBytes),
      "transferredBytes": Double(t.transferredBytes),
    ]
    if let text = t.text { d["text"] = text }
    if let error = t.error { d["error"] = error }
    return d
  }
}
