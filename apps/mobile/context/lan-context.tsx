import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import CrossshareLan, { LanPeer, LanError, StartAdvertisingOptions } from '@crossshare/lan';

interface LanContextType {
  peers: LanPeer[];
  isDiscoveryActive: boolean;
  isAdvertisingActive: boolean;
  error: LanError | null;
  startDiscovery: () => Promise<void>;
  stopDiscovery: () => Promise<void>;
  startAdvertising: () => Promise<void>;
  stopAdvertising: () => Promise<void>;
}

const LanContext = createContext<LanContextType | undefined>(undefined);

export function LanProvider({ children }: { children: React.ReactNode }) {
  const [peers, setPeers] = useState<LanPeer[]>([]);
  const [isDiscoveryActive, setIsDiscoveryActive] = useState(false);
  const [isAdvertisingActive, setIsAdvertisingActive] = useState(false);
  const [error, setError] = useState<LanError | null>(null);

  useEffect(() => {
    // We use the event emitter from the native module
    const peerFoundSub = CrossshareLan.addListener(
      'onPeerFound',
      (peer: LanPeer) => {
        setPeers((prev) => {
          if (prev.find((p) => p.id === peer.id)) return prev;
          return [...prev, peer];
        });
      }
    );

    const peerLostSub = CrossshareLan.addListener(
      'onPeerLost',
      (event: { peerId: string }) => {
        setPeers((prev) => prev.filter((p) => p.id !== event.peerId));
      }
    );

    const errorSub = CrossshareLan.addListener('onError', (err: LanError) => {
      setError(err);
    });

    return () => {
      peerFoundSub.remove();
      peerLostSub.remove();
      errorSub.remove();
      // Ensure we stop everything on unmount
      CrossshareLan.stopDiscovery();
      CrossshareLan.stopAdvertising();
    };
  }, []);

  const startDiscovery = useCallback(async () => {
    try {
      await CrossshareLan.startDiscovery();
      setIsDiscoveryActive(true);
      setError(null);
    } catch (err: any) {
      setError({ code: 'DISCOVERY_FAILED', message: err.message });
    }
  }, []);

  const stopDiscovery = useCallback(async () => {
    try {
      await CrossshareLan.stopDiscovery();
      setIsDiscoveryActive(false);
    } catch (err: any) {
      console.error('Stop discovery failed', err);
    }
  }, []);

  const startAdvertising = useCallback(
    async () => {
      try {
        // Default port, this should ideally come from a server/service
        const port = 8080;
        await CrossshareLan.startAdvertising({ port } as StartAdvertisingOptions);
        setIsAdvertisingActive(true);
        setError(null);
      } catch (err: any) {
        setError({ code: 'ADVERTISING_FAILED', message: err.message });
      }
    },
    []
  );

  const stopAdvertising = useCallback(async () => {
    try {
      await CrossshareLan.stopAdvertising();
      setIsAdvertisingActive(false);
    } catch (err: any) {
      console.error('Stop advertising failed', err);
    }
  }, []);

  return (
    <LanContext.Provider
      value={{
        peers,
        isDiscoveryActive,
        isAdvertisingActive,
        error,
        startDiscovery,
        stopDiscovery,
        startAdvertising,
        stopAdvertising,
      }}
    >
      {children}
    </LanContext.Provider>
  );
}

export function useLan() {
  const context = useContext(LanContext);
  if (context === undefined) {
    throw new Error('useLan must be used within a LanProvider');
  }
  return context;
}
