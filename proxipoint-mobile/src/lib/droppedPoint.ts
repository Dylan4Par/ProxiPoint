import type { BeaconInvite } from './beaconInvite';
import type { BeaconVisibility } from '../types/beacon';
import { formatBeaconDate, formatBeaconTime } from './beaconWindow';
import type { RepeatPayload } from './recurrence';

/**
 * Everything the Manage sheet and My Drops need about a Point the user created.
 * Built by the Drop Point sheet right after the drop succeeds.
 */
export interface DroppedPoint {
  id: string;
  title: string;
  description: string;
  tags: string[];
  visibility: BeaconVisibility;
  /** Channel it was posted to, if any. */
  channelId?: string | null;
  venue: string;
  latitude: number;
  longitude: number;
  isLiveNow: boolean;
  /** ISO strings so the object is easy to store or send later. */
  startsAt: string;
  endsAt: string;
  /** Repeat rule for a repeating event (times above are the first one); null or missing = one-time. */
  recurrence?: RepeatPayload | null;
  coverPhotoUri: string | null;
  requiresApproval: boolean;
  maxAttendance: number | null;
  /** Null when the exact location is public. */
  locationPrivacy: { level: string; regionName: string } | null;
  /** Beacon reach, e.g. "300m", or null when the beacon is off. */
  beaconRadius: string | null;
  invites: BeaconInvite[];
  /**
   * People who RSVP'd. Optional until the server sends it (e.g. from GET /me/points or
   * GET /points/:id/rsvps); the Manage sheet shows "No RSVPs yet" when it's missing.
   */
  rsvps?: PointRsvp[];
  /** False when the server couldn't be reached and the Point only exists on this phone. */
  synced: boolean;
  createdAt: string;
}

/**
 * Venue name without app notes like "(Current Location)", which the GPS button adds to the
 * search box but shouldn't become part of the Point's name.
 */
export function cleanVenueLabel(label: string): string {
  return label.replace(/\s*\((current location|selected on map)\)\s*$/i, '').trim();
}

export interface PointRsvp {
  id: string;
  /** What to show, e.g. "@ranger-7" or "Sam K." */
  label: string;
  /** 'pending' = waiting for the host's approval (approval Points only). */
  status: 'going' | 'pending';
}

export type PointStatus = 'live' | 'upcoming' | 'past';

/** Where share links point. Set EXPO_PUBLIC_SHARE_BASE_URL once you have a web page for Points. */
export const SHARE_BASE_URL: string =
  process.env.EXPO_PUBLIC_SHARE_BASE_URL ?? 'https://proxipoint.app/p/';

export function pointStatus(point: Pick<DroppedPoint, 'startsAt' | 'endsAt'>, now = new Date()): PointStatus {
  const start = new Date(point.startsAt).getTime();
  const end = new Date(point.endsAt).getTime();
  const t = now.getTime();
  if (t >= end) return 'past';
  if (t >= start) return 'live';
  return 'upcoming';
}

/** Your events that have ended, the most recently ended first (Profile → MY RECENT EVENTS). */
export function recentEndedPoints(points: DroppedPoint[], now = new Date(), limit = 3): DroppedPoint[] {
  return points
    .filter((point) => pointStatus(point, now) === 'past')
    .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())
    .slice(0, Math.max(0, limit));
}

/** Your events happening right now, the one ending soonest first (Profile → MY EVENTS → LIVE NOW). */
export function liveDroppedPoints(points: DroppedPoint[], now = new Date()): DroppedPoint[] {
  return points
    .filter((point) => pointStatus(point, now) === 'live')
    .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
}

/**
 * "4 going", "4 / 20 going", "4 going · 2 waiting", or "No RSVPs yet"
 * (also until the server sends RSVPs, matching the Manage sheet).
 */
export function attendeeSummary(point: DroppedPoint): string {
  const rsvps = point.rsvps ?? [];
  const going = rsvps.filter((rsvp) => rsvp.status === 'going').length;
  const waiting = rsvps.length - going;
  if (going === 0 && waiting === 0) return 'No RSVPs yet';
  const count = point.maxAttendance != null ? `${going} / ${point.maxAttendance} going` : `${going} going`;
  return waiting > 0 ? `${count} · ${waiting} waiting` : count;
}

/** "Ended Sat, Oct 18 · 3 went" (the count only once the server sends RSVPs). */
export function endedSummary(point: DroppedPoint): string {
  const ended = `Ended ${formatBeaconDate(new Date(point.endsAt))}`;
  if (!point.rsvps) return ended;
  const going = point.rsvps.filter((rsvp) => rsvp.status === 'going').length;
  return `${ended} · ${going} went`;
}

/** "Sun, Oct 12 · 7:00 PM – 9:00 PM", or "Live now · until 9:00 PM". */
export function formatPointWhen(point: DroppedPoint, now = new Date()): string {
  const start = new Date(point.startsAt);
  const end = new Date(point.endsAt);
  if (pointStatus(point, now) === 'live') return `Live now · until ${formatBeaconTime(end)}`;
  const sameDay = start.toDateString() === end.toDateString();
  return sameDay
    ? `${formatBeaconDate(start)} · ${formatBeaconTime(start)} – ${formatBeaconTime(end)}`
    : `${formatBeaconDate(start)} ${formatBeaconTime(start)} – ${formatBeaconDate(end)} ${formatBeaconTime(end)}`;
}

/** What other people are told about the location (never the exact spot when privacy is on). */
export function publicWhere(point: DroppedPoint): string {
  if (point.locationPrivacy) return `Somewhere in ${point.locationPrivacy.regionName}`;
  return cleanVenueLabel(point.venue);
}

export function shareUrl(point: DroppedPoint): string {
  return `${SHARE_BASE_URL}${encodeURIComponent(point.id)}`;
}

export function shareMessage(point: DroppedPoint): string {
  return [point.title, `${formatPointWhen(point)} · ${publicWhere(point)}`, shareUrl(point)].join('\n');
}

/** Text for invite SMS: a bit more personal than the general share. */
export function inviteTextMessage(point: DroppedPoint): string {
  return [
    `You're invited: ${point.title}`,
    `${formatPointWhen(point)} · ${publicWhere(point)}`,
    point.requiresApproval ? `Request to join here: ${shareUrl(point)}` : `RSVP here: ${shareUrl(point)}`,
  ].join('\n');
}

/**
 * A mailto: link to email every email invitee at once (Bcc, so they don't see each other),
 * with the invite text filled in. Null when there's nobody to email.
 */
export function inviteEmailUrl(point: DroppedPoint): string | null {
  const emails = point.invites.filter((invite) => invite.kind === 'email').map((invite) => invite.id);
  if (!emails.length) return null;
  const subject = encodeURIComponent(`You're invited: ${point.title}`);
  const body = encodeURIComponent(inviteTextMessage(point));
  return `mailto:?bcc=${emails.map(encodeURIComponent).join(',')}&subject=${subject}&body=${body}`;
}

/** Digits (and a leading +) from a phone invite, for the SMS app. */
export function phoneNumberFromInvite(invite: BeaconInvite): string | null {
  const fromId = String(invite.id ?? '').replace(/[^\d+]/g, '');
  if (fromId.replace(/\D/g, '').length >= 7) return fromId;
  const fromLabel = String(invite.label ?? '').replace(/[^\d+]/g, '');
  return fromLabel.replace(/\D/g, '').length >= 7 ? fromLabel : null;
}

export function calendarEventFor(point: DroppedPoint): {
  title: string;
  startDate: Date;
  endDate: Date;
  location: string;
  notes: string;
} {
  return {
    title: point.title,
    startDate: new Date(point.startsAt),
    endDate: new Date(point.endsAt),
    // The host's own calendar gets the real venue; this is their event.
    location: cleanVenueLabel(point.venue),
    notes: [point.description, shareUrl(point)].filter(Boolean).join('\n\n'),
  };
}

/**
 * Places you've dropped at, most recent first, one per spot (same venue name or within ~50 m),
 * for the "Recent" chips on Create Drop.
 */
export function recentDropPlaces(
  drops: Pick<DroppedPoint, 'id' | 'venue' | 'latitude' | 'longitude' | 'createdAt'>[],
  limit = 3,
): { id: string; label: string; subtitle: string; latitude: number; longitude: number }[] {
  const out: { id: string; label: string; subtitle: string; latitude: number; longitude: number }[] = [];
  const sorted = [...drops].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const drop of sorted) {
    if (!Number.isFinite(drop.latitude) || !Number.isFinite(drop.longitude)) continue;
    const label = cleanVenueLabel(drop.venue) || `${drop.latitude.toFixed(4)}, ${drop.longitude.toFixed(4)}`;
    const same = out.some((place) => {
      if (place.label.toLowerCase() === label.toLowerCase()) return true;
      const dLat = (place.latitude - drop.latitude) * 111_320;
      const dLon = (place.longitude - drop.longitude) * 111_320 * Math.cos((drop.latitude * Math.PI) / 180);
      return Math.hypot(dLat, dLon) < 50;
    });
    if (same) continue;
    out.push({ id: `recent-${drop.id}`, label, subtitle: 'Recent', latitude: drop.latitude, longitude: drop.longitude });
    if (out.length >= limit) break;
  }
  return out;
}
