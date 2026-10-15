// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "CrossshareMac",
  platforms: [.macOS(.v13)],
  dependencies: [
    .package(path: "../../packages/core")
  ],
  targets: [
    .executableTarget(
      name: "Crossshare",
      dependencies: [.product(name: "CrossshareKit", package: "core")],
      path: "Sources/Crossshare"
    )
  ]
)
