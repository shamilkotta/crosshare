import Foundation
import Network

/// A reliable, ordered byte stream (TCP connection or L2CAP channel).
protocol ByteStream: AnyObject {
  /// Reads exactly `count` bytes (count > 0), or throws if the stream ends first.
  func read(exactly count: Int) async throws -> Data
  /// Enqueues `data` for writing. Writes complete in the order they were enqueued.
  func enqueueWrite(_ data: Data, completion: @escaping (Error?) -> Void)
  func close()
}

extension ByteStream {
  func write(_ data: Data) async throws {
    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      enqueueWrite(data) { error in
        if let error { cont.resume(throwing: error) } else { cont.resume() }
      }
    }
  }
}

// MARK: - Network.framework

final class NWByteStream: ByteStream, @unchecked Sendable {
  let connection: NWConnection
  private let queue = DispatchQueue(label: "crosshare.nwstream")

  init(_ connection: NWConnection) {
    self.connection = connection
  }

  /// Starts the connection (if needed) and waits until it is ready.
  func open(timeout: Double = 15) async throws {
    let conn = connection
    let queue = queue
    try await withTimeout(timeout) {
      try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
        let once = Once()
        conn.stateUpdateHandler = { state in
          switch state {
          case .ready:
            if once.claim() { cont.resume() }
          case .failed(let error):
            if once.claim() { cont.resume(throwing: error) }
          case .waiting(let error):
            // Unreachable for now; fail fast instead of waiting for the network to change.
            if once.claim() { cont.resume(throwing: error) }
          case .cancelled:
            if once.claim() { cont.resume(throwing: CSError.closed) }
          default:
            break
          }
        }
        if conn.state == .setup { conn.start(queue: queue) }
      }
    }
  }

  func read(exactly count: Int) async throws -> Data {
    try await withCheckedThrowingContinuation { cont in
      connection.receive(minimumIncompleteLength: count, maximumLength: count) { data, _, isComplete, error in
        if let error {
          cont.resume(throwing: error)
        } else if let data, data.count == count {
          cont.resume(returning: data)
        } else {
          cont.resume(throwing: CSError.closed)
        }
      }
    }
  }

  func enqueueWrite(_ data: Data, completion: @escaping (Error?) -> Void) {
    connection.send(content: data, completion: .contentProcessed { error in completion(error) })
  }

  func close() {
    connection.cancel()
  }
}

// MARK: - Foundation streams (CoreBluetooth L2CAP)

final class FoundationByteStream: NSObject, ByteStream, StreamDelegate, @unchecked Sendable {
  private let input: InputStream
  private let output: OutputStream
  private let queue = DispatchQueue(label: "crosshare.l2cap")
  /// Keeps the owner of the streams (the L2CAP channel) alive.
  private var owner: AnyObject?
  private var onClose: (() -> Void)?

  private var buffer = Data()
  private var pendingRead: (count: Int, cont: CheckedContinuation<Data, Error>)?
  private var writes: [(data: Data, offset: Int, completion: (Error?) -> Void)] = []
  private var failure: Error?

  init(input: InputStream, output: OutputStream, owner: AnyObject?, onClose: (() -> Void)? = nil) {
    self.input = input
    self.output = output
    self.owner = owner
    self.onClose = onClose
    super.init()
    input.delegate = self
    output.delegate = self
    CFReadStreamSetDispatchQueue(input, queue)
    CFWriteStreamSetDispatchQueue(output, queue)
    input.open()
    output.open()
  }

  func read(exactly count: Int) async throws -> Data {
    try await withCheckedThrowingContinuation { cont in
      queue.async {
        if self.buffer.count >= count {
          cont.resume(returning: self.take(count))
        } else if let failure = self.failure {
          cont.resume(throwing: failure)
        } else {
          self.pendingRead = (count, cont)
        }
      }
    }
  }

  func enqueueWrite(_ data: Data, completion: @escaping (Error?) -> Void) {
    queue.async {
      if let failure = self.failure {
        completion(failure)
        return
      }
      self.writes.append((data, 0, completion))
      self.flushWrites()
    }
  }

  func close() {
    queue.async {
      self.fail(CSError.closed)
      self.input.close()
      self.output.close()
      CFReadStreamSetDispatchQueue(self.input, nil)
      CFWriteStreamSetDispatchQueue(self.output, nil)
      self.owner = nil
      let onClose = self.onClose
      self.onClose = nil
      onClose?()
    }
  }

  func stream(_ aStream: Stream, handle eventCode: Stream.Event) {
    switch eventCode {
    case .hasBytesAvailable:
      readAvailable()
    case .hasSpaceAvailable:
      flushWrites()
    case .errorOccurred:
      fail(aStream.streamError ?? CSError.closed)
    case .endEncountered:
      fail(CSError.closed)
    default:
      break
    }
  }

  // Everything below runs on `queue`.

  private func take(_ count: Int) -> Data {
    let out = buffer.prefix(count)
    buffer = buffer.dropFirst(count)
    return Data(out)
  }

  private func readAvailable() {
    var chunk = [UInt8](repeating: 0, count: 64 * 1024)
    while input.hasBytesAvailable {
      let n = input.read(&chunk, maxLength: chunk.count)
      if n <= 0 { break }
      buffer.append(chunk, count: n)
    }
    if let pending = pendingRead, buffer.count >= pending.count {
      pendingRead = nil
      pending.cont.resume(returning: take(pending.count))
    }
  }

  private func flushWrites() {
    while !writes.isEmpty, output.hasSpaceAvailable {
      let (data, offset, completion) = writes[0]
      let n = data.withUnsafeBytes { raw -> Int in
        let base = raw.bindMemory(to: UInt8.self).baseAddress!
        return output.write(base + offset, maxLength: data.count - offset)
      }
      if n < 0 {
        fail(output.streamError ?? CSError.closed)
        return
      }
      if n == 0 { return }
      if offset + n >= data.count {
        writes.removeFirst()
        completion(nil)
      } else {
        writes[0].offset = offset + n
      }
    }
  }

  private func fail(_ error: Error) {
    if failure == nil { failure = error }
    if let pending = pendingRead {
      pendingRead = nil
      pending.cont.resume(throwing: error)
    }
    let pendingWrites = writes
    writes.removeAll()
    for w in pendingWrites { w.completion(error) }
  }
}
