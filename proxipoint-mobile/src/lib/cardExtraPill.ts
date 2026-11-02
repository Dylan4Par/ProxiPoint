/**
 * The third pill on Discover's event cards, after the time and the distance: the first that
 * applies of
 *   1. the price ("From $30", "Free"),
 *   2. "New Host": posted by a person (not a gathered event) with no other Points listed yet,
 *   3. "Popular": lots of interest. There's no count of taps on a Point yet, so this uses how
 *      many are going for now (POPULAR_GOING or more).
 * The card shows it only when it fits beside the others without crowding RSVP.
 */
export const POPULAR_GOING = 25;

export type ExtraPillKind = 'price' | 'newHost' | 'popular';

export interface ExtraPillNode {
  host?: string;
  source?: string;
  attendeeCount?: number;
  facts?: { priceLabel?: string | null } | null;
}

const hostKey = (host: string) => host.replace(/^@+/, '').trim().toLowerCase();

/** How many Points each host has listed (by @handle, any case). */
export function countByHost(nodes: Iterable<{ host?: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (!node?.host) continue;
    const key = hostKey(node.host);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function extraPill(
  node: ExtraPillNode,
  hostCounts: Map<string, number>,
): { kind: ExtraPillKind; label: string } | null {
  const price = node.facts?.priceLabel?.trim();
  if (price) return { kind: 'price', label: price };
  if (node.host && node.source !== 'external' && (hostCounts.get(hostKey(node.host)) ?? 0) <= 1) {
    return { kind: 'newHost', label: 'New Host' };
  }
  if ((node.attendeeCount ?? 0) >= POPULAR_GOING) return { kind: 'popular', label: 'Popular' };
  return null;
}
