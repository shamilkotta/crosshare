export type Platform = 'ios' | 'android' | 'macos';

/**
 * How a peer can be reached. "wifi" covers same-network and Apple peer-to-peer (AWDL);
 * "aware" is Wi-Fi Aware between paired devices (iOS 26+).
 */
export type Route = 'wifi' | 'aware' | 'bluetooth';

export type DeviceInfo = {
  id: string;
  name: string;
  platform: Platform;
};

export type Peer = {
  id: string;
  name: string;
  platform: Platform;
  /** Best route first. */
  routes: Route[];
};

export type TransferStatus =
  | 'connecting'
  | 'waiting'
  | 'upgrading'
  | 'transferring'
  | 'completed'
  | 'declined'
  | 'failed'
  | 'cancelled';

export type TransferFile = {
  name: string;
  size: number;
  transferred: number;
  /** Where the file was saved (incoming transfers, once completed). */
  uri?: string;
};

export type Transfer = {
  id: string;
  direction: 'outgoing' | 'incoming';
  peerId: string;
  peerName: string;
  peerPlatform: Platform;
  status: TransferStatus;
  files: TransferFile[];
  text?: string;
  /** "hotspot" means a Bluetooth transfer upgraded to a temporary Wi-Fi network. */
  transport: 'wifi' | 'aware' | 'bluetooth' | 'hotspot';
  error?: string;
  totalBytes: number;
  transferredBytes: number;
};

export type BluetoothState = 'on' | 'off' | 'unauthorized' | 'unsupported' | 'unknown';

export type OutgoingFile = {
  /** file:// or content:// URI */
  uri: string;
  name?: string;
  mimeType?: string;
  size?: number;
};

/** What another app shared to Crossshare (share sheet / "open with"). */
export type SharedItems = {
  files: (OutgoingFile & { name: string })[];
  text?: string;
};

export type CrossshareEvents = {
  onPeersChanged: (event: { peers: Peer[] }) => void;
  /** An incoming transfer needs respond(). */
  onTransferRequest: (transfer: Transfer) => void;
  onTransferUpdate: (transfer: Transfer) => void;
  onBluetoothState: (event: { state: BluetoothState }) => void;
  /** Android: a share arrived while the app was running. Call getSharedItems(). */
  onShareReceived: () => void;
};

export const isFinalStatus = (s: TransferStatus) =>
  s === 'completed' || s === 'declined' || s === 'failed' || s === 'cancelled';
