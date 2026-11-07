/**
 * What sharing a Point sends: its title, when and where, and its link.
 *   Porch Blues Session
 *   Live now · until 8:00 PM · Briggs Street Porch
 *   https://proxipoint.app/p/<id>
 */
import { formatBeaconDate, formatBeaconTime } from './beaconWindow';
import { SHARE_BASE_URL } from './droppedPoint';

export interface ShareablePoint {
  id: string;
  title: string;
  startsAt?: string | null;
  endsAt?: string | null;
  live?: boolean;
  /** The venue, or "Somewhere in <area>" when the host hid the exact spot. */
  where?: string | null;
}

export function pointShareUrl(id: string): string {
  return `${SHARE_BASE_URL}${encodeURIComponent(id)}`;
}

export function pointShareWhen(p: ShareablePoint): string {
  const start = p.startsAt ? new Date(p.startsAt) : null;
  const end = p.endsAt ? new Date(p.endsAt) : null;
  const ok = (d: Date | null): d is Date => d != null && !Number.isNaN(d.getTime());
  if (p.live) return ok(end) ? `Live now · until ${formatBeaconTime(end)}` : 'Happening now';
  if (!ok(start)) return '';
  const day = `${formatBeaconDate(start)} · ${formatBeaconTime(start)}`;
  return ok(end) && end.toDateString() === start.toDateString() ? `${day} – ${formatBeaconTime(end)}` : day;
}

/** The message and link for the share sheet (iOS takes the link separately). */
export function pointShareContent(p: ShareablePoint): { message: string; url: string } {
  const url = pointShareUrl(p.id);
  const line = [pointShareWhen(p), p.where?.trim()].filter(Boolean).join(' · ');
  return { message: [p.title, line].filter(Boolean).join('\n'), url };
}
