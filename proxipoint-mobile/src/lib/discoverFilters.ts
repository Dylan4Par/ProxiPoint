import { useEffect, useState } from 'react';
import { isLiveNode } from './liveStatus';
import { isNodeAllowed } from './moderation';
import { canSeePoint, getChannels } from './channels';
import { getTimeWindow, inTimeWindow } from './timeWindow';
import { METRO_RADIUS_METERS, inMetroArea } from './mapArea';

/**
 * The Discover filters in one place, so the map pins and the card list always agree:
 * the hashtag chip, the Live Now chip, and the Nearby / RSVP'd switch.
 */
export interface DiscoverFilters {
  /** 'All' (or empty) = any hashtag. */
  selectedTag?: string | null;
  liveOnly?: boolean;
  /** 'RSVPd' = only Points you've RSVP'd to. */
  activeTab?: string | null;
  /** Show only → My channels: Points listed in, or tagged like, a channel you've joined. */
  myChannelsOnly?: boolean;
  /** The city / metro being explored: Points farther than METRO_RADIUS_METERS are left out. */
  area?: { latitude: number; longitude: number } | null;
  /** Filter & sort → Distance: only Points this close to the area's middle (null = any). */
  rangeMeters?: number | null;
}

/** In one of your channels: listed there, or sharing a #tag with a channel you've joined. */
export function inMyChannels(node: unknown, channels = getChannels()): boolean {
  const joined = channels.filter((channel) => channel.joined);
  if (!joined.length) return false;
  const channelId = (node as { channelId?: unknown } | null)?.channelId;
  if (typeof channelId === 'string' && joined.some((channel) => channel.id === channelId)) return true;
  const tags = new Set(joined.flatMap((channel) => channel.tags.map(normalizeTag)));
  return nodeTags(node).some((tag) => tags.has(tag));
}

// ---- "My channels" switch (Filter & sort → Show only), shared by the map and the cards ----------

let myChannelsOnly = false;
const listeners = new Set<() => void>();

export function getMyChannelsOnly(): boolean {
  return myChannelsOnly;
}

export function setMyChannelsOnly(on: boolean): void {
  if (on === myChannelsOnly) return;
  myChannelsOnly = on;
  listeners.forEach((listener) => listener());
}

export function useMyChannelsOnly(): boolean {
  const [on, setOn] = useState(myChannelsOnly);
  useEffect(() => {
    const listener = () => setOn(myChannelsOnly);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return on;
}

function normalizeTag(tag: string): string {
  return tag.replace(/^#+/, '').trim().toLowerCase();
}

/** Every hashtag on a node (its main `tag` plus any `tags`), normalized. */
export function nodeTags(node: unknown): string[] {
  const n = (node ?? {}) as Record<string, unknown>;
  const raw: string[] = [];
  if (typeof n.tag === 'string') raw.push(...n.tag.split(/[\s,]+/));
  if (Array.isArray(n.tags)) n.tags.forEach((t) => typeof t === 'string' && raw.push(t));
  else if (typeof n.tags === 'string') raw.push(...n.tags.split(/[\s,]+/));
  return raw.map(normalizeTag).filter(Boolean);
}

export function matchesDiscoverFilters(node: unknown, filters: DiscoverFilters): boolean {
  // Points you reported, and Points from people you blocked, never show.
  if (!isNodeAllowed(node)) return false;
  // Channel-only Points show to that channel's members.
  if (!canSeePoint(node)) return false;
  const tag = filters.selectedTag ? normalizeTag(filters.selectedTag) : '';
  if (tag && tag !== 'all' && !nodeTags(node).includes(tag)) return false;
  if (filters.liveOnly && !isLiveNode(node)) return false;
  if (filters.myChannelsOnly && !inMyChannels(node)) return false;
  if (
    filters.area &&
    !inMetroArea(
      node as { latitude?: number; longitude?: number },
      filters.area,
      Math.min(METRO_RADIUS_METERS, filters.rangeMeters ?? METRO_RADIUS_METERS),
    )
  ) {
    return false;
  }
  if (filters.activeTab === 'RSVPd' && (node as { isRsvpd?: unknown } | null)?.isRsvpd !== true) return false;
  // Only the next 3 days (or the dates picked in the Calendar).
  if (!inTimeWindow(node, getTimeWindow())) return false;
  return true;
}

// ---- Distance (Filter & sort → Distance), shared by the map and the cards -----------------------

let mapRange: number | null = null;
const rangeListeners = new Set<() => void>();

export function getMapRange(): number | null {
  return mapRange;
}

export function setMapRange(meters: number | null): void {
  if (meters === mapRange) return;
  mapRange = meters;
  rangeListeners.forEach((listener) => listener());
}

export function useMapRange(): number | null {
  const [range, setRange] = useState(mapRange);
  useEffect(() => {
    const listener = () => setRange(mapRange);
    rangeListeners.add(listener);
    listener();
    return () => {
      rangeListeners.delete(listener);
    };
  }, []);
  return range;
}
