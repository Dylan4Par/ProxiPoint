/**
 * Discover's #tag filters (Filter & sort on Discover): up to MAX_ACTIVE_TAGS tags, matched
 * "Any" (at least one, the default) or "All" (every one). With "Any", Points matching more of
 * the tags rank higher. Separate from Explore Map's #tag chips, so Discover starts unfiltered.
 */
import { useEffect, useState } from 'react';
import { canonicalTag } from './hashtags';
import { matchesDiscoverFilters, nodeTags, type DiscoverFilters } from './discoverFilters';
import { inRange, type FeedNode } from './discoverFeed';

export const MAX_DISCOVER_TAGS = 5;
export type TagMatchMode = 'any' | 'all';

const keyOf = (tag: string) => tag.replace(/^#+/, '').trim().toLowerCase();

// ---- Pure matching --------------------------------------------------------------------------

/** How many of the tags the Point has. */
export function tagMatchCount(node: unknown, tags: string[]): number {
  if (!tags.length) return 0;
  const has = new Set(nodeTags(node));
  return tags.filter((tag) => has.has(keyOf(tag))).length;
}

/** No tags: everything. Any: at least one. All: every one. */
export function matchesTagFilter(node: unknown, tags: string[], mode: TagMatchMode): boolean {
  if (!tags.length) return true;
  const n = tagMatchCount(node, tags);
  return mode === 'all' ? n === tags.length : n > 0;
}

/** Points matching more of the tags first (stable otherwise). Only matters for "Any". */
export function rankByTagMatches<T>(list: T[], tags: string[], mode: TagMatchMode): T[] {
  if (mode !== 'any' || tags.length < 2) return list;
  return list
    .map((node, i) => ({ node, i, n: tagMatchCount(node, tags) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.node);
}

export interface DiscoverFeedFilter extends DiscoverFilters {
  center: { latitude: number; longitude: number };
  tags: string[];
  mode: TagMatchMode;
}

/** The Discover feed's whole filter (distance, Live now, #tag filters, …) as one test. */
export function discoverFeedAllows(f: DiscoverFeedFilter): (node: FeedNode) => boolean {
  return (node) =>
    inRange(f.center, node, f.rangeMeters ?? null) &&
    matchesDiscoverFilters(node, { ...f, area: f.center }) &&
    matchesTagFilter(node, f.tags, f.mode);
}

/** "Show 18 Events", "Show 1 Event", or "No Events Found". */
export function showEventsLabel(count: number): string {
  if (count <= 0) return 'No Events Found';
  return `Show ${count} Event${count === 1 ? '' : 's'}`;
}

// ---- State ----------------------------------------------------------------------------------

let tags: string[] = [];
let mode: TagMatchMode = 'any';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const getDiscoverTags = (): string[] => tags;
export const getTagMatchMode = (): TagMatchMode => mode;

/** Adds a tag from the allowed list. false when it isn't one or the shelf is full. */
export function addDiscoverTag(tag: string): boolean {
  const clean = canonicalTag(tag);
  if (!clean) return false;
  if (tags.some((t) => keyOf(t) === keyOf(clean))) return true;
  if (tags.length >= MAX_DISCOVER_TAGS) return false;
  tags = [...tags, clean];
  emit();
  return true;
}

export function removeDiscoverTag(tag: string): void {
  const next = tags.filter((t) => keyOf(t) !== keyOf(tag));
  if (next.length === tags.length) return;
  tags = next;
  emit();
}

export function clearDiscoverTags(): void {
  if (!tags.length && mode === 'any') return;
  tags = [];
  mode = 'any';
  emit();
}

export function setTagMatchMode(next: TagMatchMode): void {
  if (next === mode) return;
  mode = next;
  emit();
}

export function useDiscoverTagFilter(): { tags: string[]; mode: TagMatchMode } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { tags, mode };
}
