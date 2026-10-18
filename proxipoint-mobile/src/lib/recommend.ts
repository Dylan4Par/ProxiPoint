import { isBoosted } from './boost';
import { nodeTags } from './discoverFilters';
import { isLiveNode } from './liveStatus';
import { isNodeAllowed } from './moderation';

/**
 * Activity's Priority pick and Tag tracker, worked out from what's on Discover and your #tags.
 * Runs on the phone for now; the same scoring can move to the server with the activity feed.
 */

export interface RecNode {
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
  coverPhotoUri?: string | null;
  locationPrivacy?: { regionName?: string } | null;
}

const key = (tag: string) => tag.replace(/^#+/, '').trim().toLowerCase();
const show = (tag: string) => `#${tag.replace(/^#+/, '').trim()}`;

/** Points others are hosting that haven't ended and aren't hidden by a report or block. */
function candidates(nodes: Record<string, RecNode> | null | undefined, now: number): RecNode[] {
  return Object.values(nodes ?? {}).filter(
    (node) =>
      node &&
      node.origin !== 'local' &&
      isNodeAllowed(node) &&
      !(node.endsAt && new Date(node.endsAt).getTime() <= now),
  );
}

function minutesUntilStart(node: RecNode, now: number): number | null {
  if (!node.startsAt) return null;
  return Math.round((new Date(node.startsAt).getTime() - now) / 60000);
}

export interface PriorityPick {
  node: RecNode;
  /** Your #tags it matches, as you wrote them. */
  matched: string[];
  live: boolean;
  boosted: boolean;
  /** Short reasons for the "Why" line, strongest first. */
  reasons: string[];
  score: number;
}

/**
 * Best Point for you right now. Points that match more of your #tags rank higher, then:
 * boosted, live now or starting soon, and close by. Points you already RSVP'd to rank a bit lower
 * (you already know about them).
 */
export function rankForYou(
  nodes: Record<string, RecNode> | null | undefined,
  interestTags: string[],
  now = Date.now(),
): PriorityPick[] {
  if (!interestTags.length) return [];
  const followed = new Map(interestTags.map((tag) => [key(tag), show(tag)]));

  const picks: PriorityPick[] = [];
  for (const node of candidates(nodes, now)) {
    const matched = [...new Set(nodeTags(node))].map((tag) => followed.get(tag)).filter((tag): tag is string => Boolean(tag));
    if (!matched.length) continue;

    const live = isLiveNode(node);
    const boosted = isBoosted(node.id, now);
    const until = minutesUntilStart(node, now);
    const distance = typeof node.distanceMeters === 'number' ? node.distanceMeters : null;

    let score = matched.length * 25;
    if (boosted) score += 40;
    if (live) score += 30;
    else if (until != null && until <= 60) score += 24;
    else if (until != null && until <= 180) score += 14;
    else score += 4;
    if (distance != null) score += Math.max(0, 20 - distance / 100); // full points nearby, none past 2 km
    if (node.isRsvpd) score -= 15;

    const reasons = [
      matched.length > 1 ? `Matches ${matched.length} of your #tags` : `Matches ${matched[0]}`,
      boosted ? 'Boosted' : null,
      live ? 'Live now' : node.status && until != null && until <= 180 ? node.status : null,
      distance != null && distance <= 1000 ? `${distance}m away` : null,
      node.isRsvpd ? 'You’re going' : null,
    ].filter((reason): reason is string => Boolean(reason));

    picks.push({ node, matched, live, boosted, reasons, score });
  }
  return picks.sort((a, b) => b.score - a.score);
}

export type DeckMode = 'boosted' | 'popular';

/**
 * Cards for the Recommendations deck.
 * - While any Point is boosted: only boosted Points, ones matching your #tags first, then
 *   live / starting soon / close by.
 * - With no boosts running: the most popular Points (most people going, live ones first).
 */
export function deckPicks(
  nodes: Record<string, RecNode> | null | undefined,
  interestTags: string[],
  now = Date.now(),
  max = 6,
): { mode: DeckMode; picks: PriorityPick[] } {
  const followed = new Map(interestTags.map((tag) => [key(tag), show(tag)]));
  const list = candidates(nodes, now);

  const describe = (node: RecNode, mode: DeckMode): PriorityPick => {
    const matched = [...new Set(nodeTags(node))]
      .map((tag) => followed.get(tag))
      .filter((tag): tag is string => Boolean(tag));
    const live = isLiveNode(node);
    const boosted = isBoosted(node.id, now);
    const until = minutesUntilStart(node, now);
    const distance = typeof node.distanceMeters === 'number' ? node.distanceMeters : null;
    const going = typeof node.attendeeCount === 'number' ? node.attendeeCount : 0;

    let score = matched.length * 25;
    if (live) score += 30;
    else if (until != null && until <= 60) score += 24;
    else if (until != null && until <= 180) score += 14;
    if (distance != null) score += Math.max(0, 20 - distance / 100);
    if (mode === 'popular') score = going * 3 + (live ? 40 : 0) + score / 4;

    const reasons = [
      matched.length > 1 ? `Matches ${matched.length} of your #tags` : matched[0] ? `Matches ${matched[0]}` : null,
      mode === 'popular' && going ? `${going} going` : null,
      live ? 'Live now' : node.status && until != null && until <= 180 ? node.status : null,
      distance != null && distance <= 1000 ? `${distance}m away` : null,
      node.isRsvpd ? 'You’re going' : null,
    ].filter((reason): reason is string => Boolean(reason));

    return { node, matched, live, boosted, reasons, score };
  };

  const boosted = list.filter((node) => isBoosted(node.id, now));
  if (boosted.length) {
    return {
      mode: 'boosted',
      picks: boosted.map((node) => describe(node, 'boosted')).sort((a, b) => b.score - a.score).slice(0, max),
    };
  }
  return {
    mode: 'popular',
    picks: list.map((node) => describe(node, 'popular')).sort((a, b) => b.score - a.score).slice(0, max),
  };
}

export interface TagStats {
  tag: string;
  live: number;
  /** Starts within the next 3 hours. */
  soon: number;
  later: number;
  boosted: number;
  total: number;
}

/** For each followed #tag: how many Points use it right now, split by live / soon / later. */
export function tagTracker(
  nodes: Record<string, RecNode> | null | undefined,
  interestTags: string[],
  now = Date.now(),
): TagStats[] {
  const list = candidates(nodes, now);
  return interestTags.map((raw) => {
    const tag = show(raw);
    const stats: TagStats = { tag, live: 0, soon: 0, later: 0, boosted: 0, total: 0 };
    for (const node of list) {
      if (!nodeTags(node).includes(key(tag))) continue;
      stats.total += 1;
      if (isBoosted(node.id, now)) stats.boosted += 1;
      if (isLiveNode(node)) stats.live += 1;
      else {
        const until = minutesUntilStart(node, now);
        if (until != null && until <= 180) stats.soon += 1;
        else stats.later += 1;
      }
    }
    return stats;
  });
}
