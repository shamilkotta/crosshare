import Foundation
import Network

public protocol CrossshareEngineDelegate: AnyObject {
  func engineDidUpdatePeers(_ peers: [Peer])
  /// An incoming transfer is waiting for `respond(transferId:accept:)`.
  func engineDidReceiveRequest(_ transfer: Transfer)
  func engineDidUpdateTransfer(_ transfer: Transfer)
  /// "on", "off", "unauthorized", "unsupported" or "unknown".
  func engineDidUpdateBluetooth(state: String)
  func engineDidFail(_ message: String)
}

public extension CrossshareEngineDelegate {
  func engineDidUpdateBluetooth(state: String) {}
  func engineDidFail(_ message: String) {}
}

/// Discovers nearby devices and runs transfers. All delegate calls happen on the main queue.
public final class CrossshareEngine: @unchecked Sendable {
  public weak var delegate: CrossshareEngineDelegate?
  public private(set) var device: LocalDevice
  public let storage: FileStorage

  private let lan: LanTransport
  private let ble: BleTransport?
  private let aware = AwareTransport()
  private let lock = NSLock()
  private var lanPeers: [String: LanTransport.Found] = [:]
  private var blePeers: [String: BleTransport.Found] = [:]
  /// Nearby paired Wi-Fi Aware devices, by paired-device key.
  private var awarePeers: [String: AwareFound] = [:]
  /// Paired-device key -> Crossshare device id, learned from the first transfer's hello.
  private var awareIds: [String: String] =
    UserDefaults.standard.dictionary(forKey: "crossshare.awareIds") as? [String: String] ?? [:]
  private var awareKeyBySession: [String: String] = [:]
  private var sessions: [String: TransferSession] = [:]
  private var visible = false
  private var discovering = false
  private var lastPeers: [Peer] = []

  public init(device: LocalDevice, downloads: URL, bluetooth: Bool = true) {
    self.device = device
    storage = FileStorage(downloads: downloads)
    lan = LanTransport(local: device)
    ble = bluetooth ? BleTransport(local: device) : nil

    lan.onPeersChanged = { [weak self] found in
      self?.locked { self?.lanPeers = found }
      self?.publishPeers()
    }
    lan.onIncoming = { [weak self] stream in
      Task {
        do { try await stream.open() } catch { return }
        self?.accept(stream: stream, route: "wifi")
      }
    }
    lan.onError = { [weak self] msg in self?.report(msg) }

    ble?.onPeersChanged = { [weak self] found in
      self?.locked { self?.blePeers = found }
      self?.publishPeers()
    }
    ble?.onIncoming = { [weak self] stream in self?.accept(stream: stream, route: "bluetooth") }
    ble?.onStateChanged = { [weak self] state in
      DispatchQueue.main.async { self?.delegate?.engineDidUpdateBluetooth(state: state) }
    }

    aware.onPeersChanged = { [weak self] found in
      self?.locked { self?.awarePeers = found }
      self?.publishPeers()
    }
    aware.onIncoming = { [weak self] stream in
      Task {
        do { try await stream.open() } catch { return }
        let key = await AwareTransport.pairedDeviceKey(of: stream)
        self?.accept(stream: stream, route: "aware", awareKey: key)
      }
    }
    aware.onError = { [weak self] msg in self?.report(msg) }
  }

  /// Wi-Fi Aware needs iOS 26+, supporting hardware, and the entitlement + Info.plist services.
  public static var isWifiAwareSupported: Bool { AwareTransport.isSupported }

  // MARK: Visibility and discovery

  /// When visible, nearby devices can find this one and send to it.
  public func setVisible(_ on: Bool) {
    guard locked({ () -> Bool in
      defer { visible = on }
      return visible != on
    }) else { return }
    if on {
      lan.startListening()
      aware.startListening()
      ble?.startAdvertising()
    } else {
      lan.stopListening()
      aware.stopListening()
      ble?.stopAdvertising()
    }
  }

  public func setDiscovering(_ on: Bool) {
    guard locked({ () -> Bool in
      defer { discovering = on }
      return discovering != on
    }) else { return }
    if on {
      lan.startBrowsing()
      aware.startBrowsing()
      ble?.startScanning()
    } else {
      lan.stopBrowsing()
      aware.stopBrowsing()
      ble?.stopScanning()
    }
  }

  public func rename(_ name: String) {
    device.name = name
    lan.updateLocal(device)
    ble?.updateLocal(device)
  }

  public var peers: [Peer] {
    locked { mergedPeers() }
  }

  /// Paired Wi-Fi Aware devices we haven't exchanged a hello with yet get a placeholder id.
  private func awareId(_ key: String) -> String { awareIds[key] ?? "aware:\(key)" }

  private func awarePeer(id: String) -> AwareFound? {
    awarePeers.values.first { awareId($0.key) == id }
  }

  private func mergedPeers() -> [Peer] {
    var result: [Peer] = []
    let awareById = Dictionary(awarePeers.values.map { (awareId($0.key), $0) }, uniquingKeysWith: { a, _ in a })
    for id in Set(lanPeers.keys).union(blePeers.keys).union(awareById.keys) {
      let l = lanPeers[id]
      let b = blePeers[id]
      let a = awareById[id]
      var routes: [String] = []
      if l != nil { routes.append("wifi") }
      if a != nil { routes.append("aware") }
      if b != nil { routes.append("bluetooth") }
      result.append(
        Peer(
          id: id, name: l?.name ?? b?.name ?? a?.name ?? "Unknown device",
          platform: l?.platform ?? b?.platform ?? .ios, routes: routes))
    }
    return result.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  private func publishPeers() {
    let peers = peers
    DispatchQueue.main.async {
      guard peers != self.lastPeers else { return }
      self.lastPeers = peers
      self.delegate?.engineDidUpdatePeers(peers)
    }
  }

  // MARK: Transfers

  /// Sends files and/or text to a nearby device. Returns the transfer id.
  @discardableResult
  public func send(files: [OutgoingFile], text: String? = nil, to peerId: String) throws -> String {
    let (lanPeer, blePeer, awareFound) = locked { (lanPeers[peerId], blePeers[peerId], awarePeer(id: peerId)) }
    let id = UUID().uuidString
    let peer = Peer(
      id: peerId, name: lanPeer?.name ?? blePeer?.name ?? awareFound?.name ?? "Unknown device",
      platform: lanPeer?.platform ?? blePeer?.platform ?? .ios, routes: [])
    let session = makeSession(id: id, direction: .outgoing, peer: peer)

    if let lanPeer {
      let lan = lan
      session.startOutgoing(files: files, text: text, route: "wifi") {
        try await lan.connect(to: lanPeer.endpoint)
      }
    } else if let awareFound {
      let aware = aware
      locked { awareKeyBySession[id] = awareFound.key }
      session.startOutgoing(files: files, text: text, route: "aware") {
        try await aware.connect(to: awareFound.endpoint)
      }
    } else if blePeer != nil, let ble {
      session.startOutgoing(files: files, text: text, route: "bluetooth") {
        try await ble.connect(to: peerId)
      }
    } else {
      locked { _ = sessions.removeValue(forKey: id) }
      throw CSError.unreachable("Device is no longer nearby")
    }
    return id
  }

  /// Testing: accept connections on a fixed TCP port without Bonjour or Bluetooth.
  public func debugListen(port: UInt16) {
    locked { visible = true }
    lan.startListening(port: port)
  }

  /// Testing: send straight to a host and port.
  @discardableResult
  public func debugSend(files: [OutgoingFile], text: String? = nil, host: String, port: UInt16) -> String {
    let id = UUID().uuidString
    let session = makeSession(id: id, direction: .outgoing, peer: nil)
    let lan = lan
    session.startOutgoing(files: files, text: text, route: "wifi") {
      try await lan.connect(to: .hostPort(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port)!))
    }
    return id
  }

  public func respond(transferId: String, accept: Bool) {
    locked { sessions[transferId] }?.respond(accept: accept)
  }

  public func cancel(transferId: String) {
    locked { sessions[transferId] }?.cancel()
  }

  public func transfer(_ id: String) -> Transfer? {
    locked { sessions[id] }?.snapshot
  }

  private func accept(stream: ByteStream, route: String, awareKey: String? = nil) {
    guard locked({ visible }) else {
      stream.close()
      return
    }
    let id = UUID().uuidString
    if let awareKey { locked { awareKeyBySession[id] = awareKey } }
    let session = makeSession(id: id, direction: .incoming, peer: nil)
    session.startIncoming(stream: stream, route: route, storage: storage)
  }

  private func makeSession(id: String, direction: TransferDirection, peer: Peer?) -> TransferSession {
    let session = TransferSession(id: id, local: device, direction: direction, peer: peer)
    session.onUpdate = { [weak self] transfer in
      guard let self else { return }
      self.learnAwareId(from: transfer)
      if transfer.status.isFinal {
        // Keep finished sessions briefly so late lookups still work.
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
          self.locked { _ = self.sessions.removeValue(forKey: transfer.id) }
        }
      }
      DispatchQueue.main.async { self.delegate?.engineDidUpdateTransfer(transfer) }
    }
    session.onRequest = { [weak self] transfer in
      DispatchQueue.main.async { self?.delegate?.engineDidReceiveRequest(transfer) }
    }
    locked { sessions[id] = session }
    return session
  }

  /// Once a Wi-Fi Aware transfer's hello tells us who the paired device is, remember it so the
  /// device merges with its Wi-Fi/Bluetooth entry in the peer list.
  private func learnAwareId(from transfer: Transfer) {
    let changed = locked { () -> Bool in
      guard let key = awareKeyBySession[transfer.id], !transfer.peerId.isEmpty,
        !transfer.peerId.hasPrefix("aware:")
      else { return false }
      awareKeyBySession.removeValue(forKey: transfer.id)
      guard awareIds[key] != transfer.peerId else { return false }
      awareIds[key] = transfer.peerId
      UserDefaults.standard.set(awareIds, forKey: "crossshare.awareIds")
      return true
    }
    if changed { publishPeers() }
  }

  private func report(_ message: String) {
    log(message)
    DispatchQueue.main.async { self.delegate?.engineDidFail(message) }
  }

  private func locked<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }
}
