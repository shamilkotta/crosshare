import AppKit
import CrosshareKit
import SwiftUI

/// Monochrome palette shared with the mobile app (apps/mobile/constants/theme.ts).
enum Palette {
  static let background = dynamic(0xFFFFFF, 0x0A0A0A)
  static let surface = dynamic(0xFAFAFA, 0x111111)
  static let surfaceHover = dynamic(0xF2F2F2, 0x1A1A1A)
  static let text = dynamic(0x0A0A0A, 0xEDEDED)
  static let secondary = dynamic(0x666666, 0xA1A1A1)
  static let tertiary = dynamic(0xA3A3A3, 0x5C5C5C)
  static let border = dynamic(0xEBEBEB, 0x1F1F1F)
  static let borderStrong = dynamic(0xD4D4D4, 0x2E2E2E)
  static let inverse = dynamic(0x0A0A0A, 0xEDEDED)
  static let onInverse = dynamic(0xFFFFFF, 0x0A0A0A)

  private static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
    Color(NSColor(name: nil) { appearance in
      let hex = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
      return NSColor(
        srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
        green: CGFloat((hex >> 8) & 0xFF) / 255,
        blue: CGFloat(hex & 0xFF) / 255,
        alpha: 1)
    })
  }
}

// MARK: - Buttons

struct PrimaryButtonStyle: ButtonStyle {
  @Environment(\.isEnabled) private var enabled
  var compact = false

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: compact ? 12 : 13, weight: .medium))
      .foregroundStyle(Palette.onInverse)
      .padding(.horizontal, compact ? 10 : 14)
      .frame(height: compact ? 24 : 30)
      .background(RoundedRectangle(cornerRadius: 7).fill(Palette.inverse))
      .opacity(!enabled ? 0.4 : configuration.isPressed ? 0.75 : 1)
      .contentShape(Rectangle())
  }
}

struct SecondaryButtonStyle: ButtonStyle {
  @Environment(\.isEnabled) private var enabled
  var compact = false

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: compact ? 12 : 13, weight: .medium))
      .foregroundStyle(Palette.text)
      .padding(.horizontal, compact ? 10 : 14)
      .frame(height: compact ? 24 : 30)
      .background(
        RoundedRectangle(cornerRadius: 7)
          .fill(configuration.isPressed ? Palette.surfaceHover : Palette.background)
      )
      .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Palette.borderStrong))
      .opacity(enabled ? 1 : 0.4)
      .contentShape(Rectangle())
  }
}

struct GhostButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 12, weight: .medium))
      .foregroundStyle(Palette.secondary)
      .padding(.horizontal, 6)
      .frame(height: 22)
      .background(
        RoundedRectangle(cornerRadius: 5)
          .fill(configuration.isPressed ? Palette.surfaceHover : .clear)
      )
      .contentShape(Rectangle())
  }
}

// MARK: - Building blocks

struct SectionHeader<Trailing: View>: View {
  let title: String
  @ViewBuilder var trailing: Trailing

  var body: some View {
    HStack {
      Text(title)
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(Palette.secondary)
      Spacer()
      trailing
    }
    .frame(minHeight: 22)
  }
}

extension SectionHeader where Trailing == EmptyView {
  init(_ title: String) {
    self.title = title
    self.trailing = EmptyView()
  }
}

/// Bordered card that hosts rows.
struct Card<Content: View>: View {
  @ViewBuilder var content: Content

  var body: some View {
    VStack(spacing: 0) { content }
      .background(RoundedRectangle(cornerRadius: 10).fill(Palette.background))
      .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Palette.border))
      .clipShape(RoundedRectangle(cornerRadius: 10))
  }
}

struct Hairline: View {
  var body: some View { Rectangle().fill(Palette.border).frame(height: 1) }
}

struct DeviceGlyph: View {
  let platform: CSPlatform
  var size: CGFloat = 30
  var dim = false

  var body: some View {
    Image(systemName: platform == .macos ? "laptopcomputer" : "iphone")
      .font(.system(size: size * 0.44, weight: .regular))
      .foregroundStyle(Palette.text)
      .frame(width: size, height: size)
      .background(RoundedRectangle(cornerRadius: size * 0.28).fill(Palette.surface))
      .overlay(RoundedRectangle(cornerRadius: size * 0.28).strokeBorder(Palette.border))
      .opacity(dim ? 0.5 : 1)
  }
}

struct Tag: View {
  let label: String

  var body: some View {
    Text(label)
      .font(.system(size: 10, weight: .medium))
      .foregroundStyle(Palette.secondary)
      .padding(.horizontal, 6)
      .padding(.vertical, 1)
      .overlay(Capsule().strokeBorder(Palette.borderStrong))
  }
}

struct ProgressBar: View {
  let value: Double

  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule().fill(Palette.border)
        Capsule().fill(Palette.text).frame(width: geo.size.width * min(max(value, 0), 1))
      }
    }
    .frame(height: 3)
  }
}

/// Row background that lights up on hover.
struct HoverRow: ViewModifier {
  @State private var hovering = false

  func body(content: Content) -> some View {
    content
      .background(hovering ? Palette.surfaceHover.opacity(0.7) : .clear)
      .onHover { hovering = $0 }
  }
}

extension View {
  func hoverRow() -> some View { modifier(HoverRow()) }
}

// MARK: - Formatting

func formatBytes(_ n: Int64) -> String { ByteCountFormatter.string(fromByteCount: n, countStyle: .file) }

func routeLabel(_ routes: [String]) -> String {
  switch routes.first {
  case "wifi": return "Wi-Fi"
  case "aware": return "Wi-Fi Aware"
  default: return "Bluetooth"
  }
}

/// What a transfer carries, in a few words.
func transferTitle(_ t: Transfer) -> String {
  if t.kind == .link { return "Link with \(t.peerName)" }
  if t.files.isEmpty {
    return t.text?.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
      .joined(separator: " ") ?? "Text"
  }
  return t.files.count == 1 ? t.files[0].name : "\(t.files.count) files"
}

/// Status line under a transfer, e.g. "To Pixel · 42% of 12 MB".
func transferCaption(_ t: Transfer) -> String {
  let who = (t.direction == .incoming ? "From " : "To ") + t.peerName
  if t.kind == .link {
    switch t.status {
    case .completed: return "Linked"
    case .declined: return "Declined"
    case .failed: return "Failed"
    case .cancelled: return "Cancelled"
    default: return "Waiting for \(t.peerName) to respond…"
    }
  }
  switch t.status {
  case .connecting: return "\(who) · Connecting…"
  case .waiting: return "\(who) · Waiting for them to accept…"
  case .upgrading: return "\(who) · Switching to a faster connection…"
  case .transferring:
    guard t.totalBytes > 0 else { return "\(who) · Sending…" }
    let pct = Int(Double(t.transferredBytes) / Double(t.totalBytes) * 100)
    return "\(who) · \(pct)% of \(formatBytes(t.totalBytes))"
  case .completed:
    if t.direction == .incoming && t.files.isEmpty { return "\(who) · Copied to clipboard" }
    return "\(who) · \(t.direction == .incoming ? "Received" : "Sent")"
  case .declined: return "\(who) · Declined"
  case .cancelled: return "\(who) · Cancelled"
  case .failed: return "\(who) · Failed" + (t.error.map { ": \($0)" } ?? "")
  }
}

/// Black-and-white switch (the system one is always accent coloured).
struct MonoToggleStyle: ToggleStyle {
  var small = false

  func makeBody(configuration: Configuration) -> some View {
    let w: CGFloat = small ? 26 : 32
    let h: CGFloat = small ? 16 : 18
    Button { configuration.isOn.toggle() } label: {
      ZStack(alignment: configuration.isOn ? .trailing : .leading) {
        Capsule().fill(configuration.isOn ? Palette.inverse : Palette.borderStrong)
        Circle().fill(Palette.background).padding(2)
      }
      .frame(width: w, height: h)
      .animation(.easeOut(duration: 0.15), value: configuration.isOn)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text("Visible"))
    .accessibilityValue(Text(configuration.isOn ? "On" : "Off"))
  }
}
