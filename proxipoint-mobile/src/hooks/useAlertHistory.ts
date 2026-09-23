import { useEffect, useState } from 'react';
import type { AlertHistoryEntry } from '../lib/alertHistory';
import {
  clearAlertHistory,
  getAlertHistory,
  hydrateAlertHistory,
  isAlertHistoryLoaded,
  subscribeAlertHistory,
} from '../services/alertHistory';

export function useAlertHistory() {
  const [entries, setEntries] = useState<AlertHistoryEntry[]>(getAlertHistory);
  const [loading, setLoading] = useState(!isAlertHistoryLoaded());

  useEffect(() => {
    return subscribeAlertHistory((next) => {
      setEntries(next);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    void hydrateAlertHistory();
  }, []);

  return { entries, loading, clearAlertHistory };
}
