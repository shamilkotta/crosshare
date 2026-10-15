import Foundation
import Network

/// A paired Wi-Fi Aware device that is nearby and publishing our service.
struct AwareFound {
  /// The WAPairedDevice id, as a string.
  let key: String
  let name: String
  let endpoint: NWEndpoint
}

#if os(iOS) && canImport(WiFiAware)
import DeviceDiscoveryUI
import UIKit
import WiFiAware

/// Wi-Fi Aware (iOS 26+): fast peer-to-peer Wi-Fi with devices the user has paired once.
/// Needs the `com.apple.developer.wifi-aware` entitlement and `_crossshare._tcp` declared under
/// `WiFiAwareServices` in Info.plist (the config plugin adds both).
final class AwareTransport: @unchecked Sendable {
  private let queue = DispatchQueue(label: "crossshare.aware")
  private var listener: NWListener?
  private var browser: NWBrowser?
  private var browseParameters: NWParameters?

  var onPeersChanged: (([String: AwareFound]) -> Void)?
  /// Incoming connection plus the paired device id it came from, when known.
  var onIncoming: ((NWByteStream) -> Void)?
  var onError: ((String) -> Void)?

  static var isSupported: Bool {
    guard #available(iOS 26.0, *) else { return false }
    return WACapabilities.supportedFeatures.contains(.wifiAware)
      && WAPublishableService.allServices[Constants.serviceType] != nil
      && WASubscribableService.allServices[Constants.serviceType] != nil
  }

  // MARK: Publishing (we can be connected to)

  func startListening() {
    guard #available(iOS 26.0, *), Self.isSupported, listener == nil,
      let service = WAPublishableService.allServices[Constants.serviceType]
    else { return }
    do {
      let provider = WAPublisherListener.wifiAware(.connecting(to: service, from: .allPairedDevices))
      let params = NWParameters.tcp
      provider.configureParameters(params)
      params.wifiAware.performanceMode = .bulk
      let listener = try NWListener(using: params)
      listener.service = provider.service
      listener.newConnectionHandler = { [weak self] conn in
        self?.onIncoming?(NWByteStream(conn))
      }
      listener.stateUpdateHandler = { [weak self] state in
        if case .failed(let error) = state { self?.onError?("Wi-Fi Aware listener failed: \(error)") }
      }
      listener.start(queue: queue)
      self.listener = listener
    } catch {
      onError?("Could not start Wi-Fi Aware listener: \(error)")
    }
  }

  func stopListening() {
    listener?.cancel()
    listener = nil
  }

  // MARK: Subscribing (finding paired devices nearby)

  func startBrowsing() {
    guard #available(iOS 26.0, *), Self.isSupported, browser == nil,
      let service = WASubscribableService.allServices[Constants.serviceType]
    else { return }
    let provider = WASubscriberBrowser.wifiAware(.connecting(to: .allPairedDevices, from: service))
    let params = provider.configureParameters(NWParameters.tcp)
    params.wifiAware.performanceMode = .bulk
    browseParameters = params
    let browser = NWBrowser(for: provider.makeDescriptor(), using: params)
    browser.browseResultsChangedHandler = { [weak self] results, _ in
      var found: [String: AwareFound] = [:]
      for result in results {
        guard let endpoint = try? provider.makeEndpoint(from: result) else { continue }
        let device = endpoint.device
        let key = String(device.id)
        found[key] = AwareFound(
          key: key,
          name: device.name ?? device.pairingInfo?.pairingName ?? "Paired device",
          endpoint: result.endpoint)
      }
      self?.onPeersChanged?(found)
    }
    browser.stateUpdateHandler = { [weak self] state in
      if case .failed(let error) = state { self?.onError?("Wi-Fi Aware browser failed: \(error)") }
    }
    browser.start(queue: queue)
    self.browser = browser
  }

  func stopBrowsing() {
    browser?.cancel()
    browser = nil
    onPeersChanged?([:])
  }

  func connect(to endpoint: NWEndpoint) async throws -> ByteStream {
    guard let params = browseParameters else { throw CSError.unreachable("Wi-Fi Aware is off") }
    let stream = NWByteStream(NWConnection(to: endpoint, using: params))
    try await stream.open(timeout: 20)
    return stream
  }

  /// The paired device on the other end of an incoming connection.
  static func pairedDeviceKey(of stream: NWByteStream) async -> String? {
    guard #available(iOS 26.0, *), let path = stream.connection.currentPath,
      let aware = try? await path.wifiAware
    else { return nil }
    return String(aware.endpoint.device.id)
  }

  // MARK: Pairing (one time per device pair, through system UI)

  /// Shows the system sheet that makes this device pairable and displays a code.
  @MainActor
  static func presentPairingCode(from presenter: UIViewController) throws {
    guard #available(iOS 26.0, *), isSupported,
      let service = WAPublishableService.allServices[Constants.serviceType]
    else { throw CSError.unreachable("Wi-Fi Aware is not available on this device") }
    let provider = WAPublisherListener.wifiAware(.connecting(to: service, from: .userSpecifiedDevices))
    let controller = DDDevicePairingViewController(listenerProvider: provider, access: .default)
    presenter.present(controller, animated: true)
  }

  /// Shows the system picker to find a nearby device and pair with it by entering its code.
  @MainActor
  static func presentPicker(from presenter: UIViewController) async throws {
    guard #available(iOS 26.0, *), isSupported,
      let service = WASubscribableService.allServices[Constants.serviceType]
    else { throw CSError.unreachable("Wi-Fi Aware is not available on this device") }
    let provider = WASubscriberBrowser.wifiAware(.connecting(to: .userSpecifiedDevices, from: service))
    let params = provider.configureParameters(NWParameters.tcp)
    guard let picker = DDDevicePickerViewController(browseDescriptor: provider.makeDescriptor(), parameters: params)
    else { throw CSError.unreachable("Wi-Fi Aware pairing is not supported") }
    presenter.present(picker, animated: true)
    defer { picker.dismiss(animated: true) }
    // Resolves once the user picked a device and pairing finished.
    _ = try await picker.endpoint
  }
}

#else

/// Wi-Fi Aware is iOS-only (macOS has no API for it).
final class AwareTransport: @unchecked Sendable {
  var onPeersChanged: (([String: AwareFound]) -> Void)?
  var onIncoming: ((NWByteStream) -> Void)?
  var onError: ((String) -> Void)?
  static var isSupported: Bool { false }
  func startListening() {}
  func stopListening() {}
  func startBrowsing() {}
  func stopBrowsing() {}
  func connect(to endpoint: NWEndpoint) async throws -> ByteStream {
    throw CSError.unreachable("Wi-Fi Aware is not available")
  }
  static func pairedDeviceKey(of stream: NWByteStream) async -> String? { nil }
}
#endif
