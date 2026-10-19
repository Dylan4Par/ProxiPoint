import type { BeaconInvite } from './beaconInvite';
import type { BeaconVisibility } from '../types/beacon';
import { formatBeaconDate, formatBeaconTime } from './beaconWindow';

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
