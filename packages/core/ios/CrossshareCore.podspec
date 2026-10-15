require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'CrossshareCore'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = 'Nearby discovery and file transfer engine for Crossshare (Bonjour/AWDL, Bluetooth LE, hotspot upgrade).'
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/shamilkotta/crossshare.git', :tag => "v#{s.version}" }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreBluetooth', 'Network', 'NetworkExtension', 'CryptoKit'
  # iOS 26 only; weak so the app still launches on iOS 15-25.
  s.weak_frameworks = 'WiFiAware', 'DeviceDiscoveryUI'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  # Kit/ is shared with the macOS app through Package.swift; cli/ is a test harness.
  s.source_files = "*.swift", "Kit/**/*.swift"
end
