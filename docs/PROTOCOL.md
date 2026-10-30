# Crosshare protocol v1

Every Crosshare implementation (Swift for iOS/macOS, Kotlin for Android) speaks
this protocol. It runs over any reliable byte stream, which today means TCP
(LAN, Apple AWDL, Android hotspot) or a Bluetooth LE L2CAP channel.

## Discovery

### Bonjour / mDNS (same network, and Apple↔Apple peer-to-peer over AWDL)

- Service type: `_crosshare._tcp`
- Service name: the device id
- TXT record: `id`, `name`, `platform` (`ios` | `android` | `macos`), `v` (`1`)

Apple devices browse and listen with `includePeerToPeer = true`, so two Apple
devices find each other with no shared network.

### Wi-Fi Aware (iOS 26+, paired devices)

- Service: `_crosshare._tcp`, declared as both `Publishable` and `Subscribable` under
  `WiFiAwareServices` in Info.plist. Needs the `com.apple.developer.wifi-aware` entitlement
  (`Publish`, `Subscribe`).
- Devices pair once through system UI: one shows a code (`DevicePairingView`), the other picks it
  and enters the code (`DevicePicker`). After that, a visible device publishes to all paired
  devices and a discovering device subscribes to them. Connections are plain TCP carrying this
  protocol.
- A browse result only identifies the paired device, not the Crosshare id. The first hello on a
  Wi-Fi Aware connection maps paired-device id → Crosshare id, which is then remembered so the
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
   - `info = "crosshare/v1/i2r"`: key for initiator → responder
   - `info = "crosshare/v1/r2i"`: key for responder → initiator
5. Frames: `u32 big-endian length N` + `N` bytes of AES-256-GCM output
   (ciphertext followed by the 16-byte tag). The nonce is 4 zero bytes plus
   a u64 big-endian counter that starts at 0 per direction. There is no AAD.
6. Plaintext: `u8 type` + body. Type `1` is a JSON message (UTF-8). Type `2`
   is file data. Plaintext is at most 1 MiB.

## Messages (JSON, discriminated by `t`)

| t                    | fields                                                                                                                           | sent by                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `hello`              | `id`, `name`, `platform`, `v`, `canHost`, `canJoin`, `canAware?`, `key?`, `sig?`, `linked?` (see Linked devices)                 | both, first message                             |
| `offer`              | `transferId`, `files: [{name,size,mime?}]`, `text?`, `kind?` (`"link"` or `"unlink"`), `commit?`                                 | initiator                                       |
| `accept` / `decline` |                                                                                                                                  | responder                                       |
| `upgradeRequest`     |                                                                                                                                  | initiator: asks the responder to host a hotspot |
| `upgradeOffer`       | hotspot: `ssid`, `passphrase`, `host`, `port`, `token`; Wi-Fi Aware: `method: "aware"`, `service`, `passphrase`, `port`, `token` | host                                            |
| `upgradeFailed`      | `reason?`, `token?` (the offer a joiner gave up on)                                                                              | either side                                     |
| `upgradeJoin`        | `token`                                                                                                                          | joiner, first message on the new TCP channel    |
| `upgradeOk`          |                                                                                                                                  | host, on the new TCP channel                    |
| `linkNonce`          | `nonce`                                                                                                                          | responder, link offers only                     |
| `linkReveal`         | `nonce`                                                                                                                          | initiator, link offers only                     |
| `done`               |                                                                                                                                  | initiator, after the last data frame            |
| `complete`           |                                                                                                                                  | responder, after the files are saved            |
| `cancel`             | `reason?`                                                                                                                        | either side, at any time                        |

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

## Linked devices

Each device has a long-term P-256 identity key, created on first launch and kept in app storage.

- `hello.key`: the identity public key, uncompressed X9.63, hex.
- `hello.sig`: ECDSA-SHA256 over `"crosshare/v1/auth" || salt || role`, DER, hex. `salt` is the
  secure-channel salt above, so a signature only fits this one handshake. `role` is `"i"` from the
  initiator and `"r"` from the responder, so a signature can't be reflected back.
- `hello.linked`: whether the sender has the receiver linked. The initiator sends it for the device
  it meant to reach, and the responder for the initiator's `id`.

A hello whose signature doesn't verify is treated as anonymous: everything still works, but it is
never trusted and can't link.

**Linking.** Both users compare a six-digit code, so a device in the middle is caught:

1. Initiator → `offer` with `kind: "link"`, no files or text, and `commit` = SHA256(`nI`), where `nI`
   is 32 random bytes.
2. Responder → `linkNonce` with `nonce` = `nR`, 32 random bytes.
3. Initiator → `linkReveal` with `nonce` = `nI`. The responder checks it against `commit`.
4. Both compute `code` = first 4 bytes of SHA256(`"crosshare/v1/code" || salt || initiatorKey ||
   responderKey || nI || nR`) as a big-endian u32, mod 1,000,000, as six digits.
5. Both users check the codes match. The responder answers `accept` / `decline`. The initiator
   waits for its own user too, and sends `cancel` if they back out.
6. The initiator saves the link once both sides said yes, then sends `done`. The responder saves
   it on `done` and replies `complete`.

The initiator commits to `nI` before seeing `nR`, and the responder picks `nR` before seeing `nI`.
So a device in the middle, running two handshakes, can't choose values that make both codes match:
it gets one guess in a million.

**Trusted text.** An offer with no files and some `text`, from a linked `id` whose verified `key`
matches the saved one, is accepted without asking. Files always ask.

**Unlinking.** Either side removes its link locally. If the peer is nearby, it also sends an `offer`
with `kind: "unlink"`, which the receiver declines without telling its user. Whatever the route, a
verified hello with `linked: false` from a linked device makes the receiver drop its side, so a
link removed while the other device was away is dropped the next time they connect. Since that
hello must be signed with the saved key, nobody else can unlink you.

Received text (trusted or accepted) is copied to the receiver's clipboard.

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
(`crosshare-<8 hex>`) and offers it with a random passphrase. The joiner
subscribes to it and sends the discovery message `crosshare-join`, so the host
learns its peer handle. Both sides then request a data path secured with the
passphrase. The host sets its TCP port on the data path, and the joiner reads it
with the host's link-local IPv6 address from `WifiAwareNetworkInfo`. The rest
matches the hotspot flow, from `upgradeJoin` on.

Only Android can host (`LocalOnlyHotspot`). iOS joins with
`NEHotspotConfiguration`, macOS with CoreWLAN, Android 10+ with
`WifiNetworkSpecifier`.
