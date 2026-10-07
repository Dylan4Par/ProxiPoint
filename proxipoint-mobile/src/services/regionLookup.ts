import { DEFAULT_REGION_TOLERANCE_METERS, locateRegions, type RegionMatch } from '../lib/regions';
import { telemetryPingUrl } from './telemetryApi';

export function regionLookupUrl(): string {
  return telemetryPingUrl().replace(/\/api\/v1\/telemetry\/ping$/, '/api/v1/regions/lookup');
}

interface LookupResponse {
  regions?: RegionMatch[];
}

export async function lookupContainingRegions(
  latitude: number,
  longitude: number,
  toleranceMeters = DEFAULT_REGION_TOLERANCE_METERS,
): Promise<RegionMatch[]> {
  const local = () => locateRegions(longitude, latitude, toleranceMeters);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(regionLookupUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ longitude, latitude, toleranceMeters }),
      signal: controller.signal,
    });
    if (!response.ok) return local();
    const body = (await response.json()) as LookupResponse;
    if (!Array.isArray(body.regions)) return local();
    return body.regions;
  } catch {
    return local();
  } finally {
    clearTimeout(timer);
  }
}
