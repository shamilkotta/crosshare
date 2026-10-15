# @crossshare/core

Native discovery and transfer engine for Crossshare, as an Expo module.

- `ios/Kit`: Swift engine shared by the iOS module and the macOS app (`Package.swift`)
- `ios/CrossshareCoreModule.swift`: Expo bridge for iOS
- `android/.../protocol`: Kotlin protocol (plain JVM, unit-tested)
- `android/.../core`: Android transports and the Expo bridge
- `src`: TypeScript API

See [docs/PROTOCOL.md](../../docs/PROTOCOL.md) for the wire protocol.

## Testing the protocol

```sh
swift build                          # builds the Swift engine and cs-cli
.build/debug/cs-cli listen --port 47001 &
.build/debug/cs-cli send --port 47001 some-file
```

The Android unit tests run the Kotlin engine against itself and against `cs-cli`:

```sh
cd apps/mobile/android
CS_CLI=$PWD/../../../packages/core/.build/debug/cs-cli ./gradlew :crossshare-core:testDebugUnitTest
```
