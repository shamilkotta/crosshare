import { NativeModule, requireNativeModule } from 'expo';

import {
  LanPeer,
  LanEvents,
  StartAdvertisingOptions,
} from './CrossshareLan.types';

declare class CrossshareLanModule extends NativeModule<LanEvents> {
  /**
   * Start advertising this device on the local network
   * @param options Advertising configuration
   */
  startAdvertising(options: StartAdvertisingOptions): Promise<void>;

  /**
   * Stop advertising this device
   */
  stopAdvertising(): Promise<void>;

  /**
   * Start discovering other devices on the local network
   * Emits onPeerFound and onPeerLost events as devices are found/lost
   */
  startDiscovery(): Promise<void>;

  /**
   * Stop discovering devices
   */
  stopDiscovery(): Promise<void>;

  /**
   * Get the current list of discovered peers
   * @returns Array of discovered peers
   */
  getDiscoveredPeers(): Promise<LanPeer[]>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<CrossshareLanModule>('CrossshareLan');
