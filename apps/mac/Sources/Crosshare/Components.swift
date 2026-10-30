import AppKit
import CrosshareKit
import SwiftUI

// MARK: - Request card

/// An incoming transfer to accept, or a link code to confirm.
struct RequestCard: View {
  @EnvironmentObject var model: AppModel
  let transfer: Transfer
  var compact = false

  private var isLink: Bool { transfer.kind == .link }

  var body: some View {
    VStack(alignment: .leading, spacing: compact ? 10 : 14) {
      HStack(spacing: 10) {
        DeviceGlyph(platform: transfer.peerPlatform, size: compact ? 28 : 34)
        VStack(alignment: .leading, spacing: 1) {
          Text(isLink ? "Link with \(transfer.peerName)" : transfer.peerName)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Palette.text)
            .lineLimit(1)
          Text(subtitle)
            .font(.system(size: 12))
            .foregroundStyle(Palette.secondary)
            .lineLimit(1)
        }
        Spacer(minLength: 0)
      }

      if isLink {
        VStack(spacing: 6) {
          Text(formatCode(transfer.code))
            .font(.system(size: compact ? 28 : 36, weight: .medium, design: .monospaced))
            .tracking(4)
            .foregroundStyle(Palette.text)
            .textSelection(.enabled)
          Text("Only confirm if \(transfer.peerName) shows exactly this code.")
            .font(.system(size: 11))
            .foregroundStyle(Palette.secondary)
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, compact ? 12 : 18)
        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.surface))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.border))
      } else if transfer.files.isEmpty {
        ScrollView {
          Text(transfer.text ?? "")
            .font(.system(size: 12))
            .foregroundStyle(Palette.text)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
        }
        .frame(maxHeight: compact ? 80 : 140)
        .fixedSize(horizontal: false, vertical: true)
        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.surface))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.border))
      } else {
        VStack(spacing: 0) {
          let shown = transfer.files.prefix(compact ? 2 : 4)
          ForEach(Array(shown.enumerated()), id: \.offset) { i, file in
            if i > 0 { Hairline() }
            HStack(spacing: 8) {
              Image(systemName: "doc").font(.system(size: 11)).foregroundStyle(Palette.secondary)
              Text(file.name).font(.system(size: 12)).foregroundStyle(Palette.text).lineLimit(1)
              Spacer()
              Text(formatBytes(file.size)).font(.system(size: 11)).foregroundStyle(Palette.secondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
          }
          if transfer.files.count > shown.count {
            Hairline()
            Text("and \(transfer.files.count - shown.count) more")
              .font(.system(size: 11))
              .foregroundStyle(Palette.secondary)
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.horizontal, 10)
              .padding(.vertical, 7)
          }
        }
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.border))
      }

      HStack(spacing: 8) {
        Spacer()
        Button(isLink ? "Doesn’t Match" : "Decline") { model.respond(transfer, accept: false) }
          .buttonStyle(SecondaryButtonStyle(compact: compact))
        Button(isLink ? "Codes Match" : "Accept") { model.respond(transfer, accept: true) }
          .buttonStyle(PrimaryButtonStyle(compact: compact))
          .keyboardShortcut(compact ? nil : .defaultAction)
      }
      .frame(maxWidth: .infinity, alignment: .trailing)
    }
    .padding(compact ? 12 : 16)
    .background(RoundedRectangle(cornerRadius: 12).fill(Palette.background))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.text, lineWidth: 1))
  }

  private var subtitle: String {
    if isLink { return "Confirm this code matches on both devices" }
    if transfer.files.isEmpty { return "wants to send you text" }
    let what = transfer.files.count == 1 ? "a file" : "\(transfer.files.count) files"
    return "wants to send you \(what) · \(formatBytes(transfer.totalBytes))"
  }
}

// MARK: - Device row

struct DeviceRow: View {
  @EnvironmentObject var model: AppModel
  let device: Device
  var compact = false
  /// Opens a text composer for this device.
  let onSendText: (Peer) -> Void

  @State private var dropTarget = false

  var body: some View {
    let ready = model.pending != nil && device.peer != nil
    HStack(spacing: 10) {
      DeviceGlyph(platform: device.platform, size: compact ? 26 : 32, dim: device.peer == nil)
      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 6) {
          Text(device.name)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(device.peer == nil ? Palette.secondary : Palette.text)
            .lineLimit(1)
          if device.linked { Tag(label: "Linked") }
        }
        Text(dropTarget ? "Drop to send" : device.peer.map { routeLabel($0.routes) } ?? "Not nearby")
          .font(.system(size: 11))
          .foregroundStyle(Palette.secondary)
      }
      Spacer(minLength: 8)
      if ready && model.pendingSentTo.contains(device.id) {
        Label("Sent", systemImage: "checkmark")
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(Palette.secondary)
          .padding(.horizontal, 10)
          .frame(height: 22)
          .overlay(Capsule().strokeBorder(Palette.borderStrong))
      } else if ready {
        Text("Send")
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(Palette.onInverse)
          .padding(.horizontal, 10)
          .frame(height: 22)
          .background(Capsule().fill(Palette.inverse))
      } else {
        Menu {
          actions
        } label: {
          Image(systemName: "ellipsis")
            .font(.system(size: 12))
            .foregroundStyle(Palette.secondary)
            .frame(width: 24, height: 24)
            .contentShape(Rectangle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, compact ? 7 : 10)
    .background(dropTarget ? Palette.surfaceHover : .clear)
    .contentShape(Rectangle())
    .hoverRow()
    .onTapGesture { primary() }
    .contextMenu { actions }
    .dropDestination(for: URL.self) { urls, _ in
      guard let peer = device.peer else { return false }
      model.send(urls: urls, to: peer)
      return true
    } isTargeted: { dropTarget = $0 && device.peer != nil }
    .help(device.peer == nil ? "Not nearby" : ready ? "Send to \(device.name)" : "Choose files to send to \(device.name)")
  }

  private func primary() {
    guard let peer = device.peer else { return }
    if model.pending != nil { model.sendPending(to: peer) } else { model.chooseFiles(for: peer) }
  }

  @ViewBuilder private var actions: some View {
    if let peer = device.peer {
      Button("Send Files…") { model.chooseFiles(for: peer) }
      Button("Send Text…") { onSendText(peer) }
      Button("Send Clipboard") {
        if let text = model.clipboardText { model.send(text: text, to: peer) }
      }
      .disabled(model.clipboardText == nil)
      Divider()
    }
    if device.linked {
      Button("Unlink…") { confirmUnlink() }
    } else if let peer = device.peer {
      Button("Link Device…") { model.link(peer) }
    }
  }

  private func confirmUnlink() {
    guard let link = model.links.first(where: { $0.id == device.id }) else { return }
    let alert = NSAlert()
    alert.messageText = "Unlink \(device.name)?"
    alert.informativeText = "Text from this device will ask before it’s copied again. It’s removed on both devices."
    alert.addButton(withTitle: "Unlink")
    alert.addButton(withTitle: "Cancel")
    if alert.runModal() == .alertFirstButtonReturn { model.unlink(link) }
  }
}

// MARK: - Activity row

struct ActivityRow: View {
  @EnvironmentObject var model: AppModel
  let transfer: Transfer
  var compact = false

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: icon)
        .font(.system(size: 12))
        .foregroundStyle(Palette.secondary)
        .frame(width: 18)
      VStack(alignment: .leading, spacing: 4) {
        VStack(alignment: .leading, spacing: 1) {
          Text(transferTitle(transfer))
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(dimmed ? Palette.secondary : Palette.text)
            .lineLimit(1)
          Text(transferCaption(transfer))
            .font(.system(size: 11))
            .foregroundStyle(Palette.secondary)
            .lineLimit(1)
        }
        if transfer.status == .transferring, transfer.totalBytes > 0 {
          ProgressBar(value: Double(transfer.transferredBytes) / Double(transfer.totalBytes))
        }
      }
      Spacer(minLength: 8)
      trailing
    }
    .padding(.horizontal, 12)
    .padding(.vertical, compact ? 7 : 10)
    .hoverRow()
  }

  private var icon: String {
    if transfer.kind == .link { return "link" }
    return transfer.direction == .incoming ? "arrow.down.left" : "arrow.up.right"
  }

  private var dimmed: Bool { transfer.status.isFinal && transfer.status != .completed }

  @ViewBuilder private var trailing: some View {
    if !transfer.status.isFinal {
      Button { model.cancel(transfer) } label: { Image(systemName: "xmark") }
        .buttonStyle(GhostButtonStyle())
        .help("Cancel")
    } else if transfer.status == .completed, transfer.kind == .transfer {
      if transfer.files.isEmpty, let text = transfer.text {
        Button("Copy") {
          NSPasteboard.general.clearContents()
          NSPasteboard.general.setString(text, forType: .string)
        }
        .buttonStyle(GhostButtonStyle())
      } else if transfer.direction == .incoming {
        let urls = transfer.files.compactMap(\.savedURL)
        if !urls.isEmpty {
          Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting(urls) }
            .buttonStyle(GhostButtonStyle())
        }
      }
    }
  }
}

// MARK: - Text composer

struct TextComposer: View {
  let action: String
  let onSubmit: (String) -> Void
  let onCancel: () -> Void

  @State private var text = ""
  @FocusState private var focused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      ZStack(alignment: .topLeading) {
        if text.isEmpty {
          Text("Type or paste something…")
            .font(.system(size: 13))
            .foregroundStyle(Palette.tertiary)
            .padding(.horizontal, 13)
            .padding(.vertical, 10)
            .allowsHitTesting(false)
        }
        TextEditor(text: $text)
          .font(.system(size: 13))
          .scrollContentBackground(.hidden)
          .focused($focused)
          .padding(.horizontal, 8)
          .padding(.vertical, 10)
      }
      .frame(minHeight: 96, maxHeight: 200)
      .background(RoundedRectangle(cornerRadius: 8).fill(Palette.surface))
      .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.borderStrong))

      HStack(spacing: 8) {
        Text("⌘↩ to continue")
          .font(.system(size: 11))
          .foregroundStyle(Palette.tertiary)
        Spacer()
        Button("Cancel", action: onCancel)
          .buttonStyle(SecondaryButtonStyle())
          .keyboardShortcut(.cancelAction)
        Button(action) { submit() }
          .buttonStyle(PrimaryButtonStyle())
          .keyboardShortcut(.return, modifiers: .command)
          .disabled(trimmed.isEmpty)
      }
    }
    .onAppear { focused = true }
  }

  private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

  private func submit() {
    guard !trimmed.isEmpty else { return }
    onSubmit(trimmed)
  }
}
