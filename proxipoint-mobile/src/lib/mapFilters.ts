import { useEffect, useState } from 'react';
import type { ChannelPost } from './channels';
import type { PostKind } from './postKinds';

/**
 * Which channel-post bubbles Explore Map shows, besides "channels you follow": by kind (only
 * heads-ups, say) and by age (posted in the last hour). Points use the When filter
 * (timeWindow.ts); these are just for posts. In memory, like the time window.
 */

export interface MapPostFilter {
  /** Kinds to show. Empty = none (posts hidden). */
  kinds: PostKind[];
  /** Only posts newer than this many hours. Null = any age (still only while pinned). */
  maxAgeHours: number | null;
}

export const ALL_POST_KINDS: PostKind[] = ['heads_up', 'question', 'tip', 'chat'];
export const DEFAULT_POST_FILTER: MapPostFilter = { kinds: ALL_POST_KINDS, maxAgeHours: null };
export const POST_AGE_CHOICES: Array<{ hours: number | null; label: string }> = [
  { hours: 1, label: '1 hour' },
  { hours: 6, label: '6 hours' },
  { hours: 24, label: 'Today' },
  { hours: null, label: 'Any time' },
];

export function isDefaultPostFilter(filter: MapPostFilter): boolean {
  return filter.maxAgeHours == null && ALL_POST_KINDS.every((kind) => filter.kinds.includes(kind));
}

/** How many post filters are on (for the badge on the When pill). */
export function activePostFilterCount(filter: MapPostFilter): number {
  return (filter.maxAgeHours != null ? 1 : 0) + (ALL_POST_KINDS.every((kind) => filter.kinds.includes(kind)) ? 0 : 1);
}

export function postMatchesMapFilter(
  post: Pick<ChannelPost, 'kind' | 'createdAt'>,
  filter: MapPostFilter,
  now = Date.now(),
): boolean {
  if (!filter.kinds.includes(post.kind ?? 'chat')) return false;
  if (filter.maxAgeHours != null && now - new Date(post.createdAt).getTime() > filter.maxAgeHours * 3600000) return false;
  return true;
}

/** Turn one kind on or off. */
export function toggleKind(filter: MapPostFilter, kind: PostKind): MapPostFilter {
  const kinds = filter.kinds.includes(kind) ? filter.kinds.filter((k) => k !== kind) : [...filter.kinds, kind];
  return { ...filter, kinds: ALL_POST_KINDS.filter((k) => kinds.includes(k)) };
}

let current: MapPostFilter = DEFAULT_POST_FILTER;
const listeners = new Set<() => void>();

export function getMapPostFilter(): MapPostFilter {
  return current;
}

export function setMapPostFilter(next: MapPostFilter) {
  current = next;
  listeners.forEach((listener) => listener());
}

export function useMapPostFilter(): MapPostFilter {
  const [value, setValue] = useState(current);
  useEffect(() => {
    const listener = () => setValue(current);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}
