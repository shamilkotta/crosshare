import AppKit
import ServiceManagement
import CrosshareKit
import SwiftUI
import UserNotifications

@main
struct CrosshareApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var model = AppModel.shared

  var body: some Scene {
    Window("Crosshare", id: "main") {
      ContentView()
        .environmentObject(model)
        .frame(minWidth: 440, idealWidth: 520, minHeight: 560, idealHeight: 720)
    }
    .windowStyle(.hiddenTitleBar)
    .windowResizability(.contentMinSize)
    .commands {
      CommandGroup(replacing: .appTermination) {
        Button("Close Crosshare") { AppDelegate.closeToTray() }
          .keyboardShortcut("q")
      }
    }

    MenuBarExtra {
      MenuBarPopup().environmentObject(model)
    } label: {
      MenuBarIcon().environmentObject(model)
    }
    .menuBarExtraStyle(.window)
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
  static func closeToTray() {
    NSApp.windows.filter(isAppWindow).forEach { $0.close() }
    NSApp.setActivationPolicy(.accessory)
  }

  /// The main window, as opposed to the menu bar popup panel.
  private static func isAppWindow(_ w: NSWindow) -> Bool { !(w is NSPanel) && w.canBecomeMain }

  private var launchedAtLogin = false

  func applicationWillFinishLaunching(_ notification: Notification) {
    let event = NSAppleEventManager.shared().currentAppleEvent
    launchedAtLogin = event?.eventID == kAEOpenApplication
      && event?.paramDescriptor(forKeyword: keyAEPropData)?.enumCodeValue == keyAELaunchedAsLogInItem
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    // Services › Send with Crosshare, for selected text in any app (see NSServices in Info.plist).
    NSApp.servicesProvider = self
    NSUpdateDynamicServices()
    if !UserDefaults.standard.bool(forKey: "loginItemConfigured") {
      try? SMAppService.mainApp.register()
      UserDefaults.standard.set(true, forKey: "loginItemConfigured")
    }
    if launchedAtLogin {
      NSApp.setActivationPolicy(.accessory)
      DispatchQueue.main.async { Self.closeToTray() }
    }
    let nc = NotificationCenter.default
    nc.addObserver(forName: NSWindow.didBecomeKeyNotification, object: nil, queue: .main) { note in
      guard let w = note.object as? NSWindow, Self.isAppWindow(w) else { return }
      if NSApp.activationPolicy() != .regular { NSApp.setActivationPolicy(.regular) }
    }
    nc.addObserver(forName: NSWindow.willCloseNotification, object: nil, queue: .main) { note in
      guard let w = note.object as? NSWindow, Self.isAppWindow(w) else { return }
      DispatchQueue.main.async {
        if !NSApp.windows.contains(where: { Self.isAppWindow($0) && $0.isVisible }) {
          NSApp.setActivationPolicy(.accessory)
        }
      }
    }
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.requestAuthorization(options: [.alert, .sound]) { ok, err in NSLog("CSNOTIF auth ok=\(ok) err=\(String(describing: err))") }
    let accept = UNNotificationAction(identifier: "ACCEPT", title: "Accept", options: [])
    let decline = UNNotificationAction(identifier: "DECLINE", title: "Decline", options: [.destructive])
    let category = UNNotificationCategory(
      identifier: "INCOMING_TRANSFER",
      actions: [accept, decline],
      intentIdentifiers: [],
      options: []
    )
    center.setNotificationCategories([category])
  }

  /// Services menu: selected text waits in the window for the user to pick a device.
  @objc func sendText(
    _ pboard: NSPasteboard, userData: String, error: AutoreleasingUnsafeMutablePointer<NSString>
  ) {
    guard let text = pboard.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines),
      !text.isEmpty
    else { return }
    DispatchQueue.main.async { AppModel.shared.pending = PendingShare(files: [], text: text) }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

  func application(_ application: NSApplication, open urls: [URL]) {
    AppModel.shared.receive(urls)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let id = response.notification.request.identifier
    switch response.actionIdentifier {
    case "ACCEPT":
      DispatchQueue.main.async { AppModel.shared.respondToNotification(transferId: id, accept: true) }
    case "DECLINE":
      DispatchQueue.main.async { AppModel.shared.respondToNotification(transferId: id, accept: false) }
    case UNNotificationDefaultActionIdentifier:
      DispatchQueue.main.async {
        NSApp.windows.first { $0.title == "Crosshare" }?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
      }
    default: break
    }
    completionHandler()
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound])
  }
}

// MARK: - Menu bar icon

struct MenuBarIcon: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.openWindow) private var openWindow

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
    if !model.requests.isEmpty {
      Image(systemName: "tray.and.arrow.down.fill")
    } else if model.transfers.contains(where: { !$0.status.isFinal }) {
      Image(systemName: "arrow.up.arrow.down.circle.fill")
    } else if let logo = Self.logo {
      Image(nsImage: logo)
    } else {
      Image(systemName: "antenna.radiowaves.left.and.right")
    }
  }
}
