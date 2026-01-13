import { LanPeer, StartAdvertisingOptions } from './CrossshareLan.types';

/**
 * Web stub for CrossshareLan module
 * LAN discovery is not supported on web platforms
 */
export default {
  async startAdvertising(_options: StartAdvertisingOptions): Promise<void> {
    console.warn('@crossshare/lan: LAN discovery is not supported on web');
  },

  async stopAdvertising(): Promise<void> {
    // No-op on web
  },

  async startDiscovery(): Promise<void> {
    console.warn('@crossshare/lan: LAN discovery is not supported on web');
  },

  async stopDiscovery(): Promise<void> {
    // No-op on web
  },

  async getDiscoveredPeers(): Promise<LanPeer[]> {
    return [];
  },

  addListener(_eventName: string, _listener: (...args: any[]) => void) {
    return { remove: () => {} };
  },

  removeListener(_eventName: string, _listener: (...args: any[]) => void) {
    // No-op on web
  },

  removeAllListeners(_eventName: string) {
    // No-op on web
  },
};
