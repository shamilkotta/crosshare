# Crossshare

AirDrop-style sharing between Android, iOS and macOS. You don't need a shared Wi-Fi network.

| Pair | Discovery | Transfer |
|---|---|---|
| Any two devices on the same Wi-Fi | Bonjour / mDNS | TCP over the LAN |
| iPhone ↔ iPhone ↔ Mac, no shared network | Bonjour over AWDL (Apple peer-to-peer Wi-Fi) | TCP over AWDL |
| Paired iPhones on iOS 26+ | Wi-Fi Aware | TCP over Wi-Fi Aware |
| Android ↔ Android, no shared network | Bluetooth LE | Bluetooth L2CAP. Large transfers switch to Wi-Fi Aware, or a temporary hotspot if either phone lacks it |
| Android ↔ iPhone/Mac, no shared network | Bluetooth LE | Bluetooth L2CAP. Large transfers switch to a temporary hotspot hosted by the Android device |

Everything is end-to-end encrypted (ECDH P-256 + AES-256-GCM) by our own protocol, whatever the link.
See [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Layout

```
packages/core      Native engine + Expo module (@crossshare/core)
  ios/Kit          Swift engine, shared by iOS and macOS
  ios/cli          cs-cli: Swift test harness
  android/...      Kotlin engine (protocol/ is plain JVM and unit-tested)
apps/mobile        Expo / React Native app (iOS + Android)
apps/mac           SwiftUI macOS app (menu bar + window)
docs/PROTOCOL.md   Wire protocol
```

## Running

### Mobile (needs a dev build; Expo Go can't load the native module)

```sh
pnpm install
cd apps/mobile
npx expo prebuild          # generates ios/ and android/ (not committed)
npx expo run:android --device
npx expo run:ios --device
```

Use real devices. Simulators and emulators have no usable Bluetooth or AWDL.

iOS joins an Android hotspot through `NEHotspotConfiguration`, which needs the **Hotspot** capability
on your App ID. If your team can't use it, set `["@crossshare/core", { "hotspot": false }]` in
`app.json`. iOS↔Android transfers without shared Wi-Fi then stay on Bluetooth, which is slower.

Wi-Fi Aware (iOS 26+) needs the **Wi-Fi Aware** capability, which is only available to paid
developer teams. To build without it, set `{ "wifiAware": false }` in the same plugin options.
Pair devices once from the profile screen (Show code / Enter code). The frameworks are
weak-linked, so the app still runs on iOS 15.1–25.

### macOS

```sh
apps/mac/build.sh
open apps/mac/build/Crossshare.app
```

Received files go to `~/Downloads`. On Android they go to `Downloads/Crossshare`; on iOS to
Files › On My iPhone › Crossshare.

## Tests

```sh
cd packages/core && swift build          # Swift engine + cs-cli
cd apps/mobile/android
CS_CLI=$PWD/../../../packages/core/.build/debug/cs-cli ./gradlew :crossshare-core:testDebugUnitTest
```

These tests cover Kotlin↔Kotlin and real Kotlin↔Swift transfers in both directions, declines, and
the hotspot and Wi-Fi Aware upgrade flows (simulated over loopback).

## Known limits

- iOS can't receive while the app is fully closed. Only Apple's own AirDrop can. Keep the app open
  (or recently backgrounded) on the receiving iPhone.
- Android must be visible to iPhones in the foreground: iOS hides background BLE advertisements
  from non-Apple scanners.
- Bluetooth needs Android 10+ (L2CAP). Older Android devices work over shared Wi-Fi only.
- A Mac joining an Android hotspot leaves its current Wi-Fi network for the duration of the transfer.
