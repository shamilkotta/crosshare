import CryptoKit
import Foundation

/// This device's identity key and the devices it is linked with, saved across launches.
/// See "Linked devices" in docs/PROTOCOL.md.
public final class LinkStore: @unchecked Sendable {
  private static let identityKey = "crosshare.identity"
  private static let linksKey = "crosshare.links"
  private static let authLabel = Data("crosshare/v1/auth".utf8)

  private let defaults: UserDefaults
  private let lock = NSLock()
  private let identity: P256.Signing.PrivateKey
  private var links: [String: LinkedDevice]

  /// This device's identity public key, hex.
  let publicKey: String
  /// Called with the new list whenever a link is added, removed or renamed.
  var onChange: (([LinkedDevice]) -> Void)?

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    if let raw = defaults.data(forKey: Self.identityKey),
      let key = try? P256.Signing.PrivateKey(rawRepresentation: raw)
    {
      identity = key
    } else {
      identity = P256.Signing.PrivateKey()
      defaults.set(identity.rawRepresentation, forKey: Self.identityKey)
    }
    publicKey = identity.publicKey.x963Representation.hex
    let saved = defaults.data(forKey: Self.linksKey)
      .flatMap { try? JSONDecoder().decode([LinkedDevice].self, from: $0) } ?? []
    links = Dictionary(saved.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
  }

  public var all: [LinkedDevice] {
    locked { Array(links.values) }
      .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  func isLinked(_ id: String) -> Bool { locked { links[id] != nil } }

  /// Linked, and proved it holds the key we saved for it.
  func isTrusted(_ id: String, key: String?) -> Bool {
    guard let key else { return false }
    return locked { links[id]?.key == key }
  }

  func link(_ device: LinkedDevice) {
    update { $0[device.id] = device }
  }

  @discardableResult
  func unlink(_ id: String) -> LinkedDevice? {
    var removed: LinkedDevice?
    update { removed = $0.removeValue(forKey: id) }
    return removed
  }

  /// After a verified hello: drop the link if the peer no longer has us linked, else refresh its name.
  func observe(id: String, name: String, platform: CSPlatform, key: String?, theyLinkUs: Bool?) {
    guard let key, let current = locked({ links[id] }), current.key == key else { return }
    if theyLinkUs == false {
      unlink(id)
    } else if current.name != name || current.platform != platform {
      update {
        $0[id]?.name = name
        $0[id]?.platform = platform
      }
    }
  }

  // MARK: Signatures

  /// Signs the handshake transcript, binding this device's identity to the encrypted channel.
  func sign(transcript: Data, initiator: Bool) -> String {
    let sig = try? identity.signature(for: Self.signed(transcript, initiator: initiator))
    return sig?.derRepresentation.hex ?? ""
  }

  /// The peer's key if its hello carries a valid signature for this handshake, else nil.
  static func verify(_ hello: Msg, transcript: Data, initiator: Bool) -> String? {
    guard let keyHex = hello.key, let keyData = Data(hex: keyHex), let sigData = hello.sig.flatMap(Data.init(hex:)),
      let key = try? P256.Signing.PublicKey(x963Representation: keyData),
      let sig = try? P256.Signing.ECDSASignature(derRepresentation: sigData),
      key.isValidSignature(sig, for: signed(transcript, initiator: initiator))
    else { return nil }
    return keyHex
  }

  /// The code both devices show while linking. Mixes in a nonce from each side; the initiator
  /// commits to its nonce first, so a device in the middle can't steer both codes to match.
  static func code(
    transcript: Data, initiatorKey: String, responderKey: String, initiatorNonce: Data, responderNonce: Data
  ) -> String {
    let input = Data("crosshare/v1/code".utf8) + transcript + Data(hex: initiatorKey)! + Data(hex: responderKey)!
      + initiatorNonce + responderNonce
    let n = Data(SHA256.hash(data: input)).prefix(4).reduce(UInt32(0)) { $0 << 8 | UInt32($1) }
    return String(format: "%06d", n % 1_000_000)
  }

  static func nonce() -> Data {
    Data((0..<32).map { _ in UInt8.random(in: 0...255) })
  }

  static func commitment(_ nonce: Data) -> String { Data(SHA256.hash(data: nonce)).hex }

  private static func signed(_ transcript: Data, initiator: Bool) -> Data {
    authLabel + transcript + Data((initiator ? "i" : "r").utf8)
  }

  // MARK: Storage

  private func update(_ change: (inout [String: LinkedDevice]) -> Void) {
    let list: [LinkedDevice]? = locked {
      let before = links
      change(&links)
      guard links != before else { return nil }
      defaults.set(try? JSONEncoder().encode(Array(links.values)), forKey: Self.linksKey)
      return Array(links.values)
    }
    if list != nil { onChange?(all) }
  }

  private func locked<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }
}

extension Data {
  var hex: String { map { String(format: "%02x", $0) }.joined() }

  init?(hex: String) {
    guard hex.count % 2 == 0 else { return nil }
    var data = Data(capacity: hex.count / 2)
    var index = hex.startIndex
    while index < hex.endIndex {
      let next = hex.index(index, offsetBy: 2)
      guard let byte = UInt8(hex[index..<next], radix: 16) else { return nil }
      data.append(byte)
      index = next
    }
    self = data
  }
}
