/**
 * Events from the backend (GET /api/v1/events/{tenant_id} on ingest-core) turned into Discover
 * nodes. Pure (no React), so it's unit-tested.
 *
 * The backend returns only what anyone may see: public, not ended, and, when the host hid the
 * exact spot, only the area's point and name (no venue). Aggregated events (source 'external')
 * are listed by @LocalRadar and link to their venue's page; see lib/aggregated.ts.
 */
import type { DiscoveryNode, PhotoCredit } from '../stores/useDiscoveryStore';
import { LOCALRADAR_HANDLE, venueHandleFor, type PointSource } from './aggregated';
import { canonicalizeTags } from './hashtags';
import { eventFacts, type ApiEventDetails } from './eventDetails';

export interface ApiEventVenue {
  id: string;
  name: string;
  handle?: string;
  claim_status: string;
  address?: string;
}

export interface ApiEvent {
  id: string;
  title: string;
  /** For gathered events (source 'external'), only a short lead from the source's text. */
  description?: string;
  description_is_excerpt?: boolean;
  starts_at: string;
  ends_at: string;
  status: string;
  source: string;
  host_handle?: string;
  /** The poster's / lister's display name (e.g. "BoulderDowntown.com" for @boulderdowntown). */
  host_name?: string;
  url?: string;
  tags: string[];
  venue?: ApiEventVenue;
  location: {
    latitude: number;
    longitude: number;
    precision: 'exact' | 'street' | 'neighborhood' | 'city';
    region_name?: string;
  };
  distance_m?: number;
  /** Gathered events: price, age limit, door rules and a one-line hook (see lib/eventDetails). */
  details?: ApiEventDetails;
  /**
   * Photo for the card: from our own collection (provider 'catalog', by tag or category) or
   * Pexels. Pexels photos must be credited; ours are credited when a photographer is recorded.
   */
  cover_photo?: {
    provider: string;
    url: string;
    large_url?: string;
    page_url?: string;
    photographer?: string;
    photographer_url?: string;
    avg_color?: string;
    license?: string;
  };
}

/** Remote nodes' ids start with this, so a refresh replaces them without touching local ones. */
export const REMOTE_ID_PREFIX = 'ev:';

export const isRemoteNodeId = (id: string): boolean => id.startsWith(REMOTE_ID_PREFIX);

/** Map pin / geofence radius for remote events (the backend doesn't send one). */
const REMOTE_RADIUS_M = 150;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/**
 * Pulls the events out of a response body, dropping anything malformed instead of failing the
 * whole list. Cancelled events are left out (Discover has no cancelled state yet).
 */
export function parseEventsResponse(body: unknown): ApiEvent[] {
  const list = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is ApiEvent => {
    const ev = e as Partial<ApiEvent> | null;
    return (
      !!ev &&
      isStr(ev.id) &&
      isStr(ev.title) &&
      ev.title.trim() !== '' &&
      isStr(ev.starts_at) &&
      isStr(ev.ends_at) &&
      !Number.isNaN(Date.parse(ev.starts_at)) &&
      !Number.isNaN(Date.parse(ev.ends_at)) &&
      ev.status !== 'cancelled' &&
      !!ev.location &&
      isNum(ev.location.latitude) &&
      isNum(ev.location.longitude)
    );
  });
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "LIVE NOW", "Starts in 15m", "Starts in 2h", "Today 7:30 PM", "Tomorrow …" or "Thu 7:00 PM". */
export function timingStatus(start: Date, end: Date, now: Date): { status: string; statusColor: string } {
  if (now >= start && now < end) return { status: 'LIVE NOW', statusColor: '#10b981' };
  const minutes = Math.round((start.getTime() - now.getTime()) / 60000);
  if (minutes <= 59) return { status: `Starts in ${Math.max(1, minutes)}m`, statusColor: '#38bdf8' };
  if (minutes <= 180) return { status: `Starts in ${Math.round(minutes / 60)}h`, statusColor: '#38bdf8' };
  const sameDay = start.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = sameDay
    ? 'Today'
    : start.toDateString() === tomorrow.toDateString()
      ? 'Tomorrow'
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][start.getDay()];
  return { status: `${day} ${formatClock(start)}`, statusColor: '#94a3b8' };
}

/**
 * One backend event as a Discover node. Map position, distance and ETA are left at zero: the
 * store fills them in for where you are (placeNodes).
 */
export function remoteEventToNode(ev: ApiEvent, now = new Date()): DiscoveryNode {
  const start = new Date(ev.starts_at);
  const end = new Date(ev.ends_at);
  const source: PointSource = ev.source === 'external' ? 'external' : 'user';
  const tags = canonicalizeTags(ev.tags ?? []).slice(0, 3);
  const venueName = ev.venue?.name ?? '';

  return {
    id: `${REMOTE_ID_PREFIX}${ev.id}`,
    tag: tags[0] ?? '',
    tags,
    title: ev.title,
    description: ev.description ?? '',
    url: ev.url || null,
    venue: venueName,
    // Aggregated events are listed by @LocalRadar or another listings account (e.g.
    // @boulderdowntown), never by the venue.
    host:
      source === 'external'
        ? ev.host_handle && ev.host_handle.toLowerCase() !== 'localradar'
          ? `@${ev.host_handle}`
          : LOCALRADAR_HANDLE
        : ev.host_handle
          ? `@${ev.host_handle}`
          : undefined,
    hostName: ev.host_name || undefined,
    source,
    venueHandle: ev.venue ? (ev.venue.handle ? `@${ev.venue.handle}` : venueHandleFor(venueName)) : undefined,
    venueId: ev.venue?.id || undefined,
    venueAddress: ev.venue?.address || undefined,
    venueClaimStatus: ev.venue?.claim_status || undefined,
    latitude: ev.location.latitude,
    longitude: ev.location.longitude,
    distanceMeters: 0,
    ...timingStatus(start, end, now),
    eta: '',
    etaMode: 'walk',
    attendeeCount: 0,
    hereCount: 0,
    isRsvpd: false,
    radii: [REMOTE_RADIUS_M],
    radiusMeters: REMOTE_RADIUS_M,
    maxAttendance: null,
    requiresApproval: false,
    locationPrivacy:
      ev.location.precision === 'exact'
        ? null
        : { level: ev.location.precision, regionName: ev.location.region_name ?? '' },
    // A cover photo only when it's the event's own: stock and collection photos (by tag or
    // category) aren't of this event, so the category icon stands in for them.
    ...photoFields(isStockPhoto(ev.cover_photo) ? undefined : ev.cover_photo),
    facts: eventFacts(ev.details),
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    x: 0,
    y: 0,
  };
}

/** Photos picked by tag or category (our collection, Pexels), not taken at or for the event. */
export const STOCK_PHOTO_PROVIDERS = ['catalog', 'pexels'];
export function isStockPhoto(photo: ApiEvent['cover_photo']): boolean {
  return !!photo && STOCK_PHOTO_PROVIDERS.includes(String(photo.provider ?? '').toLowerCase());
}

const httpsUrl = (v: unknown): string | null => (isStr(v) && v.startsWith('https://') ? v : null);

const CREDITED_SOURCES: Record<string, string> = { pexels: 'Pexels', unsplash: 'Unsplash' };

/**
 * Cover photo, its large version, and the credit.
 * - Pexels photos (from the scraper) are shown only with their credit, which Pexels requires.
 * - Our own collection ('catalog') is shown as is; the credit appears when a photographer is
 *   recorded, with "on Pexels/Unsplash" when the photo came from there.
 */
export function photoFields(photo: ApiEvent['cover_photo']): {
  coverPhotoUri: string | null;
  coverPhotoLargeUri: string | null;
  photoCredit: PhotoCredit | null;
} {
  const none = { coverPhotoUri: null, coverPhotoLargeUri: null, photoCredit: null };
  const url = httpsUrl(photo?.url);
  if (!photo || !url) return none;
  const pageUrl = httpsUrl(photo.page_url);
  const photographer = isStr(photo.photographer) ? photo.photographer.trim() : '';
  const isPexels = photo.provider === 'pexels';
  if (isPexels && (!pageUrl || !photographer)) return none;

  const source = isPexels ? 'pexels' : (photo.license ?? '').trim().toLowerCase();
  return {
    coverPhotoUri: url,
    coverPhotoLargeUri: httpsUrl(photo.large_url) ?? url,
    photoCredit: photographer
      ? {
          provider: CREDITED_SOURCES[source] ?? '',
          photographer,
          photographerUrl: httpsUrl(photo.photographer_url),
          pageUrl,
        }
      : null,
  };
}

/**
 * Replaces the previous remote nodes with a fresh set, keeping local ones (samples, your own
 * Points) and what you did on a remote event (RSVP, "I'm here") across refreshes.
 */
export function mergeRemoteNodes(
  current: Record<string, DiscoveryNode>,
  incoming: DiscoveryNode[],
): Record<string, DiscoveryNode> {
  const next: Record<string, DiscoveryNode> = {};
  for (const [id, node] of Object.entries(current)) {
    if (!isRemoteNodeId(id)) next[id] = node;
  }
  for (const node of incoming) {
    const prev = current[node.id];
    next[node.id] = prev
      ? { ...node, isRsvpd: prev.isRsvpd, imHere: prev.imHere, attendeeCount: Math.max(node.attendeeCount, prev.attendeeCount) }
      : node;
  }
  return next;
}
