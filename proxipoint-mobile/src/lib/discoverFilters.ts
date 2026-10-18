import { isLiveNode } from './liveStatus';
import { isNodeAllowed } from './moderation';
import { getTimeWindow, inTimeWindow } from './timeWindow';

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
  const tag = filters.selectedTag ? normalizeTag(filters.selectedTag) : '';
  if (tag && tag !== 'all' && !nodeTags(node).includes(tag)) return false;
  if (filters.liveOnly && !isLiveNode(node)) return false;
  if (filters.activeTab === 'RSVPd' && (node as { isRsvpd?: unknown } | null)?.isRsvpd !== true) return false;
  // Only the next 3 days (or the dates picked in the Calendar).
  if (!inTimeWindow(node, getTimeWindow())) return false;
  return true;
}
