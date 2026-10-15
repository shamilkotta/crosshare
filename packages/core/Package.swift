// swift-tools-version:5.9
// Shared Swift core used by the iOS Expo module (via CocoaPods) and the macOS app (via SwiftPM).
import PackageDescription

let package = Package(
  name: "CrossshareKit",
  platforms: [.iOS("15.1"), .macOS(.v13)],
  products: [
    .library(name: "CrossshareKit", targets: ["CrossshareKit"])
  ],
  targets: [
    .target(name: "CrossshareKit", path: "ios/Kit"),
    .executableTarget(name: "cs-cli", dependencies: ["CrossshareKit"], path: "ios/cli"),
  ]
)
