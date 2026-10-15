import CryptoKit
import Foundation

enum Frame {
  case message(Msg)
  case data(Data)
}

/// Encrypted, framed messages over a ByteStream. See docs/PROTOCOL.md.
final class SecureChannel: @unchecked Sendable {
  let stream: ByteStream
  private let sendKey: SymmetricKey
  private let recvKey: SymmetricKey
  private let lock = NSLock()
  private var sendCounter: UInt64 = 0
  private var recvCounter: UInt64 = 0

  private static let magic = Data("CSH1".utf8)
  private static let frameMessage: UInt8 = 1
  private static let frameData: UInt8 = 2

  private init(stream: ByteStream, sendKey: SymmetricKey, recvKey: SymmetricKey) {
    self.stream = stream
    self.sendKey = sendKey
    self.recvKey = recvKey
  }

  static func establish(over stream: ByteStream, initiator: Bool) async throws -> SecureChannel {
    let priv = P256.KeyAgreement.PrivateKey()
    let ownPub = priv.publicKey.x963Representation
    try await stream.write(magic + ownPub)

    let hello = try await stream.read(exactly: 4 + 65)
    guard hello.prefix(4) == magic else { throw CSError.protocolError("bad handshake magic") }
    let peerPub = Data(hello.suffix(65))
    let peerKey = try P256.KeyAgreement.PublicKey(x963Representation: peerPub)
    let shared = try priv.sharedSecretFromKeyAgreement(with: peerKey)

    let (iPub, rPub) = initiator ? (ownPub, peerPub) : (peerPub, ownPub)
    let salt = Data(SHA256.hash(data: iPub + rPub))
    func key(_ info: String) -> SymmetricKey {
      shared.hkdfDerivedSymmetricKey(
        using: SHA256.self, salt: salt, sharedInfo: Data(info.utf8), outputByteCount: 32)
    }
    let i2r = key("crosshare/v1/i2r")
    let r2i = key("crosshare/v1/r2i")
    return SecureChannel(
      stream: stream, sendKey: initiator ? i2r : r2i, recvKey: initiator ? r2i : i2r)
  }

  private static func nonce(_ counter: UInt64) -> AES.GCM.Nonce {
    var bytes = Data(count: 4)
    withUnsafeBytes(of: counter.bigEndian) { bytes.append(contentsOf: $0) }
    return try! AES.GCM.Nonce(data: bytes)
  }

  // MARK: Sending

  private func sendFrame(type: UInt8, body: Data) async throws {
    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      // Seal and enqueue under the lock so nonces match the order on the wire.
      lock.lock()
      do {
        var plain = Data(capacity: body.count + 1)
        plain.append(type)
        plain.append(body)
        let box = try AES.GCM.seal(plain, using: sendKey, nonce: Self.nonce(sendCounter))
        sendCounter += 1
        let sealedLen = UInt32(box.ciphertext.count + box.tag.count)
        var frame = Data(capacity: Int(sealedLen) + 4)
        withUnsafeBytes(of: sealedLen.bigEndian) { frame.append(contentsOf: $0) }
        frame.append(box.ciphertext)
        frame.append(box.tag)
        stream.enqueueWrite(frame) { error in
          if let error { cont.resume(throwing: error) } else { cont.resume() }
        }
        lock.unlock()
      } catch {
        lock.unlock()
        cont.resume(throwing: error)
      }
    }
  }

  func send(_ msg: Msg) async throws {
    try await sendFrame(type: Self.frameMessage, body: try JSONEncoder().encode(msg))
  }

  func sendData(_ data: Data) async throws {
    try await sendFrame(type: Self.frameData, body: data)
  }

  // MARK: Receiving (single reader)

  func receive() async throws -> Frame {
    let header = try await stream.read(exactly: 4)
    let len = header.withUnsafeBytes { raw in
      raw.loadUnaligned(as: UInt32.self).bigEndian
    }
    guard len >= 17, len <= Constants.maxFrame else {
      throw CSError.protocolError("bad frame length \(len)")
    }
    let sealed = try await stream.read(exactly: Int(len))
    let box = try AES.GCM.SealedBox(
      nonce: Self.nonce(recvCounter),
      ciphertext: sealed.prefix(sealed.count - 16),
      tag: sealed.suffix(16))
    recvCounter += 1
    let plain = try AES.GCM.open(box, using: recvKey)
    guard let type = plain.first else { throw CSError.protocolError("empty frame") }
    let body = Data(plain.dropFirst())
    switch type {
    case Self.frameMessage:
      return .message(try JSONDecoder().decode(Msg.self, from: body))
    case Self.frameData:
      return .data(body)
    default:
      throw CSError.protocolError("unknown frame type \(type)")
    }
  }

  /// Receives the next frame, which must be a message.
  func receiveMessage() async throws -> Msg {
    guard case .message(let msg) = try await receive() else {
      throw CSError.protocolError("expected a message, got data")
    }
    if msg.t == "cancel" { throw CSError.cancelled }
    return msg
  }

  func close() {
    stream.close()
  }
}
