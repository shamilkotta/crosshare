# Crosshare mobile

The Expo / React Native app for iOS and Android. The native discovery and transfer engine lives in
[`@crosshare/core`](../../packages/core).

## Running

Crosshare needs a development build. Expo Go can't load the native module.

```sh
pnpm install
npx expo run:android --device
npx expo run:ios --device
```

Use real devices. Simulators and emulators have no usable Bluetooth or AWDL.

Capabilities (App Groups, Hotspot, Wi-Fi Aware) and the plugin options that turn them off are
covered in the [root README](../../README.md#running).
