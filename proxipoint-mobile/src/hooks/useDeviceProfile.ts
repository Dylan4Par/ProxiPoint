import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEVICE_PROFILE_STORAGE, generateCallsign } from '../lib/deviceProfile';

type ProfileState = {
  callsign: string;
  isTelemetryEnabled: boolean;
  loading: boolean;
};

const listeners = new Set<(state: ProfileState) => void>();

let state: ProfileState = {
  callsign: 'Ranger-01',
  isTelemetryEnabled: true,
  loading: true,
};

function emit(next: ProfileState) {
  state = next;
  for (const listener of listeners) listener(state);
}

let hydration: Promise<void> | null = null;

function hydrate(): Promise<void> {
  if (!hydration) {
    hydration = (async () => {
      try {
        const storedCallsign = await AsyncStorage.getItem(DEVICE_PROFILE_STORAGE.callsign);
        const storedTracking = await AsyncStorage.getItem(DEVICE_PROFILE_STORAGE.trackingEnabled);
        let callsign = storedCallsign?.trim() ?? '';
        if (!callsign) {
          callsign = generateCallsign();
          await AsyncStorage.setItem(DEVICE_PROFILE_STORAGE.callsign, callsign);
        }
        emit({
          callsign,
          isTelemetryEnabled: storedTracking === null ? true : storedTracking === 'true',
          loading: false,
        });
      } catch (err) {
        console.warn('Device profile load failed:', err);
        emit({
          callsign: generateCallsign(),
          isTelemetryEnabled: true,
          loading: false,
        });
      }
    })();
  }
  return hydration;
}

export function useDeviceProfile() {
  const [snapshot, setSnapshot] = useState(state);

  useEffect(() => {
    listeners.add(setSnapshot);
    setSnapshot(state);
    void hydrate();
    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);

  const setCallsign = useCallback(async (newCallsign: string) => {
    const trimmed = newCallsign.trim();
    if (!trimmed) return;
    emit({ ...state, callsign: trimmed });
    await AsyncStorage.setItem(DEVICE_PROFILE_STORAGE.callsign, trimmed);
  }, []);

  const setIsTelemetryEnabled = useCallback(async (enabled: boolean) => {
    emit({ ...state, isTelemetryEnabled: enabled });
    await AsyncStorage.setItem(DEVICE_PROFILE_STORAGE.trackingEnabled, String(enabled));
  }, []);

  return {
    callsign: snapshot.callsign,
    isTelemetryEnabled: snapshot.isTelemetryEnabled,
    loading: snapshot.loading,
    setCallsign,
    setIsTelemetryEnabled,
  };
}
