import Foundation
import Network

/// Bonjour discovery and TCP connections. With peer-to-peer enabled this also
/// covers Apple devices that share no network (AWDL).
final class LanTransport: @unchecked Sendable {
  struct Found {
    let id: String
    let name: String
    let platform: CSPlatform
    let endpoint: NWEndpoint
  }

  private var local: LocalDevice
  private let queue = DispatchQueue(label: "crosshare.lan")
  private var listener: NWListener?
  private var browser: NWBrowser?

  /// Peers currently visible, keyed by device id. Replaced wholesale on every browse change.
  var onPeersChanged: (([String: Found]) -> Void)?
  var onIncoming: ((NWByteStream) -> Void)?
  var onError: ((String) -> Void)?

  init(local: LocalDevice) {
    self.local = local
  }

  private static func parameters() -> NWParameters {
    let tcp = NWProtocolTCP.Options()
    tcp.noDelay = true
    tcp.enableKeepalive = true
    tcp.keepaliveIdle = 10
    let params = NWParameters(tls: nil, tcp: tcp)
    params.includePeerToPeer = true
    return params
  }

  // MARK: Listening / advertising

  func startListening(port: UInt16? = nil) {
    guard listener == nil else { return }
    do {
      let listener: NWListener
      if let port, let nwPort = NWEndpoint.Port(rawValue: port) {
        // Fixed port without Bonjour; used by tests.
        listener = try NWListener(using: .tcp, on: nwPort)
      } else {
        listener = try NWListener(using: Self.parameters())
      }
      var txt = NWTXTRecord()
      txt["id"] = local.id
      txt["name"] = local.name
      txt["platform"] = local.platform.rawValue
      txt["v"] = "1"
      if port == nil {
        listener.service = NWListener.Service(name: local.id, type: Constants.serviceType, txtRecord: txt)
      }
      listener.newConnectionHandler = { [weak self] conn in
        self?.onIncoming?(NWByteStream(conn))
      }
      listener.stateUpdateHandler = { [weak self] state in
        if case .failed(let error) = state {
          self?.onError?("Listener failed: \(error)")
          self?.queue.asyncAfter(deadline: .now() + 2) {
            self?.stopListening()
            self?.startListening()
          }
        }
      }
      listener.start(queue: queue)
      self.listener = listener
    } catch {
      onError?("Could not start listener: \(error)")
    }
  }

  func stopListening() {
    listener?.cancel()
    listener = nil
  }

  /// Re-announces with a new name if we are listening.
  func updateLocal(_ device: LocalDevice) {
    local = device
    if listener != nil {
      stopListening()
      startListening()
    }
  }

  // MARK: Browsing

  func startBrowsing() {
    guard browser == nil else { return }
    let browser = NWBrowser(
      for: .bonjourWithTXTRecord(type: Constants.serviceType, domain: nil), using: Self.parameters())
    browser.browseResultsChangedHandler = { [weak self] results, _ in
      self?.handle(results)
    }
    browser.stateUpdateHandler = { [weak self] state in
      if case .failed(let error) = state {
        self?.onError?("Browser failed: \(error)")
      }
    }
    browser.start(queue: queue)
    self.browser = browser
  }

  func stopBrowsing() {
    browser?.cancel()
    browser = nil
    onPeersChanged?([:])
  }

  private func handle(_ results: Set<NWBrowser.Result>) {
    var found: [String: Found] = [:]
    for result in results {
      guard case .bonjour(let txt) = result.metadata, let id = txt["id"], id != local.id else { continue }
      found[id] = Found(
        id: id,
        name: txt["name"] ?? "Unknown device",
        platform: CSPlatform(rawValue: txt["platform"] ?? "") ?? .ios,
        endpoint: result.endpoint)
    }
    onPeersChanged?(found)
  }

  func connect(to endpoint: NWEndpoint) async throws -> ByteStream {
    let stream = NWByteStream(NWConnection(to: endpoint, using: Self.parameters()))
    try await stream.open()
    return stream
  }
}
