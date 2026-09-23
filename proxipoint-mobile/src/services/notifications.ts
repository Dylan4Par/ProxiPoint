import { Platform } from 'react-native';
import { claimNotificationSlot } from '../lib/notificationCooldown';
import type { ProximityAlertEvent } from '../types/telemetry';

const PROXIMITY_CHANNEL_ID = 'proximity';
const recentAlertCache = new Map<string, number>();

let handlerReady = false;

async function loadNotifications() {
  return import('expo-notifications');
}

async function ensureNotificationHandler() {
  if (handlerReady || Platform.OS === 'web') return;
  const Notifications = await loadNotifications();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(PROXIMITY_CHANNEL_ID, {
      name: 'Proximity alerts',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
  handlerReady = true;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  await ensureNotificationHandler();
  const Notifications = await loadNotifications();
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === 'granted';
}

export async function notifyProximityBreach(alert: ProximityAlertEvent) {
  if (Platform.OS === 'web') return;

  const now = Date.now();
  if (!claimNotificationSlot(recentAlertCache, alert.targetEntityId, now)) {
    return;
  }

  try {
    await ensureNotificationHandler();
    const Notifications = await loadNotifications();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Proximity Alert',
        body: `${alert.targetName || alert.targetEntityId} is within ${Math.round(alert.distanceMeters)}m!`,
        data: { targetEntityId: alert.targetEntityId, lat: alert.latitude, lon: alert.longitude },
        sound: 'default',
      },
      trigger: Platform.OS === 'android' ? { channelId: PROXIMITY_CHANNEL_ID } : null,
    });
  } catch (err) {
    console.warn('Proximity notification failed:', err);
  }
}
