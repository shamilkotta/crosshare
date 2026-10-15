import AppKit
import CrossshareKit
import SwiftUI

@main
struct CrossshareApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var model = AppModel()

  var body: some Scene {
    Window("Crossshare", id: "main") {
      ContentView()
        .environmentObject(model)
        .frame(minWidth: 520, minHeight: 480)
    }
    .windowResizability(.contentMinSize)

    MenuBarExtra {
      MenuBarContent().environmentObject(model)
    } label: {
      Image(systemName: model.transfers.contains { !$0.status.isFinal } ? "arrow.up.arrow.down.circle.fill" : "antenna.radiowaves.left.and.right")
    }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  // Keep running in the menu bar so the Mac stays discoverable.
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}

struct MenuBarContent: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.openWindow) private var openWindow

  var body: some View {
    Toggle("Receiving", isOn: $model.visible)
    Text("\(model.peers.count) nearby")
    Divider()
    Button("Open Crossshare") {
      openWindow(id: "main")
      NSApp.activate(ignoringOtherApps: true)
    }
    Button("Quit") { NSApp.terminate(nil) }
  }
}
