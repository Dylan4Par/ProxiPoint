import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import {
  flushTelemetryBatch,
  parseTelemetryQueue,
  planBackgroundBatch,
  resolveBackgroundBroadcast,
} from '../lib/backgroundTelemetry';
import { DEVICE_PROFILE_STORAGE } from '../lib/deviceProfile';
import { shouldPublishTelemetry } from '../lib/trackingPolicy';
import { postTelemetryPing } from '../services/telemetryApi';
import { getTrackingConfig, hasTrackingConfig } from '../services/trackingConfig';
import { DISCOVERY_RADIUS_METERS, type LocationPingPayload } from '../types/telemetry';

export const BACKGROUND_LOCATION_TASK = 'PROXIPOINT_BACKGROUND_LOCATION_TASK';
export const BACKGROUND_TRACKING_TASK = BACKGROUND_LOCATION_TASK;
const TELEMETRY_QUEUE_KEY = '@proxipoint_telemetry_queue';

const backgroundLocationOptions: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 2000,
  distanceInterval: 1,
  showsBackgroundLocationIndicator: true, // Required for iOS status bar pill
  foregroundService: {
    notificationTitle: 'ProxiPoint Active',
    notificationBody: 'Broadcasting telemetry and monitoring proximity alerts.',
    notificationColor: '#2563eb',
  },
};

export function buildBackgroundPing(latest: Location.LocationObject, userId: string): LocationPingPayload {
  return {
    userId,
    latitude: latest.coords.latitude,
    longitude: latest.coords.longitude,
    accuracy: latest.coords.accuracy,
    speed: latest.coords.speed,
    heading: latest.coords.heading,
    radiusMeters: DISCOVERY_RADIUS_METERS,
    timestamp: new Date(latest.timestamp).toISOString(),
  };
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background task error:', error);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations?.length) return;

  try {
    const [storedCallsign, storedTracking, queuedRaw] = await Promise.all([
      AsyncStorage.getItem(DEVICE_PROFILE_STORAGE.callsign),
      AsyncStorage.getItem(DEVICE_PROFILE_STORAGE.trackingEnabled),
      AsyncStorage.getItem(TELEMETRY_QUEUE_KEY),
    ]);
    const live = hasTrackingConfig() ? getTrackingConfig() : null;
    const identity = resolveBackgroundBroadcast(
      live ? { userId: live.userId, telemetryEnabled: live.telemetryEnabled } : null,
      { callsign: storedCallsign, trackingEnabled: storedTracking },
    );
    if (!shouldPublishTelemetry(identity.userId, identity.telemetryEnabled)) return;

    const incoming = locations
      .filter((location) => Number.isFinite(location.coords.latitude) && Number.isFinite(location.coords.longitude))
      .map((location) => buildBackgroundPing(location, identity.userId));
    const batch = planBackgroundBatch(parseTelemetryQueue(queuedRaw), incoming, true);
    const remaining = await flushTelemetryBatch(batch, async (payload) => {
      await postTelemetryPing(payload);
    });
    await AsyncStorage.setItem(TELEMETRY_QUEUE_KEY, JSON.stringify(remaining));
  } catch (err) {
    console.warn('Background telemetry fallback failed:', err);
  }
});

export async function registerBackgroundLocationAsync() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isRegistered) return true;

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') {
    console.warn('Background location permission denied');
    return false;
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, backgroundLocationOptions);
  return true;
}

export async function checkBackgroundTaskStatus(): Promise<boolean> {
  return await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
}

export async function syncBackgroundLocationTracking(enabled: boolean) {
  if (Platform.OS === 'web') return;

  try {
    if (!enabled) {
      const registered = await checkBackgroundTaskStatus();
      if (registered) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      return;
    }
    await registerBackgroundLocationAsync();
  } catch (err) {
    console.warn('Background location sync failed:', err);
  }
}
