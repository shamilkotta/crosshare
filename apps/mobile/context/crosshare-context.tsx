import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, PermissionsAndroid, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import Crosshare, {
  BluetoothState,
  DeviceInfo,
  LinkedDevice,
  OutgoingFile,
  Peer,
  Transfer,
  isFinalStatus,
} from '@crosshare/core';

/** What the user picked to send. */
export type Selection = {
  files: (OutgoingFile & { name: string; size?: number })[];
  text?: string;
};

export type HistoryEntry = {
  id: string;
  direction: Transfer['direction'];
  peerName: string;
  status: Transfer['status'];
  files: { name: string; size: number; uri?: string }[];
  text?: string;
  date: number;
};

/** A nearby peer, or a linked device that isn't nearby right now. */
export type Device = {
  id: string;
  name: string;
  platform: Peer['platform'];
  linked: boolean;
  /** Set when the device is nearby and can be sent to. */
  peer?: Peer;
};

type Settings = { visible: boolean; history: HistoryEntry[] };

interface CrosshareContextType {
  device: DeviceInfo;
  peers: Peer[];
  /** Linked devices first (nearby before away), then other nearby devices. */
  devices: Device[];
  bluetooth: BluetoothState;
  visible: boolean;
  setVisible: (on: boolean) => void;
  setDiscovering: (on: boolean) => void;
  rename: (name: string) => void;
  /** Transfers seen this session, newest first. */
  transfers: Transfer[];
  /** Transfers waiting for a decision (incoming, or a link code to confirm), oldest first. */
  requests: Transfer[];
  selection: Selection | null;
  setSelection: (s: Selection | null) => void;
  send: (peerId: string, selection: Selection) => Promise<void>;
  respond: (transferId: string, accept: boolean) => void;
  cancel: (transferId: string) => void;
  dismiss: (transferId: string) => void;
  history: HistoryEntry[];
  clearHistory: () => void;
  /** Devices whose text is sent and copied without asking. */
  links: LinkedDevice[];
  link: (peerId: string) => Promise<void>;
  unlink: (id: string) => void;
}

const CrosshareContext = createContext<CrosshareContextType | undefined>(
  undefined
);

const settingsFile = new File(Paths.document, 'crosshare.json');

function loadSettings(): Settings {
  try {
    if (settingsFile.exists) {
      const parsed = JSON.parse(settingsFile.textSync());
      return { visible: parsed.visible ?? true, history: parsed.history ?? [] };
    }
  } catch {
    // Corrupt or unreadable settings: start fresh.
  }
  return { visible: true, history: [] };
}

function saveSettings(s: Settings) {
  try {
    if (!settingsFile.exists) settingsFile.create();
    settingsFile.write(JSON.stringify(s));
  } catch (e) {
    console.warn('Could not save settings', e);
  }
}

async function ensurePermissions() {
  if (Platform.OS !== 'android') return;
  const needed = Crosshare.requiredPermissions() as any[];
  // Requests and progress show as notifications while the app is in the background.
  if (Platform.Version >= 33) {
    needed.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
  if (needed.length === 0) return;
  await PermissionsAndroid.requestMultiple(needed);
  Crosshare.refresh();
}

export function CrosshareProvider({ children }: { children: React.ReactNode }) {
  const initial = useMemo(loadSettings, []);
  const [device, setDevice] = useState<DeviceInfo>(() =>
    Crosshare.getDeviceInfo()
  );
  const [peers, setPeers] = useState<Peer[]>([]);
  const [bluetooth, setBluetooth] = useState<BluetoothState>(() =>
    Crosshare.getBluetoothState()
  );
  // On Android the native side owns visibility, so the Quick Settings tile and the app agree.
  const [visible, setVisibleState] = useState(
    () => Crosshare.isVisible?.() ?? initial.visible
  );
  const [transfers, setTransfers] = useState<Transfer[]>(
    () => Crosshare.getActiveTransfers?.() ?? []
  );
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(initial.history);
  const [links, setLinks] = useState<LinkedDevice[]>(() =>
    Crosshare.getLinkedDevices()
  );
  const discoveringCount = useRef(0);

  // Persist settings whenever they change.
  useEffect(() => {
    saveSettings({ visible, history });
  }, [visible, history]);

  const upsert = useCallback((t: Transfer) => {
    // Unlink notices are internal.
    if (t.kind === 'unlink') return;
    setTransfers((prev) => {
      const i = prev.findIndex((p) => p.id === t.id);
      if (i === -1) return [t, ...prev];
      const next = prev.slice();
      next[i] = t;
      return next;
    });
    if (isFinalStatus(t.status) && t.kind === 'transfer') {
      setHistory((prev) => {
        if (prev.some((h) => h.id === t.id)) return prev;
        if (
          t.status === 'cancelled' &&
          t.transferredBytes === 0 &&
          t.direction === 'incoming'
        ) {
          return prev;
        }
        const entry: HistoryEntry = {
          id: t.id,
          direction: t.direction,
          peerName: t.peerName,
          status: t.status,
          files: t.files.map((f) => ({
            name: f.name,
            size: f.size,
            uri: f.uri,
          })),
          text: t.text,
          date: Date.now(),
        };
        return [entry, ...prev].slice(0, 200);
      });
    }
  }, []);

  useEffect(() => {
    const subs = [
      Crosshare.addListener('onPeersChanged', (e) => setPeers(e.peers)),
      Crosshare.addListener('onTransferRequest', upsert),
      Crosshare.addListener('onTransferUpdate', upsert),
      Crosshare.addListener('onBluetoothState', (e) => setBluetooth(e.state)),
      Crosshare.addListener('onVisibilityChanged', (e) =>
        setVisibleState(e.visible)
      ),
      Crosshare.addListener('onLinksChanged', (e) => setLinks(e.links)),
    ];
    ensurePermissions().then(() => {
      Crosshare.setVisible(Crosshare.isVisible?.() ?? initial.visible);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      Crosshare.refresh();
      // Answered or started from a notification while the app was in the background.
      Crosshare.getActiveTransfers?.().forEach(upsert);
    });
    return () => {
      subs.forEach((s) => s.remove());
      appState.remove();
    };
  }, [initial.visible, upsert]);

  const setVisible = useCallback((on: boolean) => {
    setVisibleState(on);
    Crosshare.setVisible(on);
  }, []);

  // Screens that show nearby devices call setDiscovering(true/false) on mount/unmount.
  const setDiscovering = useCallback((on: boolean) => {
    discoveringCount.current = Math.max(
      0,
      discoveringCount.current + (on ? 1 : -1)
    );
    const active = discoveringCount.current > 0;
    if (active) ensurePermissions();
    Crosshare.setDiscovering(active);
    if (active) setPeers(Crosshare.getPeers());
  }, []);

  const rename = useCallback((name: string) => {
    Crosshare.setDeviceName(name);
    setDevice(Crosshare.getDeviceInfo());
  }, []);

  const send = useCallback(async (peerId: string, s: Selection) => {
    const files = s.files.map((f) => ({
      uri: f.uri,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
    }));
    await Crosshare.send(peerId, files, s.text ?? null);
  }, []);

  const respond = useCallback(
    (id: string, accept: boolean) => Crosshare.respond(id, accept),
    []
  );
  const cancel = useCallback((id: string) => Crosshare.cancel(id), []);
  const dismiss = useCallback(
    (id: string) => setDismissed((prev) => new Set(prev).add(id)),
    []
  );
  const clearHistory = useCallback(() => setHistory([]), []);
  const link = useCallback(async (peerId: string) => {
    await Crosshare.link(peerId);
  }, []);
  const unlink = useCallback((id: string) => Crosshare.unlink(id), []);

  const devices = useMemo(() => {
    const linkedIds = new Set(links.map((l) => l.id));
    const nearby: Device[] = peers.map((p) => ({
      id: p.id,
      name: p.name,
      platform: p.platform,
      linked: linkedIds.has(p.id),
      peer: p,
    }));
    const away: Device[] = links
      .filter((l) => !peers.some((p) => p.id === l.id))
      .map((l) => ({ ...l, linked: true }));
    return [
      ...nearby.filter((d) => d.linked),
      ...away,
      ...nearby.filter((d) => !d.linked),
    ];
  }, [peers, links]);

  const visibleTransfers = useMemo(
    () => transfers.filter((t) => !dismissed.has(t.id)),
    [transfers, dismissed]
  );
  const requests = useMemo(
    () =>
      visibleTransfers
        .filter(
          (t) =>
            t.status === 'waiting' &&
            (t.direction === 'incoming' || (t.kind === 'link' && !!t.code))
        )
        .reverse(),
    [visibleTransfers]
  );

  return (
    <CrosshareContext.Provider
      value={{
        device,
        peers,
        devices,
        bluetooth,
        visible,
        setVisible,
        setDiscovering,
        rename,
        transfers: visibleTransfers,
        requests,
        selection,
        setSelection,
        send,
        respond,
        cancel,
        dismiss,
        history,
        clearHistory,
        links,
        link,
        unlink,
      }}
    >
      {children}
    </CrosshareContext.Provider>
  );
}

export function useCrosshare() {
  const context = useContext(CrosshareContext);
  if (!context)
    throw new Error('useCrosshare must be used within a CrosshareProvider');
  return context;
}

/** Opens a received file, alerting instead of crashing if it was moved or deleted. */
export const openFile = async (uri: string) => {
  try {
    await Crosshare.openFile(uri);
  } catch (e: any) {
    const missing = e?.code === 'ERR_FILE_NOT_FOUND';
    Alert.alert(
      missing ? 'File not found' : "Couldn't open file",
      missing
        ? 'This file may have been moved or deleted.'
        : (e?.message ?? 'No app available to open this file.')
    );
  }
};

export const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};
