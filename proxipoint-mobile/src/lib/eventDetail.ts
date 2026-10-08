export type TravelMode = 'walk' | 'drive';

export interface EventDetailInput {
  title: string;
  venue: string;
  latitude: number;
  longitude: number;
  etaMode?: TravelMode;
  details?: string;
  sourceUrl?: string;
  hostName?: string;
  regionName?: string;
  status?: string;
  visibility?: string;
  tag?: string;
  tags?: string[];
}

function coordinate(value: number): string {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(6);
}

/** Directions link that opens Google Maps, the usual default maps handler. */
export function directionsUrl(latitude: number, longitude: number, mode: TravelMode = 'walk'): string {
  const lat = coordinate(latitude);
  const lng = coordinate(longitude);
  if (!lat || !lng) return '';
  const travelmode = mode === 'drive' ? 'driving' : 'walking';
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${travelmode}`;
}

/** A real Google Maps search for the venue, used when an event has no source link. */
export function placeSourceUrl(label: string, latitude: number, longitude: number): string {
  const lat = coordinate(latitude);
  const lng = coordinate(longitude);
  const place = label.trim();
  const query = place && lat && lng ? `${place}@${lat},${lng}` : place || (lat && lng ? `${lat},${lng}` : '');
  if (!query) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function eventSourceUrl(event: EventDetailInput): string {
  const explicit = event.sourceUrl?.trim();
  if (explicit) return explicit;
  return placeSourceUrl(event.venue || event.title, event.latitude, event.longitude);
}

export function eventDetailsText(event: EventDetailInput): string {
  const explicit = event.details?.trim();
  if (explicit) return explicit;

  const where = event.venue?.trim() || 'this pin';
  const host = event.hostName?.trim() ? ` Hosted by ${event.hostName.trim()}.` : '';
  const when = event.status?.trim() ? ` ${event.status.trim()}.` : '';
  const place = event.regionName?.trim() ? ` ${event.regionName.trim()}.` : '';
  const visibility =
    event.visibility === 'private' ? ' This drop is private.' : event.visibility === 'public' ? ' This drop is public.' : '';
  const channels = (event.tags && event.tags.length > 0 ? event.tags : event.tag ? [event.tag] : [])
    .map((tag) => tag.trim())
    .filter(Boolean);
  const channelLine = channels.length > 0 ? ` Channels: ${channels.join(', ')}.` : '';
  return `${event.title} at ${where}.${host}${when}${place}${visibility}${channelLine}`.replace(/\s+/g, ' ').trim();
}
