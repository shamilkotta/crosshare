import AppKit
import CrosshareKit
import SwiftUI

/// The main window: this device, what to send, devices, and activity, top to bottom.
struct ContentView: View {
  @EnvironmentObject var model: AppModel
  @State private var showSettings = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 28) {
        header
        if !model.requests.isEmpty {
          VStack(alignment: .leading, spacing: 8) {
            SectionHeader(model.requests.count == 1 ? "Request" : "Requests · \(model.requests.count)")
            ForEach(model.requests, id: \.id) { RequestCard(transfer: $0) }
          }
        }
        VStack(alignment: .leading, spacing: 8) {
          SectionHeader(title: "Send") {
            if model.pending != nil {
              Button(model.pendingSentTo.isEmpty ? "Clear" : "Done") { model.pending = nil }
                .buttonStyle(GhostButtonStyle())
            }
          }
          Composer()
        }
        devices
        activity
      }
      .padding(24)
      .frame(maxWidth: 640)
      .frame(maxWidth: .infinity)
    }
    .background(Palette.background)
    .sheet(isPresented: $showSettings) { SettingsSheet().environmentObject(model) }
    .sheet(item: $model.textTarget) { peer in
      VStack(alignment: .leading, spacing: 14) {
        HStack(spacing: 10) {
          DeviceGlyph(platform: peer.platform)
          Text("Send text to \(peer.name)").font(.system(size: 14, weight: .semibold))
        }
        TextComposer(
          action: "Send",
          onSubmit: { text in
            model.textTarget = nil
            model.send(text: text, to: peer)
          },
          onCancel: { model.textTarget = nil })
      }
      .padding(20)
      .frame(width: 420)
      .background(Palette.background)
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        Text("Crosshare")
          .font(.system(size: 20, weight: .semibold))
          .tracking(-0.4)
          .foregroundStyle(Palette.text)
        Spacer()
        Button { showSettings = true } label: {
          Image(systemName: "gearshape").font(.system(size: 14))
        }
        .buttonStyle(GhostButtonStyle())
        .keyboardShortcut(",", modifiers: .command)
        .help("Settings")
      }
      Card {
        HStack(spacing: 12) {
          DeviceGlyph(platform: .macos, size: 34, dim: !model.visible)
          VStack(alignment: .leading, spacing: 1) {
            Text(model.deviceName)
              .font(.system(size: 13, weight: .medium))
              .foregroundStyle(Palette.text)
            Text(model.visible ? "Visible to nearby devices" : "Hidden. No one can send to you")
              .font(.system(size: 11))
              .foregroundStyle(Palette.secondary)
          }
          Spacer()
          Toggle("Visible", isOn: $model.visible)
            .toggleStyle(MonoToggleStyle(small: false))
            .labelsHidden()
        }
        .padding(12)
        if model.bluetooth == "off" || model.bluetooth == "unauthorized" {
          Hairline()
          HStack(spacing: 10) {
            Image(systemName: "dot.radiowaves.left.and.right")
              .font(.system(size: 12))
              .foregroundStyle(Palette.secondary)
            Text(model.bluetooth == "off"
              ? "Bluetooth is off. Turn it on to find devices that aren’t on your Wi-Fi."
              : "Crosshare can’t use Bluetooth. Allow it in System Settings › Privacy & Security.")
              .font(.system(size: 11))
              .foregroundStyle(Palette.secondary)
            Spacer()
          }
          .padding(12)
        }
      }
    }
  }

  private var devices: some View {
    VStack(alignment: .leading, spacing: 8) {
      SectionHeader(
        title: model.pending == nil
          ? "Devices" : model.pendingSentTo.isEmpty ? "Choose a device" : "Send to another device"
      ) {
        HStack(spacing: 6) {
          ProgressView().controlSize(.mini)
          Text("Searching").font(.system(size: 11)).foregroundStyle(Palette.tertiary)
        }
      }
      if model.devices.isEmpty {
        EmptyBox(
          title: "No devices nearby",
          detail: "Open Crosshare on the other device and make sure it’s visible.")
      } else {
        Card {
          ForEach(Array(model.devices.enumerated()), id: \.element.id) { i, device in
            if i > 0 { Hairline() }
            DeviceRow(device: device) { model.textTarget = $0 }
          }
        }
        if model.pending == nil {
          Text("Click a device to choose files, or drop files onto it. Right-click for more.")
            .font(.system(size: 11))
            .foregroundStyle(Palette.tertiary)
            .padding(.horizontal, 2)
        }
      }
    }
  }

  private var activity: some View {
    VStack(alignment: .leading, spacing: 8) {
      SectionHeader(title: "Activity") {
        if model.activity.contains(where: { $0.status.isFinal }) {
          Button("Clear") { model.clearFinished() }.buttonStyle(GhostButtonStyle())
        }
      }
      if model.activity.isEmpty {
        EmptyBox(title: nil, detail: "Things you send and receive show up here.")
      } else {
        Card {
          ForEach(Array(model.activity.enumerated()), id: \.element.id) { i, transfer in
            if i > 0 { Hairline() }
            ActivityRow(transfer: transfer)
          }
        }
      }
    }
  }
}

// MARK: - Composer

/// Drop zone and buttons for picking what to send. Shows the selection once there is one.
struct Composer: View {
  @EnvironmentObject var model: AppModel
  @State private var writing = false
  @State private var targeted = false

  var body: some View {
    Group {
      if writing {
        TextComposer(
          action: "Choose Device",
          onSubmit: { text in
            writing = false
            model.select(text: text)
          },
          onCancel: { writing = false })
      } else if let pending = model.pending {
        selection(pending)
      } else {
        dropZone
      }
    }
    .dropDestination(for: URL.self) { urls, _ in
      model.select(files: urls.filter(\.isFileURL))
      writing = false
      return true
    } isTargeted: { targeted = $0 }
  }

  private var dropZone: some View {
    VStack(spacing: 14) {
      VStack(spacing: 4) {
        Image(systemName: "arrow.down.doc")
          .font(.system(size: 20, weight: .light))
          .foregroundStyle(Palette.text)
        Text(targeted ? "Release to add" : "Drop files or folders here")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(Palette.text)
          .padding(.top, 4)
        Text("Then choose a device below.")
          .font(.system(size: 11))
          .foregroundStyle(Palette.secondary)
      }
      HStack(spacing: 8) {
        Button { model.chooseFiles() } label: { Label("Choose Files…", systemImage: "folder") }
          .buttonStyle(SecondaryButtonStyle())
          .keyboardShortcut("o", modifiers: .command)
        Button { writing = true } label: { Label("Text", systemImage: "textformat") }
          .buttonStyle(SecondaryButtonStyle())
          .keyboardShortcut("t", modifiers: .command)
        Button { model.pasteIntoComposer() } label: { Label("Paste", systemImage: "doc.on.clipboard") }
          .buttonStyle(SecondaryButtonStyle())
          .keyboardShortcut("v", modifiers: .command)
      }
      .labelStyle(.titleAndIcon)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 24)
    .background(
      RoundedRectangle(cornerRadius: 12)
        .fill(targeted ? Palette.surfaceHover : Palette.surface)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 12)
        .strokeBorder(
          targeted ? Palette.text : Palette.borderStrong,
          style: StrokeStyle(lineWidth: 1, dash: targeted ? [] : [5, 4]))
    )
  }

  private func selection(_ share: PendingShare) -> some View {
    let isText = share.files.isEmpty
    let title = isText
      ? "Text"
      : share.files.count == 1 ? share.files[0].lastPathComponent : "\(share.files.count) items"
    let detail = isText
      ? (share.text ?? "")
      : share.files.prefix(3).map(\.lastPathComponent).joined(separator: ", ")
        + (share.files.count > 3 ? " +\(share.files.count - 3)" : "")
    return HStack(spacing: 12) {
      Image(systemName: isText ? "textformat" : share.files.count > 1 ? "square.stack" : "doc")
        .font(.system(size: 15))
        .foregroundStyle(Palette.text)
        .frame(width: 34, height: 34)
        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.background))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.border))
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(Palette.text)
          .lineLimit(1)
        Text(detail)
          .font(.system(size: 11))
          .foregroundStyle(Palette.secondary)
          .lineLimit(2)
      }
      Spacer()
      Text(model.pendingSentTo.isEmpty
        ? "Choose a device ↓"
        : "Sent to \(model.pendingSentTo.count) · pick another ↓")
        .font(.system(size: 11))
        .foregroundStyle(Palette.tertiary)
    }
    .padding(12)
    .background(RoundedRectangle(cornerRadius: 12).fill(Palette.surface))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.text))
  }
}

struct EmptyBox: View {
  let title: String?
  let detail: String

  var body: some View {
    VStack(spacing: 4) {
      if let title {
        Text(title).font(.system(size: 13, weight: .medium)).foregroundStyle(Palette.text)
      }
      Text(detail)
        .font(.system(size: 11))
        .foregroundStyle(Palette.secondary)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 22)
    .padding(.horizontal, 16)
    .overlay(
      RoundedRectangle(cornerRadius: 12)
        .strokeBorder(Palette.border, style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
  }
}

// MARK: - Settings

struct SettingsSheet: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      Text("Settings").font(.system(size: 16, weight: .semibold))

      VStack(alignment: .leading, spacing: 8) {
        SectionHeader("This device")
        Card {
          HStack(spacing: 12) {
            Text("Name").font(.system(size: 13)).foregroundStyle(Palette.secondary).frame(width: 60, alignment: .leading)
            TextField("Name", text: $name)
              .textFieldStyle(.plain)
              .font(.system(size: 13, weight: .medium))
              .onSubmit { model.rename(name) }
          }
          .padding(12)
          Hairline()
          HStack {
            VStack(alignment: .leading, spacing: 1) {
              Text("Visible").font(.system(size: 13))
              Text("Nearby devices can find you and send you things.")
                .font(.system(size: 11))
                .foregroundStyle(Palette.secondary)
            }
            Spacer()
            Toggle("Visible", isOn: $model.visible)
              .toggleStyle(MonoToggleStyle(small: false))
              .labelsHidden()
          }
          .padding(12)
        }
      }

      VStack(alignment: .leading, spacing: 8) {
        SectionHeader("Linked devices")
        Card {
          ForEach(model.links) { link in
            HStack(spacing: 10) {
              DeviceGlyph(platform: link.platform, size: 26)
              Text(link.name).font(.system(size: 13, weight: .medium)).lineLimit(1)
              Spacer()
              Button("Unlink") { model.unlink(link) }.buttonStyle(GhostButtonStyle())
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            Hairline()
          }
          Text(
            (model.links.isEmpty
              ? "No linked devices. Right-click a nearby device › Link Device… "
              : "")
              + "Text sent between linked devices goes straight to the clipboard. Files still ask first."
          )
          .font(.system(size: 11))
          .foregroundStyle(Palette.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(12)
        }
      }

      HStack {
        Spacer()
        Button("Done") {
          model.rename(name)
          dismiss()
        }
        .buttonStyle(PrimaryButtonStyle())
        .keyboardShortcut(.defaultAction)
      }
    }
    .padding(22)
    .frame(width: 420)
    .background(Palette.background)
    .onAppear { name = model.deviceName }
  }
}
