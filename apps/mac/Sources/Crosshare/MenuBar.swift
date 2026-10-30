import AppKit
import CrosshareKit
import SwiftUI

/// Menu bar popup: the same sections as the window, compact.
struct MenuBarPopup: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.openWindow) private var openWindow

  var body: some View {
    VStack(spacing: 0) {
      header
      Hairline()
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          if !model.requests.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
              SectionHeader("Requests")
              ForEach(model.requests, id: \.id) { RequestCard(transfer: $0, compact: true) }
            }
          }
          if let pending = model.pending {
            HStack(spacing: 8) {
              Image(systemName: pending.files.isEmpty ? "textformat" : "doc")
                .font(.system(size: 11))
              Text(pending.files.isEmpty ? "Text ready to send" : "\(pending.files.count) item(s) ready to send")
                .font(.system(size: 12, weight: .medium))
              Spacer()
              Button(model.pendingSentTo.isEmpty ? "Clear" : "Done") { model.pending = nil }
                .buttonStyle(GhostButtonStyle())
            }
            .padding(10)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.text))
          }
          VStack(alignment: .leading, spacing: 6) {
            SectionHeader(title: "Devices") {
              ProgressView().controlSize(.mini)
            }
            if model.devices.isEmpty {
              Text("Looking for devices…")
                .font(.system(size: 12))
                .foregroundStyle(Palette.secondary)
                .padding(.vertical, 6)
            } else {
              Card {
                ForEach(Array(model.devices.enumerated()), id: \.element.id) { i, device in
                  if i > 0 { Hairline() }
                  DeviceRow(device: device, compact: true) { peer in
                    model.textTarget = peer
                    openMain()
                  }
                }
              }
            }
          }
          let recent = Array(model.activity.prefix(4))
          if !recent.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
              SectionHeader(title: "Activity") {
                if model.activity.contains(where: { $0.status.isFinal }) {
                  Button("Clear") { model.clearFinished() }.buttonStyle(GhostButtonStyle())
                }
              }
              Card {
                ForEach(Array(recent.enumerated()), id: \.element.id) { i, transfer in
                  if i > 0 { Hairline() }
                  ActivityRow(transfer: transfer, compact: true)
                }
              }
            }
          }
        }
        .padding(12)
      }
      .frame(maxHeight: 460)
      Hairline()
      footer
    }
    .frame(width: 320)
    .background(Palette.background)
  }

  private var header: some View {
    HStack(spacing: 10) {
      DeviceGlyph(platform: .macos, size: 28, dim: !model.visible)
      VStack(alignment: .leading, spacing: 1) {
        Text(model.deviceName)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(Palette.text)
          .lineLimit(1)
        Text(model.visible ? "Visible to nearby devices" : "Hidden")
          .font(.system(size: 11))
          .foregroundStyle(Palette.secondary)
      }
      Spacer()
      Toggle("Visible", isOn: $model.visible)
        .toggleStyle(MonoToggleStyle(small: true))
        .labelsHidden()
    }
    .padding(12)
  }

  private var footer: some View {
    HStack {
      Button("Open Crosshare") { openMain() }.buttonStyle(GhostButtonStyle())
      Spacer()
      Button("Quit") { NSApp.terminate(nil) }.buttonStyle(GhostButtonStyle())
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 6)
  }

  private func openMain() {
    openWindow(id: "main")
    NSApp.activate(ignoringOtherApps: true)
  }
}
