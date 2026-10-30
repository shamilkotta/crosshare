import { NativeModule, requireNativeModule } from 'expo';

import {
  BluetoothState,
  CrosshareEvents,
  DeviceInfo,
  LinkedDevice,
  OutgoingFile,
  Peer,
  SharedItems,
  Transfer,
} from './CrosshareCore.types';

declare class CrosshareCoreModule extends NativeModule<CrosshareEvents> {
  getDeviceInfo(): DeviceInfo;
  setDeviceName(name: string): void;
  /** Android runtime permissions to request before going visible or discovering. */
  requiredPermissions(): string[];
  /** Be discoverable and accept incoming requests. */
  setVisible(on: boolean): void;
  /** Android: saved visibility, shared with the Quick Settings tile. */
  isVisible?(): boolean;
  /** Look for nearby devices; results arrive via onPeersChanged. */
  setDiscovering(on: boolean): void;
  /** Re-checks permissions and Bluetooth (call after granting permissions). */
  refresh(): void;
  getPeers(): Peer[];
  getBluetoothState(): BluetoothState;
  /** Wi-Fi Aware: iOS 26+ on supported hardware, with the entitlement. Always false on Android. */
  isWifiAwareSupported(): boolean;
  /**
   * One-time Wi-Fi Aware pairing through system UI (iOS only).
   * "show" makes this device pairable and displays a code; "find" picks a nearby device and enters its code.
   */
  pairWifiAware(mode: 'show' | 'find'): Promise<void>;
  /** Starts sending; progress arrives via onTransferUpdate. Resolves with the transfer id. */
  send(
    peerId: string,
    files: OutgoingFile[],
    text?: string | null
  ): Promise<string>;
  /** Devices this one is linked with. */
  getLinkedDevices(): LinkedDevice[];
  /**
   * Asks a nearby device to link. Once it accepts, both sides save the link and text between
   * them is accepted without asking. Resolves with the transfer id.
   */
  link(peerId: string): Promise<string>;
  /** Removes a link on both sides (the other side drops it now if nearby, else on next contact). */
  unlink(id: string): void;
  /**
   * Takes what another app shared to Crosshare, if anything (each share is returned once).
   * Call on launch, when the app becomes active, and on onShareReceived.
   */
  getSharedItems(): SharedItems | null;
  /** Android: transfers in progress, including ones that started while the app was closed. */
  getActiveTransfers?(): Transfer[];
  respond(transferId: string, accept: boolean): void;
  cancel(transferId: string): void;
  /** Opens (Android) or shares (iOS) a received file. */
  openFile(uri: string, mimeType?: string | null): Promise<void>;
}

export default requireNativeModule<CrosshareCoreModule>('CrosshareCore');
