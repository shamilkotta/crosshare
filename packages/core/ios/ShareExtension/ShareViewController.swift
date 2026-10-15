import UIKit
import UniformTypeIdentifiers

/// Share extension: copies what the user shared into the app group, then opens Crosshare, which
/// picks it up (CrosshareCoreModule.getSharedItems) and shows nearby devices.
///
/// Inbox layout, in the app group container:
///   Crosshare/Inbox/share.json   {"created": <unix s>, "files": [{"path","name","mimeType","size"}], "text"?}
///   Crosshare/Inbox/<uuid>/...   the copied files ("path" is relative to Inbox/)
@objc(ShareViewController)
final class ShareViewController: UIViewController {
  private let spinner = UIActivityIndicatorView(style: .large)

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor.black.withAlphaComponent(0.35)
    spinner.color = .white
    spinner.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(spinner)
    NSLayoutConstraint.activate([
      spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
    ])
    spinner.startAnimating()

    Task { @MainActor in
      do {
        try await self.collect()
        self.openApp()
        self.extensionContext?.completeRequest(returningItems: nil)
      } catch {
        self.extensionContext?.cancelRequest(withError: error)
      }
    }
  }

  // MARK: Collecting

  private struct SharedFile: Encodable {
    let path: String
    let name: String
    let mimeType: String?
    let size: Int64
  }

  private struct Manifest: Encodable {
    let created: TimeInterval
    let files: [SharedFile]
    let text: String?
  }

  private func collect() async throws {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "CrosshareAppGroup") as? String,
          let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    else { throw ShareError.noAppGroup }

    let inbox = container.appendingPathComponent("Crosshare/Inbox", isDirectory: true)
    // Only the latest share matters; drop anything left from earlier ones.
    try? FileManager.default.removeItem(at: inbox)
    let batch = UUID().uuidString
    let dir = inbox.appendingPathComponent(batch, isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

    var files: [SharedFile] = []
    var texts: [String] = []
    let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
    // Some apps share strings as the item's text, not as an attachment.
    for item in items where (item.attachments ?? []).isEmpty {
      if let text = item.attributedContentText?.string, !text.isEmpty { texts.append(text) }
    }
    for (index, provider) in items.flatMap({ $0.attachments ?? [] }).enumerated() {
      let slot = dir.appendingPathComponent("\(index)", isDirectory: true)
      switch try await load(provider, into: slot) {
      case .file(let url):
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) ?? 0
        let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
        files.append(SharedFile(path: "\(batch)/\(index)/\(url.lastPathComponent)", name: url.lastPathComponent,
                                mimeType: mime, size: size))
      case .text(let text):
        texts.append(text)
      case nil:
        break
      }
    }
    guard !files.isEmpty || !texts.isEmpty else { throw ShareError.nothingToShare }

    let manifest = Manifest(created: Date().timeIntervalSince1970, files: files,
                            text: texts.isEmpty ? nil : texts.joined(separator: "\n"))
    try JSONEncoder().encode(manifest).write(to: inbox.appendingPathComponent("share.json"), options: .atomic)
  }

  private enum Item {
    case file(URL)
    case text(String)
  }

  private func load(_ provider: NSItemProvider, into slot: URL) async throws -> Item? {
    // Web links (Safari, other apps) are sent as text.
    if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
       !provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
       let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL,
       !url.isFileURL {
      return .text(url.absoluteString)
    }
    // Plain text that isn't a file (Notes, selected text). Text files load as URLs instead.
    if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
       let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
      return .text(text)
    }
    // Anything else is a file: copy its file representation.
    let type = provider.registeredTypeIdentifiers.first {
      guard let t = UTType($0) else { return false }
      return t.conforms(to: .data) || t.conforms(to: .package)
    }
    guard let type else { return nil }
    let suggestedName = provider.suggestedName
    return try await withCheckedThrowingContinuation { cont in
      _ = provider.loadFileRepresentation(forTypeIdentifier: type) { url, error in
        guard let url else {
          cont.resume(throwing: error ?? ShareError.nothingToShare)
          return
        }
        // The system deletes `url` when this handler returns, so copy it now.
        do {
          var name = suggestedName ?? url.deletingPathExtension().lastPathComponent
          if (name as NSString).pathExtension.isEmpty {
            let ext = url.pathExtension.isEmpty ? UTType(type)?.preferredFilenameExtension : url.pathExtension
            if let ext { name += ".\(ext)" }
          }
          name = name.replacingOccurrences(of: "/", with: "_")
          try FileManager.default.createDirectory(at: slot, withIntermediateDirectories: true)
          let dest = slot.appendingPathComponent(name)
          try FileManager.default.copyItem(at: url, to: dest)
          cont.resume(returning: .file(dest))
        } catch {
          cont.resume(throwing: error)
        }
      }
    }
  }

  // MARK: Opening the app

  /// Extensions can't call UIApplication.shared, but the app is still in the responder chain.
  private func openApp() {
    guard let scheme = Bundle.main.object(forInfoDictionaryKey: "CrosshareHostScheme") as? String,
          let url = URL(string: "\(scheme)://share") else { return }
    let selector = NSSelectorFromString("openURL:options:completionHandler:")
    var responder: UIResponder? = self
    while let r = responder {
      if let app = r as? UIApplication, app.responds(to: selector) {
        typealias Open = @convention(c) (AnyObject, Selector, URL, NSDictionary, Any?) -> Void
        let open = unsafeBitCast(app.method(for: selector), to: Open.self)
        open(app, selector, url, NSDictionary(), nil)
        return
      }
      responder = r.next
    }
  }

  private enum ShareError: LocalizedError {
    case noAppGroup
    case nothingToShare

    var errorDescription: String? {
      switch self {
      case .noAppGroup: return "Crosshare's app group is not set up."
      case .nothingToShare: return "Nothing Crosshare can send."
      }
    }
  }
}
