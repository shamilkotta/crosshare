import Foundation
import Network

/// One transfer (outgoing or incoming) over one connection. See docs/PROTOCOL.md for the flow.
final class TransferSession: @unchecked Sendable {
  let id: String
  private let local: LocalDevice
  private let lock = NSLock()
  private var state: Transfer
  private var channel: SecureChannel?
  private var task: Task<Void, Never>?
  private var decision: ((Bool) -> Void)?
  private var joinedSSID: String?
  private var lastEmit = Date.distantPast

  /// Called with every state change (throttled for progress).
  var onUpdate: ((Transfer) -> Void)?
  /// Called once for incoming transfers when the offer arrives and the user must decide.
  var onRequest: ((Transfer) -> Void)?

  var snapshot: Transfer {
    lock.lock()
    defer { lock.unlock() }
    return state
  }

  init(id: String, local: LocalDevice, direction: TransferDirection, peer: Peer?) {
    self.id = id
    self.local = local
    state = Transfer(
      id: id, direction: direction,
      peerId: peer?.id ?? "", peerName: peer?.name ?? "", peerPlatform: peer?.platform ?? .ios,
      status: .connecting, files: [], text: nil, transport: "wifi", error: nil)
  }

  // MARK: State

  private func mutate(force: Bool = true, _ change: (inout Transfer) -> Void) {
    lock.lock()
    if state.status.isFinal {
      lock.unlock()
      return
    }
    change(&state)
    let now = Date()
    let emit = force || state.status.isFinal || now.timeIntervalSince(lastEmit) > 0.1
    if emit { lastEmit = now }
    let snap = state
    lock.unlock()
    if emit { onUpdate?(snap) }
  }

  private func finish(_ status: TransferStatus, error: String? = nil) {
    mutate {
      $0.status = status
      $0.error = error
    }
    channel?.close()
    if let ssid = joinedSSID {
      joinedSSID = nil
      HotspotJoiner.leave(ssid: ssid)
    }
  }

  private var isFinal: Bool { snapshot.status.isFinal }

  func cancel() {
    guard !isFinal else { return }
    let ch = channel
    finish(.cancelled)
    resolveDecision(false)
    task?.cancel()
    if let ch {
      Task { try? await ch.send(Msg("cancel")) }
    }
  }

  func respond(accept: Bool) {
    resolveDecision(accept)
  }

  private func resolveDecision(_ accept: Bool) {
    lock.lock()
    let d = decision
    decision = nil
    lock.unlock()
    d?(accept)
  }

  // MARK: Outgoing

  func startOutgoing(
    files: [OutgoingFile], text: String?, route: String,
    connect: @escaping () async throws -> ByteStream
  ) {
    mutate {
      $0.files = files.map { TransferFile(name: $0.name, size: $0.size, transferred: 0) }
      $0.text = text
      $0.transport = route
    }
    task = Task { [self] in
      do {
        try await runOutgoing(files: files, text: text, isBle: route == "bluetooth", connect: connect)
      } catch {
        if !isFinal {
          if case CSError.cancelled = error {
            finish(.cancelled)
          } else {
            finish(.failed, error: error.localizedDescription)
          }
        }
      }
    }
  }

  private func runOutgoing(
    files: [OutgoingFile], text: String?, isBle: Bool,
    connect: @escaping () async throws -> ByteStream
  ) async throws {
    let stream = try await connect()
    let ch = try await withTimeout(20) { try await SecureChannel.establish(over: stream, initiator: true) }
    channel = ch
    if isFinal { ch.close(); return }

    try await ch.send(Msg.hello(local))
    let hello = try await withTimeout(20) { try await ch.receiveMessage() }
    guard hello.t == "hello" else { throw CSError.protocolError("expected hello") }
    mutate {
      $0.peerId = hello.id ?? $0.peerId
      $0.peerName = hello.name ?? $0.peerName
    }

    var offer = Msg("offer")
    offer.transferId = id
    offer.files = files.map { WireFile(name: $0.name, size: $0.size, mime: $0.mime) }
    offer.text = text
    try await ch.send(offer)
    mutate { $0.status = .waiting }

    // The receiver has up to two minutes to decide.
    let answer = try await withTimeout(150) { try await ch.receiveMessage() }
    if answer.t == "decline" {
      finish(.declined)
      return
    }
    guard answer.t == "accept" else { throw CSError.protocolError("expected accept") }

    var current = ch
    let total = files.reduce(Int64(0)) { $0 + $1.size }
    if isBle, total > Constants.upgradeThreshold, hello.canHost == true, HotspotJoiner.isSupported {
      mutate { $0.status = .upgrading }
      try await ch.send(Msg("upgradeRequest"))
      let reply = try await withTimeout(30) { try await ch.receiveMessage() }
      if reply.t == "upgradeOffer" {
        if let upgraded = await joinUpgrade(reply) {
          ch.close()
          current = upgraded
          channel = upgraded
        } else {
          try await ch.send(Msg("upgradeFailed"))
        }
      }
    }

    mutate { $0.status = .transferring }

    // Watch for the receiver's "complete" or "cancel" while we stream.
    let reader = Task { () -> Msg in
      // A late "upgradeFailed" from an abandoned upgrade can still be in flight; skip it.
      while true {
        let msg = try await current.receiveMessage()
        if !msg.t.hasPrefix("upgrade") { return msg }
      }
    }
    Task { [weak self] in
      guard case .failure(let error) = await reader.result, let self, !self.isFinal else { return }
      if case CSError.cancelled = error {
        self.finish(.cancelled)
      } else {
        // The link dropped; unblock any pending write.
        current.close()
      }
    }

    let chunkSize = isBle && current === ch ? Constants.bleChunkSize : Constants.chunkSize
    for (index, file) in files.enumerated() {
      let handle = try FileHandle(forReadingFrom: file.url)
      defer { try? handle.close() }
      var sent: Int64 = 0
      while sent < file.size {
        try Task.checkCancellation()
        let want = Int(min(Int64(chunkSize), file.size - sent))
        guard let chunk = try handle.read(upToCount: want), !chunk.isEmpty else {
          throw CSError.protocolError("\(file.name) changed while sending")
        }
        try await current.sendData(chunk)
        sent += Int64(chunk.count)
        let done = sent
        mutate(force: false) { $0.files[index].transferred = done }
      }
    }
    try await current.send(Msg("done"))

    let final = try await withTimeout(60) { try await reader.value }
    guard final.t == "complete" else { throw CSError.protocolError("expected complete") }
    finish(.completed)
  }

  // MARK: Incoming

  func startIncoming(stream: ByteStream, route: String, storage: FileStorage) {
    mutate { $0.transport = route }
    task = Task { [self] in
      do {
        try await runIncoming(stream: stream, isBle: route == "bluetooth", storage: storage)
      } catch {
        storage.discard(transferId: id)
        if !isFinal {
          if case CSError.cancelled = error {
            finish(.cancelled)
          } else {
            finish(.failed, error: error.localizedDescription)
          }
        }
      }
    }
  }

  private func runIncoming(stream: ByteStream, isBle: Bool, storage: FileStorage) async throws {
    let ch = try await withTimeout(20) { try await SecureChannel.establish(over: stream, initiator: false) }
    channel = ch
    let hello = try await withTimeout(20) { try await ch.receiveMessage() }
    guard hello.t == "hello" else { throw CSError.protocolError("expected hello") }
    try await ch.send(Msg.hello(local))

    let offer = try await withTimeout(20) { try await ch.receiveMessage() }
    guard offer.t == "offer" else { throw CSError.protocolError("expected offer") }
    let wireFiles = offer.files ?? []
    mutate {
      $0.peerId = hello.id ?? ""
      $0.peerName = hello.name ?? "Unknown device"
      $0.peerPlatform = CSPlatform(rawValue: hello.platform ?? "") ?? .ios
      $0.files = wireFiles.map { TransferFile(name: $0.name, size: max(0, $0.size), transferred: 0) }
      $0.text = offer.text
      $0.status = .waiting
    }

    // Read the next frame while the user decides, so a sender cancel dismisses the prompt.
    let firstFrame = Task { () -> Frame in try await ch.receive() }
    let senderGone = Once()
    let accepted: Bool = await withCheckedContinuation { cont in
      let once = Once()
      let resolve: (Bool) -> Void = { value in if once.claim() { cont.resume(returning: value) } }
      lock.lock()
      decision = resolve
      lock.unlock()
      Task {
        let result = await firstFrame.result
        if case .success(.message(let m)) = result, m.t != "cancel" { return }
        if case .success(.data) = result { return }
        _ = senderGone.claim()
        self.resolveDecision(false)
      }
      DispatchQueue.global().asyncAfter(deadline: .now() + 120) { self.resolveDecision(false) }
      onRequest?(snapshot)
    }
    if isFinal { return }
    if !senderGone.claim() {
      finish(.cancelled)
      return
    }
    guard accepted else {
      try? await ch.send(Msg("decline"))
      finish(.declined)
      return
    }
    try await ch.send(Msg("accept"))
    mutate { $0.status = .transferring }

    let sink = try storage.beginReceiving(transferId: id, files: wireFiles)
    var current = ch
    var pending: Frame? = try await firstFrame.value
    var index = sink.nextIndex(from: 0)

    while true {
      let frame: Frame
      if let p = pending {
        frame = p
        pending = nil
      } else {
        frame = try await current.receive()
      }
      switch frame {
      case .data(let data):
        guard index < wireFiles.count else { throw CSError.protocolError("unexpected data") }
        let written = try sink.write(data, to: index)
        let fileIndex = index
        mutate(force: false) { $0.files[fileIndex].transferred = written }
        if written >= wireFiles[index].size {
          try sink.closeFile(index)
          index = sink.nextIndex(from: index + 1)
        }
      case .message(let msg):
        switch msg.t {
        case "upgradeOffer":
          if let upgraded = await joinUpgrade(msg) {
            current.close()
            current = upgraded
            channel = upgraded
            mutate { $0.status = .transferring }
          } else {
            mutate { $0.status = .transferring }
            try await current.send(Msg("upgradeFailed"))
          }
        case "upgradeRequest":
          // Apple devices can't host a hotspot.
          try await current.send(Msg("upgradeFailed"))
        case "done":
          guard index >= wireFiles.count else { throw CSError.protocolError("transfer ended early") }
          let urls = try storage.finish(transferId: id, sink: sink)
          mutate {
            for (i, url) in urls.enumerated() where i < $0.files.count {
              $0.files[i].savedURL = url
            }
          }
          try await current.send(Msg("complete"))
          finish(.completed)
          return
        case "cancel":
          throw CSError.cancelled
        default:
          break
        }
      }
    }
  }

  // MARK: Bandwidth upgrade (joiner side)

  private func joinUpgrade(_ offer: Msg) async -> SecureChannel? {
    guard let ssid = offer.ssid, let host = offer.host, let port = offer.port,
      let token = offer.token, let nwPort = NWEndpoint.Port(rawValue: UInt16(clamping: port))
    else { return nil }
    mutate { $0.status = .upgrading }
    do {
      try await withTimeout(45) { try await HotspotJoiner.join(ssid: ssid, passphrase: offer.passphrase ?? "") }
      joinedSSID = ssid

      var lastError: Error = CSError.timeout
      for _ in 0..<6 {
        let params = NWParameters.tcp
        params.requiredInterfaceType = .wifi
        let stream = NWByteStream(NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: params))
        do {
          try await stream.open(timeout: 5)
          let ch = try await withTimeout(15) { try await SecureChannel.establish(over: stream, initiator: true) }
          var join = Msg("upgradeJoin")
          join.token = token
          try await ch.send(join)
          let ok = try await withTimeout(15) { try await ch.receiveMessage() }
          guard ok.t == "upgradeOk" else { throw CSError.protocolError("upgrade rejected") }
          mutate { $0.transport = "hotspot" }
          return ch
        } catch {
          stream.close()
          lastError = error
          try await Task.sleep(nanoseconds: 1_000_000_000)
        }
      }
      throw lastError
    } catch {
      log("upgrade failed: \(error)")
      if let ssid = joinedSSID {
        joinedSSID = nil
        HotspotJoiner.leave(ssid: ssid)
      }
      return nil
    }
  }
}
