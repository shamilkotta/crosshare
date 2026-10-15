import AppKit
import CrosshareKit
import SwiftUI

@main
struct CrosshareApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var model = AppModel.shared

  var body: some Scene {
    Window("Crosshare", id: "main") {
      ContentView()
        .environmentObject(model)
        .frame(minWidth: 520, minHeight: 480)
    }
    .windowResizability(.contentMinSize)

    MenuBarExtra {
      MenuBarContent().environmentObject(model)
    } label: {
      MenuBarIcon().environmentObject(model)
    }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  // Keep running in the menu bar so the Mac stays discoverable.
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

  /// Open With, files dropped on the Dock icon, and the share extension.
  func application(_ application: NSApplication, open urls: [URL]) {
    AppModel.shared.receive(urls)
  }
}

/// Always on screen, so it also brings the window back when another app shares something.
struct MenuBarIcon: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.openWindow) private var openWindow

  /// The Crosshare mark as a template image, so the menu bar tints it for light/dark.
  private static let logo: NSImage? = {
    guard let image = Bundle.main.image(forResource: "MenuBarIcon") else { return nil }
    image.isTemplate = true
    return image
  }()

  var body: some View {
    icon
      .onChange(of: model.pending?.id) { id in
        guard id != nil else { return }
        openWindow(id: "main")
        NSApp.activate(ignoringOtherApps: true)
      }
  }

  @ViewBuilder private var icon: some View {
    if model.transfers.contains(where: { !$0.status.isFinal }) {
      Image(systemName: "arrow.up.arrow.down.circle.fill")
    } else if let logo = Self.logo {
      Image(nsImage: logo)
    } else {
      Image(systemName: "antenna.radiowaves.left.and.right")
    }
  }
}

struct MenuBarContent: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.openWindow) private var openWindow

  var body: some View {
    Toggle("Receiving", isOn: $model.visible)
    Text("\(model.peers.count) nearby")
    Divider()
    Button("Open Crosshare") {
      openWindow(id: "main")
      NSApp.activate(ignoringOtherApps: true)
    }
    Button("Quit") { NSApp.terminate(nil) }
  }
}
