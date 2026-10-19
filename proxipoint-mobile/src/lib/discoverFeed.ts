import { isLiveNode } from './liveStatus';
import { calculateDistanceMeters } from './locationFilter';
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
  latitude?: number;
  longitude?: number;
  /** Channel the Point was posted to. */
  channelId?: string | null;
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

/**
 * Points in a channel: ones posted to it, plus ones using any of its #tags. A channel with no
 * #tags (a city channel) has them all.
 */
export function channelNodes<T extends FeedNode>(channel: Pick<Channel, 'tags'> & { id?: string }, nodes: T[]): T[] {
  if (!channel.tags.length) return nodes;
  if (channel.id) {
    const posted = nodes.filter((node) => node.channelId === channel.id);
    const tagged = channelNodes({ tags: channel.tags }, nodes).filter((node) => node.channelId !== channel.id);
    return [...posted, ...tagged];
  }
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
    // Private channels are found by searching, not recommended.
    .filter((channel) => !channel.joined && channel.access !== 'private')
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

// ---- Search --------------------------------------------------------------------------------

/** Range choices for Discover search, in meters (null = any distance). */
export const SEARCH_RANGES: Array<{ label: string; meters: number | null }> = [
  { label: '1 km', meters: 1000 },
  { label: '5 km', meters: 5000 },
  { label: '10 km', meters: 10000 },
  { label: '25 km', meters: 25000 },
  { label: 'Any', meters: null },
];
export const DEFAULT_RANGE_METERS = 10000;

export interface SearchCenter {
  latitude: number;
  longitude: number;
}

/** Meters from the search center, or null when the Point has no coordinates. */
export function distanceFrom(center: SearchCenter, node: FeedNode): number | null {
  if (typeof node.latitude !== 'number' || typeof node.longitude !== 'number') return null;
  return calculateDistanceMeters(center.latitude, center.longitude, node.latitude, node.longitude);
}

/** Inside the range (null range = anywhere). Points without coordinates count as inside. */
export function inRange(center: SearchCenter, node: FeedNode, rangeMeters: number | null): boolean {
  if (rangeMeters == null) return true;
  const d = distanceFrom(center, node);
  return d == null || d <= rangeMeters;
}

/** Search words: "#Live music" → ["live", "music"]. */
function terms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,]+/)
    .map((word) => word.replace(/^#+/, '').replace(/^c\//, '').trim())
    .filter(Boolean);
}

/** "c/…" searches channels only (like a subreddit name): no Points or #tag suggestions. */
export function isChannelQuery(query: string): boolean {
  return /^c\//i.test(query.trim());
}

/**
 * Points matching the search, closest to the center first.
 * Every word has to appear in one of its #tags (so "music" finds #LiveMusic), its title or its venue.
 */
export function searchPoints<T extends FeedNode>(
  nodes: Record<string, T> | T[] | null | undefined,
  query: string,
  center: SearchCenter,
  rangeMeters: number | null,
  now = Date.now(),
  allow: (node: T) => boolean = () => true,
): T[] {
  const words = terms(query);
  if (!words.length || isChannelQuery(query)) return [];
  const list = (Array.isArray(nodes) ? nodes : Object.values(nodes ?? {})).filter(
    (node) => node && node.origin !== 'local' && !isEnded(node, now) && allow(node) && inRange(center, node, rangeMeters),
  );
  const matches = list.filter((node) => {
    const tags = nodeTags(node);
    const text = `${node.title ?? ''} ${node.venue ?? ''}`.toLowerCase();
    return words.every((word) => tags.some((tag) => tag.includes(word)) || text.includes(word));
  });
  const d = (node: T) => distanceFrom(center, node) ?? Infinity;
  return matches.sort((a, b) => Number(isLiveNode(b)) - Number(isLiveNode(a)) || d(a) - d(b));
}

/**
 * #tag suggestions for the last word typed: tags containing it, ones that start with it first,
 * then most-used.
 * `extra` adds tags with no Points right now (e.g. the header chips) so they can still be picked.
 */
export function suggestTags(
  nodes: Record<string, FeedNode> | FeedNode[] | null | undefined,
  query: string,
  extra: string[] = [],
  max = 8,
): Array<{ tag: string; count: number }> {
  const words = terms(query);
  const last = words[words.length - 1];
  if (!last || isChannelQuery(query)) return [];
  const counts = new Map<string, { tag: string; count: number }>();
  const add = (raw: string, n: number) => {
    const k = key(raw);
    if (!k.includes(last)) return;
    const current = counts.get(k);
    if (current) current.count += n;
    else counts.set(k, { tag: `#${raw.replace(/^#+/, '').trim()}`, count: n });
  };
  for (const node of Array.isArray(nodes) ? nodes : Object.values(nodes ?? {})) {
    if (!node) continue;
    const raw = [...(node.tag ? node.tag.split(/[\s,]+/) : []), ...(Array.isArray(node.tags) ? node.tags : [])];
    [...new Map(raw.filter(Boolean).map((tag) => [key(tag), tag])).values()].forEach((tag) => add(tag, 1));
  }
  extra.filter((tag) => tag && tag !== 'All').forEach((tag) => add(tag, 0));
  const starts = (s: { tag: string }) => Number(key(s.tag).startsWith(last));
  return [...counts.values()]
    .sort((a, b) => starts(b) - starts(a) || b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, max);
}

/** Channels whose name or #tags match every search word. */
/**
 * Channels matching every search word in their name, handle (c/…) or #tags. A bare "c/" lists
 * every channel (biggest first), so it works as a browse.
 */
export function searchChannels(channels: Channel[], query: string): Channel[] {
  const words = terms(query);
  if (!words.length) {
    return isChannelQuery(query) ? [...channels].sort((a, b) => b.memberCount - a.memberCount) : [];
  }
  return channels.filter((channel) => {
    const tags = channel.tags.map(key);
    const name = channel.name.toLowerCase();
    const handle = channel.handle.toLowerCase().replace(/^c\//, '');
    return words.every((word) => tags.some((tag) => tag.includes(word)) || name.includes(word) || handle.includes(word));
  });
}
