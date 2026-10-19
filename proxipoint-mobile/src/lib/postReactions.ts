import { REACTION_EMOJIS } from './pointRecap';
import type { PostKind } from './postKinds';

/**
 * Likes on channel posts: each person gives a post ONE emoji reaction from an approved set grouped
 * by mood (happy, so-so, sad, frustrated; see REACTION_GROUPS). Picking another swaps yours;
 * picking yours again takes it back. The
 * total is the post's like count (stored in `upvotes`, which Hot, Top, Signal Score and Best tips
 * already read). You can't react to your own post.
 *
 * Replies: the poster chooses whether a post takes replies (on by default for Questions and Chat,
 * off for Heads-ups and Tips), and a channel's moderator can allow replies on everything, on
 * Questions only, or on nothing.
 * Pure (no React), so the server can use the same rules.
 */

/** Counts by emoji (from the approved set). */
export type ReactionCounts = Record<string, number>;

export interface Reactable {
  /** Total reactions = likes. */
  upvotes: number;
  reactions?: ReactionCounts;
  /** Your reaction, if any. */
  myReaction?: string | null;
}

/**
 * The reactions people can use, grouped by mood so there's a way to say "great", "meh", "that's
 * sad" and "that's annoying". Only these are accepted (the server checks the same list).
 */
export const REACTION_GROUPS: Array<{ id: string; label: string; emojis: string[] }> = [
  { id: 'happy', label: 'Happy & celebration', emojis: ['🎉', '🥳', '😄', '😍', '🤩', '❤️', '🔥', '👏', '🙌', '😂', '👍', '💯'] },
  { id: 'meh', label: 'So-so', emojis: ['🙂', '😐', '🤔', '👀', '🤷', '😬'] },
  { id: 'sad', label: 'Sad', emojis: ['😢', '😭', '😔', '🥺', '💔', '😞'] },
  { id: 'frustrated', label: 'Frustrated', emojis: ['😤', '😠', '😩', '🙄', '😫', '🤦'] },
];

/** One from each mood (and a laugh), shown before "+". */
export const QUICK_REACTIONS: readonly string[] = ['❤️', '🎉', '😂', '😐', '😢', '😤'];

const ALLOWED = REACTION_GROUPS.flatMap((group) => group.emojis);

export function isAllowedReaction(emoji: string): boolean {
  return ALLOWED.includes(emoji);
}

/** React with `emoji`, swap to it, or (same emoji again) take your reaction back. */
export function reactTo<T extends Reactable>(target: T, emoji: string): T {
  if (!isAllowedReaction(emoji)) return target;
  const counts: ReactionCounts = { ...(target.reactions ?? {}) };
  const bump = (e: string, by: number) => {
    const next = Math.max(0, (counts[e] ?? 0) + by);
    if (next) counts[e] = next;
    else delete counts[e];
  };
  const mine = target.myReaction ?? null;
  if (mine === emoji) {
    bump(emoji, -1);
    return { ...target, reactions: counts, myReaction: null, upvotes: Math.max(0, target.upvotes - 1) };
  }
  if (mine) {
    bump(mine, -1);
    bump(emoji, 1);
    return { ...target, reactions: counts, myReaction: emoji };
  }
  bump(emoji, 1);
  return { ...target, reactions: counts, myReaction: emoji, upvotes: target.upvotes + 1 };
}

/** The most-used emojis first (ties in the approved set's order), for the "🔥❤️ 24" summary. */
export function topEmojis(reactions: ReactionCounts | undefined, limit = 3): string[] {
  const order = (emoji: string) => {
    const i = ALLOWED.indexOf(emoji);
    return i < 0 ? ALLOWED.length : i;
  };
  return Object.keys(reactions ?? {})
    .filter((emoji) => (reactions?.[emoji] ?? 0) > 0)
    .sort((a, b) => (reactions?.[b] ?? 0) - (reactions?.[a] ?? 0) || order(a) - order(b))
    .slice(0, limit);
}

/** A made-up but fixed spread of `total` reactions for sample posts. */
export function sampleReactions(seed: string, total: number): ReactionCounts {
  if (total <= 0) return {};
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const first = REACTION_EMOJIS[hash % REACTION_EMOJIS.length];
  const second = REACTION_EMOJIS[(hash >> 3) % REACTION_EMOJIS.length];
  const third = REACTION_EMOJIS[(hash >> 6) % REACTION_EMOJIS.length];
  const a = Math.ceil(total * 0.6);
  const b = Math.floor((total - a) * 0.7);
  const counts: ReactionCounts = {};
  const add = (e: string, n: number) => {
    if (n > 0) counts[e] = (counts[e] ?? 0) + n;
  };
  add(first, a);
  add(second, b);
  add(third, total - a - b);
  return counts;
}

// ---- Replies ------------------------------------------------------------------------------------

/** A channel's reply setting (moderator): replies on everything, on Questions only, or none. */
export type ChannelReplies = 'on' | 'questions' | 'off';

export const CHANNEL_REPLY_OPTIONS: Array<{ id: ChannelReplies; label: string; summary: string }> = [
  { id: 'on', label: 'On', summary: 'Posters choose whether each post takes replies.' },
  { id: 'questions', label: 'Questions only', summary: 'Only Questions can take replies.' },
  { id: 'off', label: 'Off', summary: 'Reactions only: no replies on any post.' },
];

/** Replies on by default for Questions and Chat; off for Heads-ups and Tips (reactions say enough). */
export function defaultRepliesOn(kind: PostKind | null | undefined): boolean {
  return kind == null || kind === 'chat' || kind === 'question';
}

/** Can this kind of post take replies in a channel with this setting (the poster's choice aside)? */
export function channelAllowsReplies(kind: PostKind | null | undefined, mode: ChannelReplies | null | undefined): boolean {
  if (mode === 'off') return false;
  if (mode === 'questions') return kind === 'question';
  return true;
}

/** Whether a post takes replies: the channel allows it, and the poster left replies on. */
export function repliesAllowed(
  post: { kind?: PostKind | null; repliesOn?: boolean | null },
  mode: ChannelReplies | null | undefined,
): boolean {
  if (!channelAllowsReplies(post.kind, mode)) return false;
  return post.repliesOn ?? defaultRepliesOn(post.kind);
}
