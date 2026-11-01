import { useEffect } from 'react';
import { AppState } from 'react-native';
import { remoteEventToNode } from '../lib/remoteEvents';
import { EVENTS_URL, fetchEvents } from '../services/eventsApi';
import { useDiscoveryStore } from '../stores/useDiscoveryStore';

/** Reload this often while the app is open (the scraper refreshes the backend every ~4 h). */
const REFRESH_MS = 10 * 60 * 1000;
/** Wait for the map to settle before loading for a new place. */
const SETTLE_MS = 800;

/**
 * Loads upcoming events from the backend around the place you're exploring, and keeps them
 * fresh: on start, when you look somewhere else (~1 km or more), every 10 minutes, and when the
 * app comes back to the foreground. Does nothing unless EXPO_PUBLIC_EVENTS_URL is set.
 */
export function useRemoteEvents() {
  const tenantId = useDiscoveryStore((s) => s.tenantId);
  // Rounded to ~1 km so panning a little doesn't reload.
  const lat = useDiscoveryStore((s) => Math.round(s.viewPlace.latitude * 100) / 100);
  const lon = useDiscoveryStore((s) => Math.round(s.viewPlace.longitude * 100) / 100);

  useEffect(() => {
    if (!EVENTS_URL) return;
    const { setRemoteEvents, setRemoteEventsStatus } = useDiscoveryStore.getState();
    let controller: AbortController | null = null;

    const load = async () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      setRemoteEventsStatus('loading');
      try {
        const now = new Date();
        const events = await fetchEvents({ tenantId, near: { latitude: lat, longitude: lon }, now, signal: current.signal });
        if (current.signal.aborted) return;
        setRemoteEvents(events.map((e) => remoteEventToNode(e, now)), now.toISOString());
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
        // Keep showing what was loaded last time.
        setRemoteEventsStatus('error', error instanceof Error ? error.message : String(error));
      }
    };

    const settle = setTimeout(load, SETTLE_MS);
    const timer = setInterval(load, REFRESH_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      clearTimeout(settle);
      clearInterval(timer);
      sub.remove();
      controller?.abort();
    };
  }, [tenantId, lat, lon]);
}
