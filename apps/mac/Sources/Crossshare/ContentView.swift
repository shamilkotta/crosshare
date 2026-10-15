import AppKit
import CrossshareKit
import SwiftUI

struct ContentView: View {
  @EnvironmentObject var model: AppModel
  @State private var renaming = false
  @State private var textTarget: Peer?

  var body: some View {
    VStack(spacing: 0) {
      header
      Divider()
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          ForEach(model.requests, id: \.id) { RequestBanner(transfer: $0) }
          nearby
          if !model.transfers.isEmpty { transfers }
        }
        .padding(20)
      }
    }
    .sheet(isPresented: $renaming) { RenameSheet(isPresented: $renaming) }
    .sheet(item: $textTarget) { peer in SendTextSheet(peer: peer) }
  }

  private var header: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Button {
          renaming = true
        } label: {
          HStack(spacing: 6) {
            Text(model.deviceName).font(.title3.weight(.semibold))
            Image(systemName: "pencil").foregroundStyle(.secondary)
          }
        }
        .buttonStyle(.plain)
        Text(statusLine).font(.caption).foregroundStyle(.secondary)
      }
      Spacer()
      Toggle("Receiving", isOn: $model.visible)
        .toggleStyle(.switch)
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 14)
  }

  private var statusLine: String {
    guard model.visible else { return "Hidden from nearby devices" }
    switch model.bluetooth {
    case "on": return "Visible to nearby devices over Wi-Fi and Bluetooth"
    case "unauthorized": return "Visible on Wi-Fi only. Allow Bluetooth in System Settings › Privacy"
    case "off": return "Visible on Wi-Fi only. Turn on Bluetooth to reach phones without Wi-Fi"
    default: return "Visible to nearby devices"
    }
  }

  private var nearby: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("NEARBY").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
      if model.peers.isEmpty {
        VStack(spacing: 8) {
          ProgressView().controlSize(.small)
          Text("Looking for nearby devices…")
          Text("Open Crossshare on your phone. No shared Wi-Fi needed.")
            .font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
      } else {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 16)], spacing: 16) {
          ForEach(model.peers, id: \.id) { peer in
            PeerTile(peer: peer, onSendText: { textTarget = peer })
          }
        }
        Text("Drop files on a device, or click it to choose files.")
          .font(.caption).foregroundStyle(.secondary)
      }
    }
  }

  private var transfers: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text("TRANSFERS").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        Spacer()
        if model.transfers.contains(where: { $0.status.isFinal }) {
          Button("Clear") { model.clearFinished() }.buttonStyle(.link).font(.caption)
        }
      }
      ForEach(model.transfers.filter { !($0.direction == .incoming && $0.status == .waiting) }, id: \.id) {
        TransferRow(transfer: $0)
      }
    }
  }
}

// MARK: - Peer tile

struct PeerTile: View {
  @EnvironmentObject var model: AppModel
  let peer: Peer
  let onSendText: () -> Void
  @State private var targeted = false

  private var icon: String {
    switch peer.platform {
    case .macos: return "laptopcomputer"
    case .android: return "candybarphone"
    case .ios: return "iphone"
    }
  }

  var body: some View {
    Button(action: chooseFiles) {
      VStack(spacing: 8) {
        Image(systemName: icon)
          .font(.system(size: 26))
          .frame(width: 64, height: 64)
          .background(Circle().fill(targeted ? Color.accentColor.opacity(0.25) : Color.secondary.opacity(0.12)))
          .overlay(Circle().stroke(targeted ? Color.accentColor : .clear, lineWidth: 2))
        Text(peer.name).font(.callout.weight(.medium)).lineLimit(1)
        Text(peer.routes.contains("wifi") ? "Wi-Fi" : "Bluetooth")
          .font(.caption2).foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .dropDestination(for: URL.self) { urls, _ in
      model.send(urls: urls, to: peer)
      return true
    } isTargeted: { targeted = $0 }
    .contextMenu {
      Button("Send Files…", action: chooseFiles)
      Button("Send Text…", action: onSendText)
    }
  }

  private func chooseFiles() {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = true
    panel.canChooseDirectories = true
    panel.prompt = "Send"
    panel.message = "Send to \(peer.name)"
    if panel.runModal() == .OK {
      model.send(urls: panel.urls, to: peer)
    }
  }
}

// MARK: - Incoming request

struct RequestBanner: View {
  @EnvironmentObject var model: AppModel
  let transfer: Transfer

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: "tray.and.arrow.down.fill").font(.title2)
      VStack(alignment: .leading, spacing: 2) {
        Text("\(transfer.peerName) wants to share").font(.headline)
        Text(summary).font(.callout).foregroundStyle(.secondary).lineLimit(2)
      }
      Spacer()
      Button("Decline") { model.respond(transfer, accept: false) }
      Button("Accept") { model.respond(transfer, accept: true) }
        .keyboardShortcut(.defaultAction)
    }
    .padding(14)
    .background(RoundedRectangle(cornerRadius: 12).fill(Color.accentColor.opacity(0.12)))
  }

  private var summary: String {
    if transfer.files.isEmpty { return transfer.text ?? "" }
    let size = ByteCountFormatter.string(fromByteCount: transfer.totalBytes, countStyle: .file)
    let names = transfer.files.prefix(3).map(\.name).joined(separator: ", ")
    let more = transfer.files.count > 3 ? " and \(transfer.files.count - 3) more" : ""
    return "\(names)\(more) · \(size)"
  }
}

// MARK: - Transfer row

struct TransferRow: View {
  @EnvironmentObject var model: AppModel
  let transfer: Transfer

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: transfer.direction == .incoming ? "arrow.down.circle" : "arrow.up.circle")
        .font(.title2)
        .foregroundStyle(.secondary)
      VStack(alignment: .leading, spacing: 4) {
        Text(title).lineLimit(1)
        if !transfer.status.isFinal, transfer.totalBytes > 0 {
          ProgressView(value: Double(transfer.transferredBytes), total: Double(max(transfer.totalBytes, 1)))
        }
        Text(caption).font(.caption).foregroundStyle(.secondary).lineLimit(1)
      }
      Spacer()
      actions
    }
    .padding(12)
    .background(RoundedRectangle(cornerRadius: 10).fill(Color.secondary.opacity(0.08)))
  }

  private var title: String {
    if transfer.files.isEmpty { return transfer.text ?? "Text" }
    return transfer.files.count == 1 ? transfer.files[0].name : "\(transfer.files.count) files"
  }

  private var caption: String {
    let who = (transfer.direction == .incoming ? "From " : "To ") + transfer.peerName
    let via = transfer.transport == "hotspot" ? "direct Wi-Fi" : transfer.transport == "bluetooth" ? "Bluetooth" : "Wi-Fi"
    let bytes = "\(fmt(transfer.transferredBytes)) of \(fmt(transfer.totalBytes))"
    switch transfer.status {
    case .connecting: return "\(who) · connecting…"
    case .waiting: return "\(who) · waiting for them to accept"
    case .upgrading: return "\(who) · switching to direct Wi-Fi…"
    case .transferring: return "\(who) · \(bytes) via \(via)"
    case .completed: return "\(who) · done"
    case .declined: return "\(who) · declined"
    case .cancelled: return "\(who) · cancelled"
    case .failed: return "\(who) · failed: \(transfer.error ?? "unknown error")"
    }
  }

  @ViewBuilder private var actions: some View {
    if !transfer.status.isFinal {
      Button("Cancel") { model.cancel(transfer) }
    } else if transfer.direction == .incoming, transfer.status == .completed {
      if let text = transfer.text, transfer.files.isEmpty {
        Button("Copy") {
          NSPasteboard.general.clearContents()
          NSPasteboard.general.setString(text, forType: .string)
        }
      }
      let urls = transfer.files.compactMap(\.savedURL)
      if !urls.isEmpty {
        Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting(urls) }
      }
    }
  }

  private func fmt(_ n: Int64) -> String { ByteCountFormatter.string(fromByteCount: n, countStyle: .file) }
}

// MARK: - Sheets

struct RenameSheet: View {
  @EnvironmentObject var model: AppModel
  @Binding var isPresented: Bool
  @State private var name = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Name others see").font(.headline)
      TextField("Name", text: $name).frame(width: 280).onSubmit(save)
      HStack {
        Spacer()
        Button("Cancel") { isPresented = false }
        Button("Save", action: save).keyboardShortcut(.defaultAction)
      }
    }
    .padding(20)
    .onAppear { name = model.deviceName }
  }

  private func save() {
    model.rename(name)
    isPresented = false
  }
}

struct SendTextSheet: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.dismiss) private var dismiss
  let peer: Peer
  @State private var text = NSPasteboard.general.string(forType: .string) ?? ""

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Send text to \(peer.name)").font(.headline)
      TextEditor(text: $text)
        .font(.body)
        .frame(width: 360, height: 140)
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.secondary.opacity(0.3)))
      HStack {
        Spacer()
        Button("Cancel") { dismiss() }
        Button("Send") {
          let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
          if !trimmed.isEmpty { model.send(text: trimmed, to: peer) }
          dismiss()
        }
        .keyboardShortcut(.defaultAction)
      }
    }
    .padding(20)
  }
}
