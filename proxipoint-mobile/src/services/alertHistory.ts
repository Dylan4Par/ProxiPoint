import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ALERT_HISTORY_LIMIT,
  ALERT_HISTORY_STORAGE_KEY,
  isAlertHistoryEntry,
  prependAlertHistory,
  type AlertHistoryEntry,
} from '../lib/alertHistory';

type Listener = (entries: AlertHistoryEntry[]) => void;

const listeners = new Set<Listener>();
let entries: AlertHistoryEntry[] = [];
let loaded = false;
let hydration: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) listener(entries);
}

export function getAlertHistory(): AlertHistoryEntry[] {
  return entries;
}

export function isAlertHistoryLoaded(): boolean {
  return loaded;
}

export function subscribeAlertHistory(listener: Listener): () => void {
  listeners.add(listener);
  listener(entries);
  return () => {
    listeners.delete(listener);
  };
}

export function hydrateAlertHistory(): Promise<void> {
  if (!hydration) {
    hydration = (async () => {
      try {
        const raw = await AsyncStorage.getItem(ALERT_HISTORY_STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) entries = parsed.filter(isAlertHistoryEntry);
        }
      } catch (err) {
        console.warn('Alert history load failed:', err);
        entries = [];
      } finally {
        loaded = true;
        emit();
      }
    })();
  }
  return hydration;
}

export async function recordAlertHistory(entry: AlertHistoryEntry) {
  await hydrateAlertHistory();
  entries = prependAlertHistory(entries, entry, ALERT_HISTORY_LIMIT);
  await AsyncStorage.setItem(ALERT_HISTORY_STORAGE_KEY, JSON.stringify(entries));
  emit();
}

export async function clearAlertHistory() {
  await hydrateAlertHistory();
  entries = [];
  await AsyncStorage.removeItem(ALERT_HISTORY_STORAGE_KEY);
  emit();
}
