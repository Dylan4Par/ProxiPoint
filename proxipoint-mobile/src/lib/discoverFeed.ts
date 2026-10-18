import { isLiveNode } from './liveStatus';
import type { Channel } from './channels';

/**
 * The Discover feed: channels worth joining, what's happening near you now, and what's coming up.
 * Pure functions (no React), so they're easy to test and can move to the server later
 * (e.g. GET /me/discover).
 */

export interface FeedNode {
  id: string;
  title?: string;
  tag?: string;
  tags?: string[];
  venue?: string;
  status?: string;
  startsAt?: string;
  endsAt?: string;
  origin?: string;
  distanceMeters?: number;
  isRsvpd?: boolean;
  attendeeCount?: number;
}

/** Points starting within this many minutes count as "nearby now" rather than "upcoming". */
export const SOON_MINUTES = 120;
export const MAX_NEARBY = 6;
export const MAX_UPCOMING = 12;

const key = (tag: string) => tag.replace(/^#+/, '').trim().toLowerCase();
/** Same tag reading as discoverFilters.nodeTags, kept here so this file has no React imports. */
const nodeTags = (node: FeedNode): string[] =>
  [...(node.tag ? node.tag.split(/[\s,]+/) : []), ...(Array.isArray(node.tags) ? node.tags : [])]
    .map(key)
    .filter(Boolean);
const startMs = (node: FeedNode) => (node.startsAt ? new Date(node.startsAt).getTime() : NaN);
const distance = (node: FeedNode) => (typeof node.distanceMeters === 'number' ? node.distanceMeters : Infinity);

function isEnded(node: FeedNode, now: number): boolean {
  return Boolean(node.endsAt && new Date(node.endsAt).getTime() <= now);
}

/** Live now, or starting within SOON_MINUTES. */
export function isHappeningSoon(node: FeedNode, now: number): boolean {
  if (isLiveNode(node)) return true;
  const start = startMs(node);
  return Number.isFinite(start) && start <= now + SOON_MINUTES * 60000;
}

/**
 * Splits Points into the two event sections. Ended Points and your own are left out.
 * - nearby: live now or starting soon, closest first (live ones win a tie).
 * - upcoming: everything later, soonest first.
 * Pass `allow` to drop reported/blocked Points (moderation.isNodeAllowed).
 */
export function splitFeed(
  nodes: Record<string, FeedNode> | FeedNode[] | null | undefined,
  now = Date.now(),
  allow: (node: FeedNode) => boolean = () => true,
): { nearby: FeedNode[]; upcoming: FeedNode[] } {
  const list = (Array.isArray(nodes) ? nodes : Object.values(nodes ?? {})).filter(
    (node) => node && node.origin !== 'local' && !isEnded(node, now) && allow(node),
  );
  const nearby = list
    .filter((node) => isHappeningSoon(node, now))
    .sort((a, b) => distance(a) - distance(b) || Number(isLiveNode(b)) - Number(isLiveNode(a)))
    .slice(0, MAX_NEARBY);
  const upcoming = list
    .filter((node) => !isHappeningSoon(node, now) && Number.isFinite(startMs(node)))
    .sort((a, b) => startMs(a) - startMs(b))
    .slice(0, MAX_UPCOMING);
  return { nearby, upcoming };
}

/** Points that use any of the channel's #tags. */
export function channelNodes<T extends FeedNode>(channel: Pick<Channel, 'tags'>, nodes: T[]): T[] {
  const wanted = new Set(channel.tags.map(key));
  return nodes.filter((node) => nodeTags(node).some((tag) => wanted.has(key(tag))));
}

export interface ChannelPick {
  channel: Channel;
  /** Your #tags it shares, as the channel writes them. */
  matched: string[];
  /** Points in the channel that haven't ended. */
  activeCount: number;
  reason: string;
  score: number;
}

/**
 * Channels you haven't joined, best first: ones that share your #tags, then ones with
 * something happening around you, then the biggest.
 */
export function recommendChannels(
  channels: Channel[],
  nodes: Record<string, FeedNode> | FeedNode[] | null | undefined,
  interestTags: string[],
  now = Date.now(),
  max = 6,
): ChannelPick[] {
  const followed = new Set(interestTags.map(key));
  const live = (Array.isArray(nodes) ? nodes : Object.values(nodes ?? {})).filter(
    (node) => node && node.origin !== 'local' && !isEnded(node, now),
  );
  return channels
    .filter((channel) => !channel.joined)
    .map((channel) => {
      const matched = channel.tags.filter((tag) => followed.has(key(tag)));
      const activeCount = channelNodes(channel, live).length;
      const score = matched.length * 30 + activeCount * 8 + Math.log10(channel.memberCount + 1) * 2;
      const reason = matched.length
        ? `Matches ${matched.slice(0, 2).join(', ')}`
        : activeCount
          ? `${activeCount} ${activeCount === 1 ? 'Point' : 'Points'} near you`
          : `${formatCount(channel.memberCount)} members`;
      return { channel, matched, activeCount, reason, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

/** "316m" or "1.4 km" */
export function formatDistance(meters: number | undefined): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

/** "1.2k" for big counts. */
export function formatCount(count: number): string {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(count < 10000 ? 1 : 0).replace(/\.0$/, '')}k`;
}

/** Section heading for an upcoming Point: "Today", "Tomorrow", or "Sat, Oct 24". */
export function dayLabel(iso: string, now = Date.now()): string {
  const day = new Date(iso);
  const today = new Date(now);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(day) - startOf(today)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "7:30 PM" */
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Groups upcoming Points under their day heading, keeping their order. */
export function groupByDay<T extends FeedNode>(nodes: T[], now = Date.now()): Array<{ label: string; items: T[] }> {
  const groups: Array<{ label: string; items: T[] }> = [];
  for (const node of nodes) {
    if (!node.startsAt) continue;
    const label = dayLabel(node.startsAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(node);
    else groups.push({ label, items: [node] });
  }
  return groups;
}
