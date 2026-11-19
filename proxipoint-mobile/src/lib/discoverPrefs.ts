import { useEffect, useState } from 'react';

/**
 * Discover → Filter: tag preference, price, time of day, age & access. Discover's own (Explore Map
 * has its own filters), kept for the session.
 */

export type PriceFilter = 'any' | 'free' | 'under20';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export interface DiscoverPrefs {
  /** Only Points with one of your followed #tags. */
  followedOnly: boolean;
  price: PriceFilter;
  /** Any of these parts of the day; none picked = any time. */
  times: TimeOfDay[];
  /** 21+ only. */
  over21: boolean;
  /** All ages / family friendly. With 21+ also on, either one matches. */
  allAges: boolean;
}

export const DEFAULT_PREFS: DiscoverPrefs = { followedOnly: false, price: 'any', times: [], over21: false, allAges: false };

export const PRICE_CHOICES: Array<{ id: PriceFilter; label: string }> = [
  { id: 'any', label: 'Any price' },
  { id: 'free', label: 'Free only' },
  { id: 'under20', label: 'Under $20' },
];

/** Hours (local, 24 h) each part of the day covers. Evening / Night runs past midnight. */
export const TIMES_OF_DAY: Array<{ id: TimeOfDay; label: string; from: number; to: number }> = [
  { id: 'morning', label: 'Morning', from: 5, to: 12 },
  { id: 'afternoon', label: 'Afternoon', from: 12, to: 17 },
  { id: 'evening', label: 'Evening / Night', from: 17, to: 29 }, // 5 PM to 5 AM
];

/** How many filters are on (for the Filter button's badge). */
export function activePrefsCount(p: DiscoverPrefs): number {
  return (p.followedOnly ? 1 : 0) + (p.price !== 'any' ? 1 : 0) + (p.times.length ? 1 : 0) + (p.over21 || p.allAges ? 1 : 0);
}

export const isDefaultPrefs = (p: DiscoverPrefs) => activePrefsCount(p) === 0;

/** What a Point needs for these filters (the store's DiscoveryNode has all of it). */
export interface PrefsNode {
  tags?: string[];
  startsAt?: string;
  endsAt?: string;
  facts?: { priceMin?: number | null; free?: boolean; minAge?: number | null; allAges?: boolean } | null;
}

const keyOf = (tag: string) => tag.replace(/^#+/, '').trim().toLowerCase();
const HOUR = 3600 * 1000;
const FAMILY_TAGS = new Set(['familyfriendly', 'kidfriendly', 'allages']);

/** Does the Point's time overlap one of these parts of the day (on any day it runs, up to 3)? */
export function overlapsTimesOfDay(startsAt: string | undefined, endsAt: string | undefined, times: TimeOfDay[]): boolean {
  if (!times.length) return true;
  if (typeof startsAt !== 'string') return true;
  const start = new Date(startsAt).getTime();
  if (!Number.isFinite(start)) return true;
  let end = typeof endsAt === 'string' ? new Date(endsAt).getTime() : start + HOUR;
  if (!Number.isFinite(end) || end <= start) end = start + HOUR;
  end = Math.min(end, start + 3 * 24 * HOUR);
  const picked = TIMES_OF_DAY.filter((t) => times.includes(t.id));
  // Walk the days the Point covers (from the day before, for evenings running past midnight).
  const day = new Date(start);
  day.setHours(0, 0, 0, 0);
  for (let d = new Date(day.getTime() - 24 * HOUR); d.getTime() <= end; d = new Date(d.getTime() + 24 * HOUR)) {
    for (const t of picked) {
      const from = new Date(d);
      from.setHours(t.from, 0, 0, 0);
      const to = new Date(d);
      to.setHours(t.to, 0, 0, 0); // 29 rolls over to 5 AM the next day
      if (start < to.getTime() && end > from.getTime()) return true;
    }
  }
  return false;
}

/**
 * Whether a Point passes the filters. Price and age only match Points that say so: a Point with no
 * price listed isn't counted as free, and one with no age rule isn't counted as 21+.
 */
export function prefsAllow(node: PrefsNode, p: DiscoverPrefs, followedTags: string[]): boolean {
  const tags = (node.tags ?? []).map(keyOf);
  if (p.followedOnly) {
    const followed = new Set(followedTags.map(keyOf));
    if (!tags.some((t) => followed.has(t))) return false;
  }
  const f = node.facts ?? null;
  if (p.price === 'free' && !(f?.free === true || f?.priceMin === 0)) return false;
  if (p.price === 'under20') {
    const free = f?.free === true || f?.priceMin === 0;
    if (!free && !(typeof f?.priceMin === 'number' && f.priceMin < 20)) return false;
  }
  if (!overlapsTimesOfDay(node.startsAt, node.endsAt, p.times)) return false;
  if (p.over21 || p.allAges) {
    const is21 = typeof f?.minAge === 'number' && f.minAge >= 21;
    const family = f?.allAges === true || tags.some((t) => FAMILY_TAGS.has(t));
    if (!((p.over21 && is21) || (p.allAges && family))) return false;
  }
  return true;
}

// ---- State ----------------------------------------------------------------------------------

let prefs: DiscoverPrefs = DEFAULT_PREFS;
const listeners = new Set<() => void>();

export const getDiscoverPrefs = (): DiscoverPrefs => prefs;

export function setDiscoverPrefs(next: Partial<DiscoverPrefs>): void {
  prefs = { ...prefs, ...next };
  listeners.forEach((listener) => listener());
}

export function clearDiscoverPrefs(): void {
  prefs = DEFAULT_PREFS;
  listeners.forEach((listener) => listener());
}

export function useDiscoverPrefs(): DiscoverPrefs {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return prefs;
}
