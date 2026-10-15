# Crosshare

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

## Sharing from other apps

Crosshare appears in each platform's share menu. Picking it opens Crosshare with the files or
text selected, on the screen that looks for nearby devices.

- **Android**: the share sheet (one or more files, or text), and "Open with" for any file.
- **iOS**: a share extension (`CrosshareShare`) in the share sheet. It copies what you shared into
  the app group `group.<bundle id>`, then opens Crosshare. Both App IDs (`<bundle id>` and
  `<bundle id>.share`) need the **App Groups** capability with that group. To build without it, set
  `{ "share": false }` in the plugin options.
- **macOS**: Share › Crosshare in Finder, Photos, Safari and other apps; Open With › Crosshare;
  or drop files on the Dock icon. `build.sh` turns the share extension on. If it's missing, enable
  it in System Settings › General › Login Items & Extensions › Sharing.

## Layout

```
packages/core      Native engine + Expo module (@crosshare/core)
  ios/Kit          Swift engine, shared by iOS and macOS
  ios/ShareExtension  iOS share extension (copied into the app by the config plugin)
  ios/cli          cs-cli: Swift test harness
  android/...      Kotlin engine (protocol/ is plain JVM and unit-tested)
apps/mobile        Expo / React Native app (iOS + Android)
apps/mac           SwiftUI macOS app (menu bar + window) and its share extension
docs/PROTOCOL.md   Wire protocol
assets/brand       Logo + app icon SVGs
scripts/generate-icons.py  Regenerates every icon (iOS, Android, macOS, splash, favicon) from the logo geometry
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

`expo prebuild` also adds the iOS share extension target and Android's share intent filters.
Use real devices. Simulators and emulators have no usable Bluetooth or AWDL.

iOS joins an Android hotspot through `NEHotspotConfiguration`, which needs the **Hotspot** capability
on your App ID. If your team can't use it, set `["@crosshare/core", { "hotspot": false }]` in
`app.json`. iOS↔Android transfers without shared Wi-Fi then stay on Bluetooth, which is slower.

Wi-Fi Aware (iOS 26+) needs the **Wi-Fi Aware** capability, which is only available to paid
developer teams. To build without it, set `{ "wifiAware": false }` in the same plugin options.
Pair devices once from the profile screen (Show code / Enter code). The frameworks are
weak-linked, so the app still runs on iOS 15.1–25.

### macOS

```sh
apps/mac/build.sh
open apps/mac/build/Crosshare.app
```

Received files go to `~/Downloads`. On Android they go to `Downloads/Crosshare`; on iOS to
Files › On My iPhone › Crosshare.

## Tests

```sh
cd packages/core && swift build          # Swift engine + cs-cli
cd apps/mobile/android
CS_CLI=$PWD/../../../packages/core/.build/debug/cs-cli ./gradlew :crosshare-core:testDebugUnitTest
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
