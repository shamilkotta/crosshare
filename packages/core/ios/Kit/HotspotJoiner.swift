import Foundation

#if os(iOS)
import NetworkExtension

/// Joins the temporary Wi-Fi network an Android peer hosts for a fast transfer.
/// Requires the `com.apple.developer.networking.HotspotConfiguration` entitlement.
enum HotspotJoiner {
  static var isSupported: Bool {
    Bundle.main.object(forInfoDictionaryKey: "CrosshareHotspotJoin") as? Bool ?? false
  }

  static func join(ssid: String, passphrase: String) async throws {
    let config = passphrase.isEmpty
      ? NEHotspotConfiguration(ssid: ssid)
      : NEHotspotConfiguration(ssid: ssid, passphrase: passphrase, isWEP: false)
    config.joinOnce = true
    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      NEHotspotConfigurationManager.shared.apply(config) { error in
        if let error = error as NSError?,
          !(error.domain == NEHotspotConfigurationErrorDomain
            && error.code == NEHotspotConfigurationError.alreadyAssociated.rawValue)
        {
          cont.resume(throwing: error)
        } else {
          cont.resume()
        }
      }
    }
    // Give DHCP a moment before the first connection attempt.
    try await Task.sleep(nanoseconds: 1_500_000_000)
  }

  static func leave(ssid: String) {
    NEHotspotConfigurationManager.shared.removeConfiguration(forSSID: ssid)
  }
}

#elseif os(macOS)
import CoreLocation
import CoreWLAN

/// Joins the temporary Wi-Fi network an Android peer hosts for a fast transfer.
/// The Mac leaves its current Wi-Fi network while the transfer runs.
enum HotspotJoiner {
  static var isSupported: Bool {
    CWWiFiClient.shared().interface() != nil
  }

  static func join(ssid: String, passphrase: String) async throws {
    guard let iface = CWWiFiClient.shared().interface() else {
      throw CSError.unreachable("No Wi-Fi interface")
    }
    await ensureLocationAccess()
    try await Task.detached {
      var network: CWNetwork?
      for _ in 0..<3 where network == nil {
        let found = try iface.scanForNetworks(withSSID: Data(ssid.utf8))
        network = found.first { $0.ssid == ssid } ?? found.first
      }
      guard let network else { throw CSError.unreachable("Hotspot \(ssid) not found") }
      try iface.associate(to: network, password: passphrase.isEmpty ? nil : passphrase)
    }.value
    try await Task.sleep(nanoseconds: 1_500_000_000)
  }

  private static let location = CLLocationManager()

  /// CoreWLAN hides network names from apps without location access, so ask the first time we need it.
  private static func ensureLocationAccess() async {
    let undetermined = await MainActor.run { () -> Bool in
      guard location.authorizationStatus == .notDetermined else { return false }
      location.requestWhenInUseAuthorization()
      return true
    }
    guard undetermined else { return }
    for _ in 0..<60 {
      try? await Task.sleep(nanoseconds: 500_000_000)
      if await MainActor.run(body: { location.authorizationStatus != .notDetermined }) { return }
    }
  }

  static func leave(ssid: String) {
    guard let iface = CWWiFiClient.shared().interface(), iface.ssid() == ssid else { return }
    iface.disassociate()
    // macOS rejoins a known network on its own after disassociating.
  }
}
#endif
