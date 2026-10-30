import { useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import Crosshare from '@crosshare/core';
import { useCrosshare } from '@/context/crosshare-context';

/**
 * Picks up files or text shared to Crosshare from another app (share sheet, "open with") and
 * selects them on the home screen, ready to pick a device.
 */
export function useIncomingShare() {
  const router = useRouter();
  const { setSelection } = useCrosshare();

  useEffect(() => {
    const check = () => {
      const shared = Crosshare.getSharedItems();
      if (!shared || (shared.files.length === 0 && !shared.text)) return;
      setSelection(shared);
      router.navigate('/');
    };
    check();
    // Android reports new shares with an event; iOS opens crosshare://share from its extension.
    const subs = [
      Crosshare.addListener('onShareReceived', check),
      Linking.addEventListener('url', check),
      AppState.addEventListener('change', (state) => {
        if (state === 'active') check();
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [router, setSelection]);
}
