/**
 * Venue hubs from the backend: GET {VENUES_URL}/{tenant_id}/{venue_id} (the venue with upcoming
 * events and the last 30 days of events) and GET {VENUES_URL}/{tenant_id}?q= (search). Public and
 * read-only, like the events list. VENUES_URL is EXPO_PUBLIC_VENUES_URL, or the events URL with
 * /events swapped for /venues. Unset = off: venue pages use the events already loaded.
 */
import { EVENTS_URL } from './eventsApi';
import { parseEventsResponse, type ApiEvent } from '../lib/remoteEvents';

export const VENUES_URL: string = (
  (process.env.EXPO_PUBLIC_VENUES_URL ?? '').trim() || EVENTS_URL.replace(/\/events$/, '/venues')
).replace(/\/+$/, '');

export interface ApiVenue {
  id: string;
  name: string;
  handle?: string;
  kind: string;
  kind_label: string;
  public_space: boolean;
  address?: string;
  latitude: number;
  longitude: number;
  website?: string;
  phone?: string;
  claim_status: 'unclaimed' | 'pending' | 'claimed';
  verified: boolean;
  frozen?: boolean;
  upcoming_count?: number;
  distance_m?: number;
}

export interface ApiVenueHub {
  venue: ApiVenue;
  upcoming: ApiEvent[];
  past: ApiEvent[];
}

function isVenue(v: unknown): v is ApiVenue {
  const x = v as ApiVenue | null;
  return Boolean(x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.latitude === 'number' && typeof x.longitude === 'number');
}

export function parseVenueHub(body: unknown): ApiVenueHub | null {
  const b = body as { venue?: unknown; upcoming?: unknown; past?: unknown } | null;
  if (!b || !isVenue(b.venue)) return null;
  return {
    venue: b.venue,
    upcoming: parseEventsResponse({ events: b.upcoming ?? [] }),
    past: parseEventsResponse({ events: b.past ?? [] }),
  };
}

export async function fetchVenueHub(tenantId: string, venueId: string, signal?: AbortSignal): Promise<ApiVenueHub | null> {
  if (!VENUES_URL) return null;
  const response = await fetch(`${VENUES_URL}/${encodeURIComponent(tenantId)}/${encodeURIComponent(venueId)}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`venue: HTTP ${response.status}`);
  return parseVenueHub(await response.json());
}
