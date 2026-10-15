// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "CrosshareMac",
  platforms: [.macOS(.v13)],
  dependencies: [
    .package(path: "../../packages/core")
  ],
  targets: [
    .executableTarget(
      name: "Crosshare",
      dependencies: [.product(name: "CrosshareKit", package: "core")],
      path: "Sources/Crosshare"
    )
  ]
)
