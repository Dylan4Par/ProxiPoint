import { calculateDistanceMeters } from './locationFilter';
import type { ChannelPost } from './channels';

/**
 * What a post is, which decides how long it stays on the map:
 * - Heads-up: closures, crowds, weather. Short pins, and people can confirm it's still happening.
 * - Question: stays up long enough to get answers.
 * - Tip: recommendations and conditions. On the map a day or three; on its place for good.
 * - Chat: everything else.
 * The post itself never expires: it stays in its channel, on its place, and in search.
 * Pure (no React), so the server can use the same defaults.
 */

export type PostKind = 'chat' | 'heads_up' | 'question' | 'tip';

export interface PostKindInfo {
  id: PostKind;
  label: string;
  /** Composer placeholder. */
  prompt: string;
  /** Map pin lengths offered, in hours. The first one is the default. */
  pinHours: number[];
}

export const POST_KINDS: PostKindInfo[] = [
  { id: 'chat', label: 'Chat', prompt: 'Say something to', pinHours: [6, 2, 24] },
  { id: 'heads_up', label: 'Heads-up', prompt: 'Closure, crowd, weather? Tell', pinHours: [2, 1, 6] },
  { id: 'question', label: 'Question', prompt: 'Ask', pinHours: [24, 6, 72] },
  { id: 'tip', label: 'Tip', prompt: 'Share a tip with', pinHours: [24, 72] },
];

export function kindInfo(kind: PostKind | null | undefined): PostKindInfo {
  return POST_KINDS.find((info) => info.id === kind) ?? POST_KINDS[0];
}

/** Pin options sorted short to long, for the chips. */
export function pinChoices(kind: PostKind | null | undefined): number[] {
  return [...kindInfo(kind).pinHours].sort((a, b) => a - b);
}

export function defaultPinHours(kind: PostKind | null | undefined): number {
  return kindInfo(kind).pinHours[0];
}

// ---- "Still happening?" ------------------------------------------------------------------------

/** Each "yes, still happening" keeps a heads-up on the map at least this much longer. */
export const CONFIRM_EXTENDS_HOURS = 1;
/** A heads-up never stays on the map longer than this after it was posted. */
export const HEADS_UP_MAX_HOURS = 12;

/** Whether to ask "Still happening?" on this post (a heads-up that's still on the map). */
export function asksStillHappening(post: Pick<ChannelPost, 'kind' | 'pinnedUntil' | 'place'>, now = Date.now()): boolean {
  return post.kind === 'heads_up' && Boolean(post.place && post.pinnedUntil && new Date(post.pinnedUntil).getTime() > now);
}

/**
 * Someone says it's still happening: the pin stays up at least another hour (never past
 * HEADS_UP_MAX_HOURS after posting). Someone says it's over: the pin comes down now.
 * The post itself stays either way.
 */
export function answerStillHappening<T extends Pick<ChannelPost, 'createdAt' | 'pinnedUntil' | 'confirmations' | 'endedReports'>>(
  post: T,
  stillHappening: boolean,
  now = Date.now(),
): T {
  if (!stillHappening) {
    return { ...post, pinnedUntil: new Date(now).toISOString(), endedReports: (post.endedReports ?? 0) + 1 };
  }
  const cap = new Date(post.createdAt).getTime() + HEADS_UP_MAX_HOURS * 3600000;
  const current = post.pinnedUntil ? new Date(post.pinnedUntil).getTime() : now;
  const until = Math.min(cap, Math.max(current, now + CONFIRM_EXTENDS_HOURS * 3600000));
  return { ...post, pinnedUntil: new Date(until).toISOString(), confirmations: (post.confirmations ?? 0) + 1 };
}

// ---- Search ------------------------------------------------------------------------------------

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Posts matching every word of a search, in their text, their place or their kind ("tip",
 * "question", "heads up"). Tips and questions first (they're what people search for), then
 * upvotes, then newest. With a center and range, posts placed farther away are left out
 * (posts without a place are kept).
 */
export function searchPosts<T extends Pick<ChannelPost, 'body' | 'kind' | 'place' | 'upvotes' | 'createdAt'>>(
  posts: T[],
  query: string,
  options: { center?: { latitude: number; longitude: number } | null; rangeMeters?: number | null; limit?: number } = {},
): T[] {
  const raw = query.trim();
  if (/^c\//i.test(raw)) return []; // channel search
  const words = norm(raw).split(' ').filter((word) => word.length >= 2);
  if (!words.length) return [];
  const { center, rangeMeters } = options;
  const lasting = (post: T) => (post.kind === 'tip' || post.kind === 'question' ? 1 : 0);
  return posts
    .filter((post) => {
      const text = norm(`${post.body} ${post.place?.label ?? ''} ${kindInfo(post.kind).label}`);
      if (!words.every((word) => text.includes(word))) return false;
      if (center && rangeMeters && post.place) {
        const meters = calculateDistanceMeters(center.latitude, center.longitude, post.place.latitude, post.place.longitude);
        if (meters > rangeMeters) return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        lasting(b) - lasting(a) ||
        b.upvotes - a.upvotes ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, options.limit ?? 20);
}
