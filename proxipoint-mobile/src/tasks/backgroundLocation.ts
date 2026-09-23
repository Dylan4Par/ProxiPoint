import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { shouldPublishTelemetry } from '../lib/trackingPolicy';
import { postTelemetryPing } from '../services/telemetryApi';
import { getTrackingConfig } from '../services/trackingConfig';
import type { LocationPingPayload } from '../types/telemetry';

export const BACKGROUND_TRACKING_TASK = 'PROXIPOINT_BACKGROUND_GEO';

export function buildBackgroundPing(latest: Location.LocationObject): LocationPingPayload {
  const config = getTrackingConfig();
  return {
    userId: config.userId,
    latitude: latest.coords.latitude,
    longitude: latest.coords.longitude,
    accuracy: latest.coords.accuracy,
    speed: latest.coords.speed,
    heading: latest.coords.heading,
    radiusMeters: config.radiusMeters,
    timestamp: new Date(latest.timestamp).toISOString(),
  };
}

TaskManager.defineTask(BACKGROUND_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background task error:', error);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const latest = locations[locations.length - 1];
  if (!latest) return;

  const config = getTrackingConfig();
  if (!shouldPublishTelemetry(config.userId, config.telemetryEnabled)) return;

  try {
    await postTelemetryPing(buildBackgroundPing(latest));
  } catch (err) {
    console.warn('Background telemetry fallback failed:', err);
  }
});

export async function registerBackgroundLocationTracking() {
  if (Platform.OS === 'web') return;

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') return;

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TRACKING_TASK);
  if (!isRegistered) {
    await Location.startLocationUpdatesAsync(BACKGROUND_TRACKING_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 5,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'ProxiPoint Active',
        notificationBody: 'Monitoring real-time proximity alerts nearby.',
      },
    });
  }
}
