import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import Crosshare, {
  BluetoothState,
  DeviceInfo,
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

type Settings = { visible: boolean; history: HistoryEntry[] };

interface CrosshareContextType {
  device: DeviceInfo;
  peers: Peer[];
  bluetooth: BluetoothState;
  visible: boolean;
  setVisible: (on: boolean) => void;
  setDiscovering: (on: boolean) => void;
  rename: (name: string) => void;
  /** Transfers seen this session, newest first. */
  transfers: Transfer[];
  /** Incoming transfers waiting for accept/decline, oldest first. */
  requests: Transfer[];
  selection: Selection | null;
  setSelection: (s: Selection | null) => void;
  send: (peerId: string, selection: Selection) => Promise<void>;
  respond: (transferId: string, accept: boolean) => void;
  cancel: (transferId: string) => void;
  dismiss: (transferId: string) => void;
  history: HistoryEntry[];
  clearHistory: () => void;
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
  if (needed.length === 0) return;
  await PermissionsAndroid.requestMultiple(needed);
  Crosshare.refresh();
}

export function CrosshareProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const initial = useMemo(loadSettings, []);
  const [device, setDevice] = useState<DeviceInfo>(() =>
    Crosshare.getDeviceInfo()
  );
  const [peers, setPeers] = useState<Peer[]>([]);
  const [bluetooth, setBluetooth] = useState<BluetoothState>(() =>
    Crosshare.getBluetoothState()
  );
  const [visible, setVisibleState] = useState(initial.visible);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(initial.history);
  const discoveringCount = useRef(0);

  // Persist settings whenever they change.
  useEffect(() => {
    saveSettings({ visible, history });
  }, [visible, history]);

  const upsert = useCallback((t: Transfer) => {
    setTransfers((prev) => {
      const i = prev.findIndex((p) => p.id === t.id);
      if (i === -1) return [t, ...prev];
      const next = prev.slice();
      next[i] = t;
      return next;
    });
    if (isFinalStatus(t.status)) {
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
    ];
    ensurePermissions().then(() => {
      Crosshare.setVisible(initial.visible);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') Crosshare.refresh();
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

  const visibleTransfers = useMemo(
    () => transfers.filter((t) => !dismissed.has(t.id)),
    [transfers, dismissed]
  );
  const requests = useMemo(
    () =>
      visibleTransfers
        .filter((t) => t.direction === 'incoming' && t.status === 'waiting')
        .reverse(),
    [visibleTransfers]
  );

  return (
    <CrosshareContext.Provider
      value={{
        device,
        peers,
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

export const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};
