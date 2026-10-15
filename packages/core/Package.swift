// swift-tools-version:5.9
// Shared Swift core used by the iOS Expo module (via CocoaPods) and the macOS app (via SwiftPM).
import PackageDescription

let package = Package(
  name: "CrosshareKit",
  platforms: [.iOS("15.1"), .macOS(.v13)],
  products: [
    .library(name: "CrosshareKit", targets: ["CrosshareKit"])
  ],
  targets: [
    .target(name: "CrosshareKit", path: "ios/Kit"),
    .executableTarget(name: "cs-cli", dependencies: ["CrosshareKit"], path: "ios/cli"),
  ]
)
