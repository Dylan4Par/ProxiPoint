import { telemetryPingUrl } from './telemetryApi';

export interface BeaconDropRequest {
  hostId: string;
  label: string;
  channels: string[];
  latitude: number;
  longitude: number;
  placeType?: string;
  customRadiusMeters: number;
  startsAt: string;
  expiresAt: string;
  trackedTags: string[];
}

function pipelineUrl(path: string): string {
  return telemetryPingUrl().replace(/\/api\/v1\/telemetry\/ping$/, `/api/v1/pipeline/${path}`);
}

/** Stores the beacon and fans out proximity alerts. A down ingest server does not block the local pin. */
export async function publishBeacon(drop: BeaconDropRequest): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(pipelineUrl('beacons'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        host_id: drop.hostId,
        label: drop.label,
        channels: drop.channels,
        latitude: drop.latitude,
        longitude: drop.longitude,
        place_type: drop.placeType ?? 'place',
        custom_radius_meters: drop.customRadiusMeters,
        starts_at: drop.startsAt,
        expires_at: drop.expiresAt,
        tracked_tags: drop.trackedTags,
        max_receive_radius_meters: 10000,
      }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
