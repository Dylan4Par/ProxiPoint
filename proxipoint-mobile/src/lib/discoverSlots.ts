/**
 * Where businesses show up on Discover, under one rule: businesses pay to be seen, never to be
 * ranked. Pure (no React), so the server can use the same rules.
 *
 * - Boosted Points move into fixed, labeled slots (2nd and 6th) of a list; everything else keeps
 *   its own order around them. At most 1 in 5 items is a slotted Boost, so a short list gets none.
 * - A Boost only ever reaches lists it already qualifies for (your area, range and time window);
 *   among Boosts, ones matching your #tags go first.
 * - A Boost you hid ("Hide this") goes back to its normal place in the list, still labeled.
 * - "Today / Tonight at local spots": one card per business venue with something on, Boosted
 *   ones first (labeled), then live, then soonest.
 */

/** 0-based positions Boosts move into: the 2nd and 6th items. */
export const BOOST_SLOTS = [1, 5];
/** At most this share of a list is slotted Boosts. */
export const MAX_BOOSTED_SHARE = 1 / 5;

export interface SlotItem {
  id: string;
  tag?: string;
  tags?: string[];
}

export interface Placed<T> {
  item: T;
  /** Boosted (always labeled, wherever it sits). */
  boosted: boolean;
  /** Moved into a sponsored slot. */
  slotted: boolean;
}

const key = (tag: string) => tag.replace(/^#+/, '').trim().toLowerCase();
const tagsOf = (item: SlotItem) => [item.tag, ...(item.tags ?? [])].filter((t): t is string => Boolean(t)).map(key);

/** Whether a Boosted Point matches any of your #tags (it goes first among Boosts). */
export function matchesInterests(item: SlotItem, interestTags: string[]): boolean {
  const wanted = new Set(interestTags.map(key));
  return tagsOf(item).some((tag) => wanted.has(tag));
}

export function placeBoosts<T extends SlotItem>(
  items: T[],
  isBoosted: (item: T) => boolean,
  options: { interestTags?: string[]; hidden?: Set<string>; slots?: number[] } = {},
): Array<Placed<T>> {
  const slots = options.slots ?? BOOST_SLOTS;
  const hidden = options.hidden ?? new Set<string>();
  const interestTags = options.interestTags ?? [];
  const maxSlotted = Math.min(slots.length, Math.floor(items.length * MAX_BOOSTED_SHARE));

  const candidates = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isBoosted(item) && !hidden.has(item.id))
    .sort(
      (a, b) =>
        Number(matchesInterests(b.item, interestTags)) - Number(matchesInterests(a.item, interestTags)) || a.index - b.index,
    )
    .slice(0, maxSlotted);
  const slottedIds = new Set(candidates.map(({ item }) => item.id));

  const placed: Array<Placed<T>> = items
    .filter((item) => !slottedIds.has(item.id))
    .map((item) => ({ item, boosted: isBoosted(item), slotted: false }));
  candidates.forEach(({ item }, n) => {
    const at = Math.min(slots[n] ?? placed.length, placed.length);
    placed.splice(at, 0, { item, boosted: true, slotted: true });
  });
  return placed;
}

// ---- Local spots ------------------------------------------------------------------------------

export interface SpotNode extends SlotItem {
  title?: string;
  venue?: string;
  host?: string;
  startsAt?: string;
  endsAt?: string;
  origin?: string;
  /** Set when the host hid the exact spot: never listed as a venue. */
  locationPrivacy?: unknown;
}

/** Until when "local spots" looks: the end of today, or 2 am once it's evening. */
export function spotsWindowEnd(now = Date.now()): number {
  const d = new Date(now);
  if (d.getHours() >= 17 || d.getHours() < 2) {
    const end = new Date(now);
    if (d.getHours() >= 17) end.setDate(end.getDate() + 1);
    end.setHours(2, 0, 0, 0);
    return end.getTime();
  }
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

/** "Tonight at local spots" from 5 pm (until 2 am), otherwise "Today at local spots". */
export function spotsLabel(now = Date.now()): string {
  const hour = new Date(now).getHours();
  return hour >= 17 || hour < 2 ? 'TONIGHT AT LOCAL SPOTS' : 'TODAY AT LOCAL SPOTS';
}

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * One card per business venue with a Point on between now and the window's end: the venue's
 * next (or live) Point. Boosted first (unless you hid that Boost), then live, then soonest.
 */
export function localSpots<T extends SpotNode>(
  nodes: T[],
  options: {
    now?: number;
    isBusiness: (host: string) => boolean;
    isBoosted?: (node: T) => boolean;
    hidden?: Set<string>;
    limit?: number;
    /** A chosen time window (Discover's When); default: now until the end of today / 2 am. */
    window?: { start: number; end: number } | null;
  },
): Array<{ node: T; boosted: boolean; live: boolean }> {
  const now = options.now ?? Date.now();
  const end = options.window ? options.window.end : spotsWindowEnd(now);
  const from = options.window ? Math.max(now, options.window.start) : now;
  const boosted = (node: T) => Boolean(options.isBoosted?.(node)) && !(options.hidden?.has(node.id) ?? false);
  const byVenue = new Map<string, { node: T; boosted: boolean; live: boolean; start: number }>();
  for (const node of nodes) {
    if (!node.venue || node.locationPrivacy || !node.host || node.origin === 'local') continue;
    if (!options.isBusiness(node.host) || !node.startsAt) continue;
    const start = new Date(node.startsAt).getTime();
    const finish = node.endsAt ? new Date(node.endsAt).getTime() : start + 3600000;
    if (!(start <= end && finish > from)) continue;
    const entry = { node, boosted: boosted(node), live: start <= now, start };
    const venue = norm(node.venue);
    const current = byVenue.get(venue);
    const better =
      !current ||
      Number(entry.boosted) - Number(current.boosted) > 0 ||
      (entry.boosted === current.boosted &&
        (Number(entry.live) - Number(current.live) > 0 || (entry.live === current.live && entry.start < current.start)));
    if (better) byVenue.set(venue, entry);
  }
  return [...byVenue.values()]
    .sort((a, b) => Number(b.boosted) - Number(a.boosted) || Number(b.live) - Number(a.live) || a.start - b.start)
    .slice(0, options.limit ?? 8)
    .map(({ node, boosted: isB, live }) => ({ node, boosted: isB, live }));
}
