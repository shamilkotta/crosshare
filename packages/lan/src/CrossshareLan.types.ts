/**
 * Represents a discovered peer on the local network
 */
export type LanPeer = {
  /** Unique stable identifier for the device */
  id: string;
  /** Human-readable device name */
  name: string;
  /** IP address of the device */
  host: string;
  /** Port the service is running on */
  port: number;
  /** Platform of the device */
  platform: 'ios' | 'android' | 'macos';
  /** Optional metadata from TXT records */
  meta?: Record<string, string>;
};

/**
 * Events emitted by the LAN discovery module
 */
export type LanEvents = {
  /** Fired when a new peer is discovered */
  onPeerFound: (peer: LanPeer) => void;
  /** Fired when a previously discovered peer is lost */
  onPeerLost: (peerId: string) => void;
  /** Fired when an error occurs */
  onError: (error: LanError) => void;
};

/**
 * Error object emitted by the module
 */
export type LanError = {
  /** Error code for programmatic handling */
  code: LanErrorCode;
  /** Human-readable error message */
  message: string;
};

/**
 * Possible error codes
 */
export type LanErrorCode =
  | 'PERMISSION_DENIED'
  | 'WIFI_NOT_CONNECTED'
  | 'RESOLUTION_FAILED'
  | 'MULTICAST_BLOCKED'
  | 'ADVERTISING_FAILED'
  | 'DISCOVERY_FAILED'
  | 'UNKNOWN';

/**
 * Options for starting service advertising
 */
export type StartAdvertisingOptions = {
  /** Name to advertise (will be combined with device ID) */
  serviceName: string;
  /** Port the service is running on */
  port: number;
  /** Optional metadata to include in TXT records */
  meta?: Record<string, string>;
};
