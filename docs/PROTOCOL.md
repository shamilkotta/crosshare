# Crossshare protocol v1

Every Crossshare implementation (Swift for iOS/macOS, Kotlin for Android) speaks
this protocol. It runs over any reliable byte stream, which today means TCP
(LAN, Apple AWDL, Android hotspot) or a Bluetooth LE L2CAP channel.

## Discovery

### Bonjour / mDNS (same network, and Apple↔Apple peer-to-peer over AWDL)

- Service type: `_crossshare._tcp`
- Service name: the device id
- TXT record: `id`, `name`, `platform` (`ios` | `android` | `macos`), `v` (`1`)

Apple devices browse and listen with `includePeerToPeer = true`, so two Apple
devices find each other with no shared network.

### Wi-Fi Aware (iOS 26+, paired devices)

- Service: `_crossshare._tcp`, declared as both `Publishable` and `Subscribable` under
  `WiFiAwareServices` in Info.plist. Needs the `com.apple.developer.wifi-aware` entitlement
  (`Publish`, `Subscribe`).
- Devices pair once through system UI: one shows a code (`DevicePairingView`), the other picks it
  and enters the code (`DevicePicker`). After that, a visible device publishes to all paired
  devices and a discovering device subscribes to them. Connections are plain TCP carrying this
  protocol.
- A browse result only identifies the paired device, not the Crossshare id. The first hello on a
  Wi-Fi Aware connection maps paired-device id → Crossshare id, which is then remembered so the
  device merges with its Wi-Fi/Bluetooth entry. Until then the peer id is `aware:<paired id>`.
- Not on macOS (no API), and Android can't join iPhones here. Android's public API (14+) can pair,
  but it can only secure a data path with a passphrase or PMK, not with pairing keys, and it only
  shares the port on secured links. Interop with iOS would need on-device testing first.
- Android ↔ Android uses Wi-Fi Aware differently: as a bandwidth upgrade with a passphrase sent
  over Bluetooth, with no pairing (see below).

### Bluetooth LE (any two devices in radio range)

- Service UUID: `0B5E1C9A-3F2D-4E8B-9A71-6C4D2E8F1A30`
- Info characteristic (read): `0B5E1C9A-3F2D-4E8B-9A71-6C4D2E8F1A31`
  - Value: UTF-8 JSON `{"id","name","platform","v":1,"psm":<int>}`
  - `psm` is the dynamic L2CAP PSM the device listens on (0 if none).

A scanner sees the service UUID in an advertisement, connects over GATT, reads
the info characteristic, and disconnects. To send, it opens an insecure
(unencrypted at the link layer) L2CAP channel to `psm`. The protocol encrypts
everything itself.

## Secure channel

1. Each side immediately writes 69 bytes: ASCII `CSH1` followed by its
   ephemeral P-256 public key in uncompressed X9.63 form (65 bytes).
2. `shared = ECDH(own private, peer public)` (32-byte x coordinate).
3. The **initiator** is the side that opened the connection.
   `salt = SHA256(initiatorPub || responderPub)`.
4. `HKDF-SHA256(shared, salt, info, 32)` gives:
   - `info = "crossshare/v1/i2r"`: key for initiator → responder
   - `info = "crossshare/v1/r2i"`: key for responder → initiator
5. Frames: `u32 big-endian length N` + `N` bytes of AES-256-GCM output
   (ciphertext followed by the 16-byte tag). The nonce is 4 zero bytes plus
   a u64 big-endian counter that starts at 0 per direction. There is no AAD.
6. Plaintext: `u8 type` + body. Type `1` is a JSON message (UTF-8). Type `2`
   is file data. Plaintext is at most 1 MiB.

## Messages (JSON, discriminated by `t`)

| t | fields | sent by |
|---|---|---|
| `hello` | `id`, `name`, `platform`, `v`, `canHost`, `canJoin`, `canAware?` | both, first message |
| `offer` | `transferId`, `files: [{name,size,mime?}]`, `text?` | initiator |
| `accept` / `decline` | | responder |
| `upgradeRequest` | | initiator: asks the responder to host a hotspot |
| `upgradeOffer` | hotspot: `ssid`, `passphrase`, `host`, `port`, `token`; Wi-Fi Aware: `method: "aware"`, `service`, `passphrase`, `port`, `token` | host |
| `upgradeFailed` | `reason?`, `token?` (the offer a joiner gave up on) | either side |
| `upgradeJoin` | `token` | joiner, first message on the new TCP channel |
| `upgradeOk` | | host, on the new TCP channel |
| `done` | | initiator, after the last data frame |
| `complete` | | responder, after the files are saved |
| `cancel` | `reason?` | either side, at any time |

## Flow

```
initiator                               responder
  hello  ───────────────────────────────▶
         ◀─────────────────────────────── hello
  offer  ───────────────────────────────▶   (user is prompted)
         ◀──────────────────────── accept | decline
  [optional bandwidth upgrade, BLE only]
  data … ───────────────────────────────▶   (files in order, sizes from offer)
  done   ───────────────────────────────▶
         ◀─────────────────────────────── complete
```

Data frames carry the files back to back in offer order. The receiver moves to
the next file once it has received `size` bytes; zero-byte files get no data
frames.

## Bandwidth upgrade (BLE route only)

After `accept`, if the transfer goes over L2CAP and is larger than 2 MB, the
initiator decides:

- If both sides sent `canAware: true` (Android 10+ with Wi-Fi Aware hardware),
  the initiator first hosts a Wi-Fi Aware link. If that fails, it continues
  with the rules below.
- If the initiator `canHost` and the peer `canJoin`, the initiator hosts.
- Else if the peer `canHost` and the initiator `canJoin`, the initiator sends
  `upgradeRequest`.
- Otherwise the transfer stays on BLE.

The host starts a local-only Wi-Fi hotspot, listens on TCP, and sends
`upgradeOffer` over BLE. The joiner joins the network, opens TCP to
`host:port`, runs a fresh secure-channel handshake as initiator, and sends
`upgradeJoin{token}`. The host replies `upgradeOk`, and both sides continue on
TCP and close the L2CAP channel. If anything fails, `upgradeFailed` goes over
BLE and the transfer continues on BLE. The host gives up after 90 s (60 s for
Wi-Fi Aware). Late `upgrade*` messages are ignored. A host ignores an
`upgradeFailed` whose `token` names a different offer.

For Wi-Fi Aware, the host publishes a one-off service name
(`crossshare-<8 hex>`) and offers it with a random passphrase. The joiner
subscribes to it and sends the discovery message `crossshare-join`, so the host
learns its peer handle. Both sides then request a data path secured with the
passphrase. The host sets its TCP port on the data path, and the joiner reads it
with the host's link-local IPv6 address from `WifiAwareNetworkInfo`. The rest
matches the hotspot flow, from `upgradeJoin` on.

Only Android can host (`LocalOnlyHotspot`). iOS joins with
`NEHotspotConfiguration`, macOS with CoreWLAN, Android 10+ with
`WifiNetworkSpecifier`.
