import type { LocationPingPayload } from '../types/telemetry';

export const TELEMETRY_QUEUE_LIMIT = 20;

export interface LiveTrackingConfig {
  userId: string;
  telemetryEnabled: boolean;
}

export interface StoredTrackingPrefs {
  callsign: string | null;
  trackingEnabled: string | null;
}

export interface BackgroundBroadcast {
  userId: string;
  telemetryEnabled: boolean;
}

// A killed app has no in-memory session. The background task then trusts the
// same AsyncStorage keys Settings writes for the callsign and broadcast switch.
export function resolveBackgroundBroadcast(
  live: LiveTrackingConfig | null,
  stored: StoredTrackingPrefs,
): BackgroundBroadcast {
  if (live) {
    return { userId: live.userId, telemetryEnabled: live.telemetryEnabled };
  }
  const telemetryEnabled = stored.trackingEnabled === null ? true : stored.trackingEnabled === 'true';
  return {
    userId: stored.callsign?.trim() ?? '',
    telemetryEnabled,
  };
}

export function parseTelemetryQueue(raw: string | null): LocationPingPayload[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLocationPingPayload);
  } catch {
    return [];
  }
}

export function planBackgroundBatch(
  queued: readonly LocationPingPayload[],
  incoming: readonly LocationPingPayload[],
  enabled: boolean,
  limit = TELEMETRY_QUEUE_LIMIT,
): LocationPingPayload[] {
  if (!enabled) return [];
  return [...queued, ...incoming].slice(-limit);
}

export async function flushTelemetryBatch(
  batch: readonly LocationPingPayload[],
  send: (payload: LocationPingPayload) => Promise<void>,
): Promise<LocationPingPayload[]> {
  for (let index = 0; index < batch.length; index += 1) {
    try {
      await send(batch[index]);
    } catch {
      return batch.slice(index);
    }
  }
  return [];
}

function isLocationPingPayload(value: unknown): value is LocationPingPayload {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<LocationPingPayload>;
  return (
    typeof record.userId === 'string' &&
    typeof record.latitude === 'number' &&
    typeof record.longitude === 'number' &&
    typeof record.timestamp === 'string'
  );
}
