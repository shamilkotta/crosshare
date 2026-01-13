# @crossshare/lan

Local network device discovery for Crossshare using mDNS/Bonjour. This Expo native module enables peer-to-peer device discovery on the same Wi-Fi network.

## Features

- 📡 Advertise this device on local network
- 🔍 Discover other Crossshare devices
- 🎯 Resolve device IP + port
- 📱 iOS (Bonjour) and Android (NSD) support
- ⚡ Event-based peer discovery

## Installation

```bash
npm install @crossshare/lan
# or
pnpm add @crossshare/lan
```

For bare React Native projects, run `npx pod-install` after installation.

## Configuration

### iOS

Add the following to your `Info.plist` (can be done via `app.json` plugins):

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>Find nearby devices to share files</string>

<key>NSBonjourServices</key>
<array>
  <string>_crossshare._tcp</string>
</array>
```

### Android

The module automatically includes the required permissions in its manifest:

- `INTERNET`
- `ACCESS_WIFI_STATE`
- `ACCESS_NETWORK_STATE`
- `CHANGE_WIFI_MULTICAST_STATE`
- `NEARBY_WIFI_DEVICES` (Android 13+)

## Usage

```typescript
import CrossshareLan, { LanPeer } from '@crossshare/lan';

// Listen for discovered peers
const peerFoundSubscription = CrossshareLan.addListener(
  'onPeerFound',
  (peer: LanPeer) => {
    console.log('Found peer:', peer.name, peer.host, peer.port);
  }
);

const peerLostSubscription = CrossshareLan.addListener(
  'onPeerLost',
  ({ peerId }) => {
    console.log('Lost peer:', peerId);
  }
);

// Start discovery
await CrossshareLan.startDiscovery();

// Start advertising this device
await CrossshareLan.startAdvertising({
  serviceName: 'MyDevice',
  port: 8080,
  meta: { customKey: 'customValue' },
});

// Get currently discovered peers
const peers = await CrossshareLan.getDiscoveredPeers();

// Stop when done
await CrossshareLan.stopDiscovery();
await CrossshareLan.stopAdvertising();

// Clean up listeners
peerFoundSubscription.remove();
peerLostSubscription.remove();
```

## API

### Types

```typescript
type LanPeer = {
  id: string; // Unique device identifier
  name: string; // Device display name
  host: string; // IP address
  port: number; // Service port
  platform: 'ios' | 'android' | 'macos';
  meta?: Record<string, string>;
};

type StartAdvertisingOptions = {
  serviceName: string;
  port: number;
  meta?: Record<string, string>;
};
```

### Methods

| Method                      | Description                             |
| --------------------------- | --------------------------------------- |
| `startAdvertising(options)` | Start advertising this device           |
| `stopAdvertising()`         | Stop advertising                        |
| `startDiscovery()`          | Start discovering nearby devices        |
| `stopDiscovery()`           | Stop discovery                          |
| `getDiscoveredPeers()`      | Get array of currently discovered peers |

### Events

| Event         | Payload                             | Description                         |
| ------------- | ----------------------------------- | ----------------------------------- |
| `onPeerFound` | `LanPeer`                           | Fired when a new peer is discovered |
| `onPeerLost`  | `{ peerId: string }`                | Fired when a peer is lost           |
| `onError`     | `{ code: string, message: string }` | Fired on error                      |

## Error Codes

| Code                 | Description                  |
| -------------------- | ---------------------------- |
| `PERMISSION_DENIED`  | Local network access denied  |
| `WIFI_NOT_CONNECTED` | Device not on Wi-Fi          |
| `RESOLUTION_FAILED`  | Service resolution failed    |
| `MULTICAST_BLOCKED`  | Multicast blocked by network |
| `ADVERTISING_FAILED` | Failed to register service   |
| `DISCOVERY_FAILED`   | Failed to start discovery    |

## Service Definition

The module uses the following mDNS service configuration:

- **Service Type**: `_crossshare._tcp`
- **TXT Records**: `id`, `platform`, `version`

## License

MIT
