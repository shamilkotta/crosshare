import Foundation

public enum CSPlatform: String, Codable {
  case ios, android, macos

  public static var current: CSPlatform {
    #if os(macOS)
    return .macos
    #else
    return .ios
    #endif
  }
}

public struct LocalDevice {
  public var id: String
  public var name: String
  public var platform: CSPlatform

  public init(id: String, name: String, platform: CSPlatform = .current) {
    self.id = id
    self.name = name
    self.platform = platform
  }
}

/// A nearby device, possibly reachable over several routes.
public struct Peer: Equatable, Identifiable {
  public let id: String
  public let name: String
  public let platform: CSPlatform
  /// Routes this peer is reachable on, best first: "wifi", "aware", "bluetooth".
  public let routes: [String]
}

/// A device both sides agreed to link. Text from it is accepted without asking.
public struct LinkedDevice: Codable, Equatable, Identifiable {
  public let id: String
  public var name: String
  public var platform: CSPlatform
  /// Its identity public key (hex, uncompressed P-256).
  public let key: String
}

public enum TransferKind: String {
  /// Files and/or text.
  case transfer
  /// A request to link the two devices.
  case link
  /// Tells the peer this device removed the link. Never shown to the user.
  case unlink
}

public enum TransferDirection: String {
  case outgoing, incoming
}

public enum TransferStatus: String {
  case connecting, waiting, upgrading, transferring, completed, declined, failed, cancelled

  public var isFinal: Bool {
    switch self {
    case .completed, .declined, .failed, .cancelled: return true
    default: return false
    }
  }
}

public struct TransferFile {
  public let name: String
  public let size: Int64
  public var transferred: Int64
  /// Where the received file was saved (incoming, completed only).
  public var savedURL: URL?
}

public struct Transfer {
  public let id: String
  public let direction: TransferDirection
  public var peerId: String
  public var peerName: String
  public var peerPlatform: CSPlatform
  public var status: TransferStatus
  public var files: [TransferFile]
  public var text: String?
  public var kind: TransferKind
  /// Incoming text from a linked device, accepted without asking.
  public var trusted: Bool
  /// Link requests: six digits both devices show. The users confirm they match.
  public var code: String?
  /// "wifi", "aware" (Wi-Fi Aware), "bluetooth" or "hotspot".
  public var transport: String
  public var error: String?

  public var totalBytes: Int64 { files.reduce(0) { $0 + $1.size } }
  public var transferredBytes: Int64 { files.reduce(0) { $0 + $1.transferred } }
}

/// A file to send.
public struct OutgoingFile {
  public let url: URL
  public let name: String
  public let size: Int64
  public let mime: String?

  public init(url: URL, name: String? = nil, mime: String? = nil) throws {
    self.url = url
    self.name = name ?? url.lastPathComponent
    let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
    self.size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
    self.mime = mime
  }
}

// MARK: - Wire messages

struct WireFile: Codable {
  var name: String
  var size: Int64
  var mime: String?
}

/// One JSON message on the wire. All fields but `t` are optional; see docs/PROTOCOL.md.
struct Msg: Codable {
  var t: String
  var id: String?
  var name: String?
  var platform: String?
  var v: Int?
  var canHost: Bool?
  var canJoin: Bool?
  var transferId: String?
  var files: [WireFile]?
  var text: String?
  var ssid: String?
  var passphrase: String?
  var host: String?
  var port: Int?
  var token: String?
  var reason: String?
  /// hello: identity public key (hex) and its signature over the handshake (hex DER).
  var key: String?
  var sig: String?
  /// hello: whether the sender has the receiver linked.
  var linked: Bool?
  /// offer: "link" or "unlink"; absent for a normal transfer.
  var kind: String?
  /// Link offers: SHA256 of the initiator's nonce, hex. linkNonce / linkReveal: a nonce, hex.
  var commit: String?
  var nonce: String?

  init(_ t: String) { self.t = t }

  static func hello(_ d: LocalDevice) -> Msg {
    var m = Msg("hello")
    m.id = d.id
    m.name = d.name
    m.platform = d.platform.rawValue
    m.v = 1
    m.canHost = false
    m.canJoin = HotspotJoiner.isSupported
    return m
  }
}

public enum CSError: Error, LocalizedError {
  case closed
  case protocolError(String)
  case timeout
  case cancelled
  case unreachable(String)

  public var errorDescription: String? {
    switch self {
    case .closed: return "Connection closed"
    case .protocolError(let s): return "Protocol error: \(s)"
    case .timeout: return "Timed out"
    case .cancelled: return "Cancelled"
    case .unreachable(let s): return s
    }
  }
}

enum Constants {
  static let serviceType = "_crosshare._tcp"
  static let bleService = "0B5E1C9A-3F2D-4E8B-9A71-6C4D2E8F1A30"
  static let bleInfoCharacteristic = "0B5E1C9A-3F2D-4E8B-9A71-6C4D2E8F1A31"
  static let upgradeThreshold: Int64 = 2 * 1024 * 1024
  static let chunkSize = 128 * 1024
  static let bleChunkSize = 16 * 1024
  static let maxFrame = 1024 * 1024 + 64
}

func log(_ s: @autoclosure () -> String) {
  #if DEBUG
  print("[Crosshare] \(s())")
  #endif
}

/// A flag that can be claimed exactly once, from any thread.
final class Once: @unchecked Sendable {
  private let lock = NSLock()
  private var done = false

  func claim() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if done { return false }
    done = true
    return true
  }
}

/// Runs `op` but throws `CSError.timeout` if it takes longer than `seconds`.
/// Returns promptly on timeout even if `op` ignores cancellation.
func withTimeout<T>(_ seconds: Double, _ op: @escaping () async throws -> T) async throws -> T {
  try await withCheckedThrowingContinuation { cont in
    let once = Once()
    let task = Task {
      do {
        let value = try await op()
        if once.claim() { cont.resume(returning: value) }
      } catch {
        if once.claim() { cont.resume(throwing: error) }
      }
    }
    DispatchQueue.global().asyncAfter(deadline: .now() + seconds) {
      if once.claim() {
        task.cancel()
        cont.resume(throwing: CSError.timeout)
      }
    }
  }
}
