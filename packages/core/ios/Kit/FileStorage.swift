import Foundation

/// Where received files go: written to a temp folder, then moved into `downloads` when complete.
public final class FileStorage: @unchecked Sendable {
  public let downloads: URL
  private let temp: URL

  public init(downloads: URL) {
    self.downloads = downloads
    temp = FileManager.default.temporaryDirectory.appendingPathComponent("crosshare-incoming", isDirectory: true)
  }

  final class Sink {
    let dir: URL
    let sizes: [Int64]
    private var handles: [Int: FileHandle] = [:]
    private var written: [Int64]

    init(dir: URL, sizes: [Int64]) {
      self.dir = dir
      self.sizes = sizes
      written = Array(repeating: 0, count: sizes.count)
    }

    func partURL(_ index: Int) -> URL { dir.appendingPathComponent("\(index).part") }

    /// The first file at or after `index` that still expects bytes.
    func nextIndex(from index: Int) -> Int {
      var i = index
      while i < sizes.count, sizes[i] == 0 { i += 1 }
      return i
    }

    /// Appends `data` to file `index` and returns the total bytes written to it.
    func write(_ data: Data, to index: Int) throws -> Int64 {
      guard written[index] + Int64(data.count) <= sizes[index] else {
        throw CSError.protocolError("more data than announced")
      }
      let handle: FileHandle
      if let h = handles[index] {
        handle = h
      } else {
        handle = try FileHandle(forWritingTo: partURL(index))
        handles[index] = handle
      }
      try handle.write(contentsOf: data)
      written[index] += Int64(data.count)
      return written[index]
    }

    func closeFile(_ index: Int) throws {
      try handles.removeValue(forKey: index)?.close()
    }

    func closeAll() {
      for (_, h) in handles { try? h.close() }
      handles.removeAll()
    }
  }

  func beginReceiving(transferId: String, files: [WireFile]) throws -> Sink {
    let dir = temp.appendingPathComponent(transferId, isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let sink = Sink(dir: dir, sizes: files.map { max(0, $0.size) })
    for i in files.indices {
      FileManager.default.createFile(atPath: sink.partURL(i).path, contents: nil)
    }
    lock.lock()
    sinks[transferId] = (sink, files.map(\.name))
    lock.unlock()
    return sink
  }

  private let lock = NSLock()
  private var sinks: [String: (Sink, [String])] = [:]

  private func removeSink(_ transferId: String) -> (Sink, [String])? {
    lock.lock()
    defer { lock.unlock() }
    return sinks.removeValue(forKey: transferId)
  }

  /// Moves completed files into `downloads` and returns their final URLs.
  func finish(transferId: String, sink: Sink) throws -> [URL] {
    sink.closeAll()
    let names = removeSink(transferId)?.1 ?? []
    try FileManager.default.createDirectory(at: downloads, withIntermediateDirectories: true)
    var result: [URL] = []
    for (i, name) in names.enumerated() {
      let dest = uniqueURL(for: Self.sanitize(name))
      try FileManager.default.moveItem(at: sink.partURL(i), to: dest)
      result.append(dest)
    }
    try? FileManager.default.removeItem(at: sink.dir)
    return result
  }

  func discard(transferId: String) {
    if let (sink, _) = removeSink(transferId) {
      sink.closeAll()
    }
    try? FileManager.default.removeItem(at: temp.appendingPathComponent(transferId, isDirectory: true))
  }

  static func sanitize(_ name: String) -> String {
    let base = (name as NSString).lastPathComponent
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: ":", with: "_")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if base.isEmpty || base == "." || base == ".." { return "file" }
    return String(base.prefix(200))
  }

  private func uniqueURL(for name: String) -> URL {
    let fm = FileManager.default
    var url = downloads.appendingPathComponent(name)
    let ext = (name as NSString).pathExtension
    let stem = (name as NSString).deletingPathExtension
    var n = 1
    while fm.fileExists(atPath: url.path) {
      let candidate = ext.isEmpty ? "\(stem) (\(n))" : "\(stem) (\(n)).\(ext)"
      url = downloads.appendingPathComponent(candidate)
      n += 1
    }
    return url
  }
}
