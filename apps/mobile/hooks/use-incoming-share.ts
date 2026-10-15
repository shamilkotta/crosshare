import { useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import Crossshare from '@crossshare/core';
import { useCrossshare } from '@/context/crossshare-context';

/**
 * Picks up files or text shared to Crossshare from another app (share sheet, "open with") and
 * opens the device picker with them selected.
 */
export function useIncomingShare() {
  const router = useRouter();
  const { setSelection } = useCrossshare();

  useEffect(() => {
    const check = () => {
      const shared = Crossshare.getSharedItems();
      if (!shared || (shared.files.length === 0 && !shared.text)) return;
      setSelection(shared);
      router.navigate('/searching');
    };
    check();
    // Android reports new shares with an event; iOS opens crossshare://share from its extension.
    const subs = [
      Crossshare.addListener('onShareReceived', check),
      Linking.addEventListener('url', check),
      AppState.addEventListener('change', (state) => {
        if (state === 'active') check();
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [router, setSelection]);
}
