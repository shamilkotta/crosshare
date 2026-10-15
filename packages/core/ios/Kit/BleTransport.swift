@preconcurrency import CoreBluetooth
import Foundation

/// Bluetooth LE discovery (GATT info characteristic) and L2CAP channels for data.
/// Works between any two devices in radio range, with or without Wi-Fi.
final class BleTransport: NSObject, @unchecked Sendable {
  struct Found: @unchecked Sendable {
    let id: String
    let name: String
    let platform: CSPlatform
    let psm: CBL2CAPPSM
    let peripheral: CBPeripheral
    var lastSeen: Date
  }

  private let queue = DispatchQueue(label: "crossshare.ble")
  private var local: LocalDevice
  private let serviceUUID = CBUUID(string: Constants.bleService)
  private let infoUUID = CBUUID(string: Constants.bleInfoCharacteristic)

  private var central: CBCentralManager?
  private var peripheralManager: CBPeripheralManager?
  private var wantScan = false
  private var wantAdvertise = false
  private var publishedPSM: CBL2CAPPSM?
  private var advertisedService: CBMutableService?

  // Discovery state (queue only)
  private var known: [UUID: Found] = [:]
  private var seen: [UUID: CBPeripheral] = [:]
  private var fetching: [UUID: Date] = [:]
  private var lastFetchFailure: [UUID: Date] = [:]
  private var pruneTimer: DispatchSourceTimer?

  // Outgoing connections (queue only)
  private var connectWaiters: [UUID: (Result<Void, Error>) -> Void] = [:]
  private var channelWaiters: [UUID: (Result<CBL2CAPChannel, Error>) -> Void] = [:]
  private var sending: Set<UUID> = []

  var onPeersChanged: (([String: Found]) -> Void)?
  var onIncoming: ((FoundationByteStream) -> Void)?
  var onStateChanged: ((String) -> Void)?

  init(local: LocalDevice) {
    self.local = local
    super.init()
  }

  // MARK: Public controls

  func startScanning() {
    queue.async {
      self.wantScan = true
      if self.central == nil {
        self.central = CBCentralManager(
          delegate: self, queue: self.queue, options: [CBCentralManagerOptionShowPowerAlertKey: false])
      } else {
        self.scanIfReady()
      }
      self.startPruning()
    }
  }

  func stopScanning() {
    queue.async {
      self.wantScan = false
      if self.central?.state == .poweredOn { self.central?.stopScan() }
      self.pruneTimer?.cancel()
      self.pruneTimer = nil
      self.known.removeAll()
      self.emit()
    }
  }

  func startAdvertising() {
    queue.async {
      self.wantAdvertise = true
      if self.peripheralManager == nil {
        self.peripheralManager = CBPeripheralManager(delegate: self, queue: self.queue)
      } else {
        self.advertiseIfReady()
      }
    }
  }

  func stopAdvertising() {
    queue.async {
      self.wantAdvertise = false
      self.teardownAdvertising()
    }
  }

  func updateLocal(_ device: LocalDevice) {
    queue.async {
      self.local = device
      if self.wantAdvertise {
        self.teardownAdvertising()
        self.advertiseIfReady()
      }
    }
  }

  // MARK: Outgoing L2CAP

  func connect(to peerId: String) async throws -> ByteStream {
    let target: Found = try await withCheckedThrowingContinuation { cont in
      queue.async {
        let match = self.known.values.filter { $0.id == peerId && $0.psm != 0 }.max { $0.lastSeen < $1.lastSeen }
        if let match { cont.resume(returning: match) } else {
          cont.resume(throwing: CSError.unreachable("Device is no longer nearby"))
        }
      }
    }
    let peripheral = target.peripheral
    let pid = peripheral.identifier

    let channel: CBL2CAPChannel
    do {
      try await withTimeout(15) {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
          self.queue.async {
            self.sending.insert(pid)
            if peripheral.state == .connected {
              cont.resume()
              return
            }
            self.connectWaiters[pid] = { cont.resume(with: $0) }
            self.central?.connect(peripheral)
          }
        }
      }
      channel = try await withTimeout(15) {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<CBL2CAPChannel, Error>) in
          self.queue.async {
            peripheral.delegate = self
            self.channelWaiters[pid] = { cont.resume(with: $0) }
            peripheral.openL2CAPChannel(target.psm)
          }
        }
      }
    } catch {
      queue.async { self.release(peripheral) }
      throw error
    }

    return FoundationByteStream(
      input: channel.inputStream, output: channel.outputStream, owner: channel,
      onClose: { [weak self] in self?.queue.async { self?.release(peripheral) } })
  }

  private func release(_ peripheral: CBPeripheral) {
    sending.remove(peripheral.identifier)
    connectWaiters.removeValue(forKey: peripheral.identifier)?(.failure(CSError.closed))
    channelWaiters.removeValue(forKey: peripheral.identifier)?(.failure(CSError.closed))
    central?.cancelPeripheralConnection(peripheral)
  }

  // MARK: Internals (queue only)

  private func scanIfReady() {
    guard wantScan, let central, central.state == .poweredOn, !central.isScanning else { return }
    central.scanForPeripherals(
      withServices: [serviceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
  }

  private func advertiseIfReady() {
    guard wantAdvertise, let pm = peripheralManager, pm.state == .poweredOn else { return }
    if publishedPSM == nil {
      // The service is added once the channel is published (we need its PSM).
      pm.publishL2CAPChannel(withEncryption: false)
      return
    }
    guard advertisedService == nil else { return }
    let info: [String: Any] = [
      "id": local.id, "name": local.name, "platform": local.platform.rawValue, "v": 1,
      "psm": Int(publishedPSM ?? 0),
    ]
    let value = try? JSONSerialization.data(withJSONObject: info)
    let characteristic = CBMutableCharacteristic(
      type: infoUUID, properties: [.read], value: value, permissions: [.readable])
    let service = CBMutableService(type: serviceUUID, primary: true)
    service.characteristics = [characteristic]
    advertisedService = service
    pm.add(service)
  }

  private func teardownAdvertising() {
    guard let pm = peripheralManager else { return }
    if pm.isAdvertising { pm.stopAdvertising() }
    if pm.state == .poweredOn {
      pm.removeAllServices()
      if let psm = publishedPSM { pm.unpublishL2CAPChannel(psm) }
    }
    advertisedService = nil
    publishedPSM = nil
  }

  private func startPruning() {
    guard pruneTimer == nil else { return }
    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(deadline: .now() + 5, repeating: 5)
    timer.setEventHandler { [weak self] in self?.prune() }
    timer.resume()
    pruneTimer = timer
  }

  private func prune() {
    let cutoff = Date().addingTimeInterval(-20)
    let before = known.count
    known = known.filter { $0.value.lastSeen > cutoff || sending.contains($0.key) }
    seen = seen.filter { known[$0.key] != nil || fetching[$0.key] != nil }
    // Give up on GATT fetches that hang.
    for (id, started) in fetching where started < Date().addingTimeInterval(-10) {
      fetching.removeValue(forKey: id)
      lastFetchFailure[id] = Date()
      if let p = seen[id], !sending.contains(id) { central?.cancelPeripheralConnection(p) }
    }
    if known.count != before { emit() }
  }

  private func emit() {
    var byId: [String: Found] = [:]
    for f in known.values where f.psm != 0 {
      if let existing = byId[f.id], existing.lastSeen > f.lastSeen { continue }
      byId[f.id] = f
    }
    onPeersChanged?(byId)
  }

  private func fetchInfo(_ peripheral: CBPeripheral) {
    let pid = peripheral.identifier
    guard fetching[pid] == nil, fetching.count < 2 else { return }
    if let failed = lastFetchFailure[pid], failed > Date().addingTimeInterval(-15) { return }
    fetching[pid] = Date()
    peripheral.delegate = self
    central?.connect(peripheral)
  }

  private func fetchFailed(_ peripheral: CBPeripheral) {
    let pid = peripheral.identifier
    guard fetching.removeValue(forKey: pid) != nil else { return }
    lastFetchFailure[pid] = Date()
    if !sending.contains(pid) { central?.cancelPeripheralConnection(peripheral) }
  }
}

// MARK: - CBCentralManagerDelegate

extension BleTransport: CBCentralManagerDelegate {
  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    onStateChanged?(Self.describe(central.state))
    if central.state == .poweredOn {
      scanIfReady()
    } else {
      known.removeAll()
      fetching.removeAll()
      emit()
    }
  }

  func centralManager(
    _ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any], rssi RSSI: NSNumber
  ) {
    let pid = peripheral.identifier
    seen[pid] = peripheral
    if known[pid] != nil {
      known[pid]?.lastSeen = Date()
    } else {
      fetchInfo(peripheral)
    }
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    let pid = peripheral.identifier
    if let waiter = connectWaiters.removeValue(forKey: pid) {
      waiter(.success(()))
    }
    if fetching[pid] != nil {
      peripheral.discoverServices([serviceUUID])
    }
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    connectWaiters.removeValue(forKey: peripheral.identifier)?(
      .failure(error ?? CSError.unreachable("Bluetooth connection failed")))
    fetchFailed(peripheral)
  }

  func centralManager(
    _ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?
  ) {
    let pid = peripheral.identifier
    connectWaiters.removeValue(forKey: pid)?(.failure(error ?? CSError.closed))
    channelWaiters.removeValue(forKey: pid)?(.failure(error ?? CSError.closed))
    if fetching[pid] != nil { fetchFailed(peripheral) }
  }
}

// MARK: - CBPeripheralDelegate (remote device we connected to)

extension BleTransport: CBPeripheralDelegate {
  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard let service = peripheral.services?.first(where: { $0.uuid == serviceUUID }) else {
      fetchFailed(peripheral)
      return
    }
    peripheral.discoverCharacteristics([infoUUID], for: service)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard let c = service.characteristics?.first(where: { $0.uuid == infoUUID }) else {
      fetchFailed(peripheral)
      return
    }
    peripheral.readValue(for: c)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    let pid = peripheral.identifier
    guard characteristic.uuid == infoUUID, fetching[pid] != nil else { return }
    guard let data = characteristic.value,
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let id = json["id"] as? String
    else {
      fetchFailed(peripheral)
      return
    }
    fetching.removeValue(forKey: pid)
    if !sending.contains(pid) { central?.cancelPeripheralConnection(peripheral) }
    guard id != local.id else { return }
    known[pid] = Found(
      id: id,
      name: json["name"] as? String ?? "Unknown device",
      platform: CSPlatform(rawValue: json["platform"] as? String ?? "") ?? .android,
      psm: CBL2CAPPSM((json["psm"] as? NSNumber)?.uint16Value ?? 0),
      peripheral: peripheral,
      lastSeen: Date())
    emit()
  }

  func peripheral(_ peripheral: CBPeripheral, didOpen channel: CBL2CAPChannel?, error: Error?) {
    let waiter = channelWaiters.removeValue(forKey: peripheral.identifier)
    if let channel {
      waiter?(.success(channel))
    } else {
      waiter?(.failure(error ?? CSError.unreachable("Could not open Bluetooth channel")))
    }
  }
}

// MARK: - CBPeripheralManagerDelegate (we are discoverable)

extension BleTransport: CBPeripheralManagerDelegate {
  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    if peripheral.state == .poweredOn {
      advertiseIfReady()
    } else {
      advertisedService = nil
      publishedPSM = nil
    }
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didPublishL2CAPChannel PSM: CBL2CAPPSM, error: Error?) {
    if let error {
      log("L2CAP publish failed: \(error)")
      return
    }
    publishedPSM = PSM
    advertiseIfReady()
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
    if let error {
      log("Adding BLE service failed: \(error)")
      return
    }
    guard wantAdvertise else { return }
    peripheral.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [serviceUUID]])
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didOpen channel: CBL2CAPChannel?, error: Error?) {
    guard let channel else { return }
    onIncoming?(FoundationByteStream(input: channel.inputStream, output: channel.outputStream, owner: channel))
  }

  private static func describe(_ state: CBManagerState) -> String {
    switch state {
    case .poweredOn: return "on"
    case .poweredOff: return "off"
    case .unauthorized: return "unauthorized"
    case .unsupported: return "unsupported"
    default: return "unknown"
    }
  }
}
