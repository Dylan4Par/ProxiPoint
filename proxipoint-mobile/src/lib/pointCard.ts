import { formatCount, formatDistance, timeLabel } from './discoverFeed';
import { isLiveNode } from './liveStatus';

/**
 * What a Point card shows in its pills: when (live / starting soon / later) and how far.
 * Pure, so Discover and the Explore Map list read the same way.
 */

export type TimingKind = 'live' | 'soon' | 'later';

export interface Timing {
  kind: TimingKind;
  label: string;
}

/** "Starts in …" is used up to this far ahead; after that it's the start time. */
export const SOON_MINUTES = 120;

interface TimedPoint {
  status?: string;
  isLiveNow?: boolean;
  startsAt?: string;
}

/** "Starts in 15 min" / "Starts in 1h 20m". */
export function startsInLabel(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `Starts in ${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `Starts in ${h}h ${rest}m` : `Starts in ${h}h`;
}

export function pointTiming(node: TimedPoint, now = Date.now()): Timing | null {
  if (isLiveNode(node)) return { kind: 'live', label: 'LIVE NOW' };
  const start = node.startsAt ? new Date(node.startsAt).getTime() : NaN;
  if (Number.isFinite(start)) {
    const minutes = (start - now) / 60000;
    if (minutes > 0 && minutes <= SOON_MINUTES) return { kind: 'soon', label: startsInLabel(minutes) };
    if (minutes > SOON_MINUTES) return { kind: 'later', label: timeLabel(node.startsAt as string) };
  }
  const status = node.status?.trim();
  return status ? { kind: 'later', label: status } : null;
}

/** "540m • 7 min walk" (the travel part only when the Point has one). */
export function distanceLabel(meters: number | undefined, eta?: string | null): string | null {
  const distance = formatDistance(meters);
  const travel = eta?.trim() || null;
  if (!distance) return travel;
  return travel ? `${distance} • ${travel}` : distance;
}

/** "12+" next to the faces; null hides the stack. */
export function goingLabel(count: number | undefined): string | null {
  if (!count || count <= 0) return null;
  return `${formatCount(count)}+`;
}
