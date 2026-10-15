import AppKit
import UniformTypeIdentifiers

/// Share menu extension: hands what the user shared to Crosshare.app, which shows nearby devices.
///
/// Files go to the app as an "open documents" event, like Finder's Open With. Data without a file
/// (e.g. an image from Photos) is copied to this extension's temporary folder first. Text and web
/// links go as crosshare://share?text=…
@objc(ShareViewController)
final class ShareViewController: NSViewController {
  override func loadView() {
    view = NSView(frame: NSRect(x: 0, y: 0, width: 1, height: 1))
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    Task { @MainActor in
      let (files, texts) = await self.collect()
      self.handOff(files: files, text: texts.joined(separator: "\n"))
      self.extensionContext?.completeRequest(returningItems: nil)
    }
  }

  private func collect() async -> ([URL], [String]) {
    var files: [URL] = []
    var texts: [String] = []
    let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
    // Shared strings come as the item's text, not as an attachment.
    for item in items where (item.attachments ?? []).isEmpty {
      if let text = item.attributedContentText?.string, !text.isEmpty { texts.append(text) }
    }
    for provider in items.flatMap({ $0.attachments ?? [] }) {
      if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
         let url = await loadURL(provider, UTType.fileURL) {
        files.append(url)
      } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                let url = await loadURL(provider, UTType.url) {
        if url.isFileURL { files.append(url) } else { texts.append(url.absoluteString) }
      } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
        texts.append(text)
      } else if let url = await copyData(provider) {
        files.append(url)
      }
    }
    return (files, texts)
  }

  private func loadURL(_ provider: NSItemProvider, _ type: UTType) async -> URL? {
    switch try? await provider.loadItem(forTypeIdentifier: type.identifier) {
    case let url as URL: return url
    case let data as Data: return URL(dataRepresentation: data, relativeTo: nil)
    case let string as String: return URL(string: string)
    default: return nil
    }
  }

  private func copyData(_ provider: NSItemProvider) async -> URL? {
    let type = provider.registeredTypeIdentifiers.first { UTType($0)?.conforms(to: .data) == true }
    guard let type else { return nil }
    let suggestedName = provider.suggestedName
    return await withCheckedContinuation { cont in
      _ = provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
        guard let url else { return cont.resume(returning: nil) }
        // The system deletes `url` when this handler returns.
        var name = suggestedName ?? url.lastPathComponent
        if (name as NSString).pathExtension.isEmpty, !url.pathExtension.isEmpty { name += ".\(url.pathExtension)" }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let dest = dir.appendingPathComponent(name.replacingOccurrences(of: "/", with: "_"))
        do {
          try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
          try FileManager.default.copyItem(at: url, to: dest)
          cont.resume(returning: dest)
        } catch {
          cont.resume(returning: nil)
        }
      }
    }
  }

  /// Crosshare.app/Contents/PlugIns/CrosshareShare.appex
  private func handOff(files: [URL], text: String) {
    let app = Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    var urls = files
    if !text.isEmpty {
      var c = URLComponents()
      c.scheme = "crosshare"
      c.host = "share"
      c.queryItems = [URLQueryItem(name: "text", value: text)]
      if let url = c.url { urls.append(url) }
    }
    guard !urls.isEmpty else { return }
    let config = NSWorkspace.OpenConfiguration()
    config.activates = true
    NSWorkspace.shared.open(urls, withApplicationAt: app, configuration: config)
  }
}
