import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_ALERT_PREFS, readAlertPrefs, type AlertPrefs } from '../lib/alertPrefs';

const KEY = 'pp.alertPrefs.v1';

/** Notifications & Proximity Alerts settings, kept on the phone (server: PUT /me/alert-prefs). */
export function useAlertPrefs(): [AlertPrefs, (patch: Partial<AlertPrefs>) => void] {
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_ALERT_PREFS);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setPrefs(readAlertPrefs(JSON.parse(raw)));
      })
      .catch(() => undefined);
  }, []);
  const update = useCallback((patch: Partial<AlertPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);
  return [prefs, update];
}
