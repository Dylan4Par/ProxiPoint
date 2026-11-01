/**
 * Upcoming events from the backend: GET {EXPO_PUBLIC_EVENTS_URL}/{tenant_id} (ingest-core's
 * public, read-only list; no sign-in). Unset = off, and Discover shows only the samples and
 * your own Points.
 *
 *   EXPO_PUBLIC_EVENTS_URL=https://api.callsignsolutions.com/api/v1/events
 */
import { parseEventsResponse, type ApiEvent } from '../lib/remoteEvents';

export const EVENTS_URL: string = (process.env.EXPO_PUBLIC_EVENTS_URL ?? '').trim().replace(/\/+$/, '');

/** How far ahead to load (the server allows up to 62 days). */
export const EVENTS_DAYS_AHEAD = 30;
/** Around the place you're exploring (the server allows 100 m to 100 km). */
export const EVENTS_RADIUS_M = 50000;

export interface FetchEventsOptions {
  tenantId: string;
  near: { latitude: number; longitude: number };
  now?: Date;
  signal?: AbortSignal;
}

export function eventsRequestUrl({ tenantId, near, now = new Date() }: FetchEventsOptions): string {
  const to = new Date(now.getTime() + EVENTS_DAYS_AHEAD * 24 * 3600 * 1000);
  const params = [
    `from=${encodeURIComponent(now.toISOString())}`,
    `to=${encodeURIComponent(to.toISOString())}`,
    `near=${near.latitude.toFixed(5)},${near.longitude.toFixed(5)}`,
    `radius_m=${EVENTS_RADIUS_M}`,
    'limit=500',
  ];
  return `${EVENTS_URL}/${encodeURIComponent(tenantId)}?${params.join('&')}`;
}

export async function fetchEvents(options: FetchEventsOptions): Promise<ApiEvent[]> {
  const response = await fetch(eventsRequestUrl(options), {
    signal: options.signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    let detail = '';
    try {
      detail = ((await response.json()) as { error?: string }).error ?? '';
    } catch {
      // not JSON
    }
    throw new Error(`events: HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return parseEventsResponse(await response.json());
}
