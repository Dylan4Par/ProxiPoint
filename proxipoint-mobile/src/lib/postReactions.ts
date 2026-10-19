import { REACTION_EMOJIS, type ReactionEmoji } from './pointRecap';
import type { PostKind } from './postKinds';

/**
 * Likes on channel posts: each person gives a post ONE emoji reaction: one of the six quick picks
 * recaps use (🎉 🔥 ❤️ 👏 😂 🙌), or any other emoji from the phone's emoji keyboard (a short
 * blocklist aside). Picking another swaps yours; picking yours again takes it back. The
 * total is the post's like count (stored in `upvotes`, which Hot, Top, Signal Score and Best tips
 * already read). You can't react to your own post.
 *
 * Replies: the poster chooses whether a post takes replies (on by default for Questions and Chat,
 * off for Heads-ups and Tips), and a channel's moderator can allow replies on everything, on
 * Questions only, or on nothing.
 * Pure (no React), so the server can use the same rules.
 */

/** Counts by emoji (any emoji, not just the quick picks). */
export type ReactionCounts = Record<string, number>;

export interface Reactable {
  /** Total reactions = likes. */
  upvotes: number;
  reactions?: ReactionCounts;
  /** Your reaction, if any. */
  myReaction?: string | null;
}

/** Quick picks shown first; the keyboard adds anything else. */
export const QUICK_REACTIONS: readonly ReactionEmoji[] = REACTION_EMOJIS;

/** Never accepted as reactions (the server checks the same list). */
export const BLOCKED_REACTIONS = ['🖕', '🍆', '🍑', '💦', '🔞', '💩', '🤮', '☠️', '💀', '🔪', '🔫', '💣', '🩸'];

/**
 * What someone typed on the emoji keyboard, as one reaction: the last emoji in it (with its
 * skin tone, flag pair or ZWJ sequence), or null when it's text, blocked, or empty.
 */
export function emojiFromInput(text: string): string | null {
  const trimmed = text.replace(/\s+/g, '');
  if (!trimmed || /[A-Za-z0-9#*]/.test(trimmed.replace(/[#*0-9]\uFE0F?\u20E3/g, ''))) return null;
  // Split into emoji: a new one starts at each code point that isn't a joiner, variation
  // selector, skin tone or keycap mark, and doesn't follow a zero-width joiner.
  const points = Array.from(trimmed);
  const clusters: string[] = [];
  points.forEach((point, i) => {
    const code = point.codePointAt(0) ?? 0;
    const joins =
      code === 0x200d ||
      code === 0xfe0f ||
      code === 0x20e3 ||
      (code >= 0x1f3fb && code <= 0x1f3ff) ||
      (code >= 0xe0020 && code <= 0xe007f) ||
      (i > 0 && points[i - 1] === '\u200d');
    const isRegional = code >= 0x1f1e6 && code <= 0x1f1ff;
    const last = clusters.length ? clusters[clusters.length - 1] : '';
    const lastPoints = Array.from(last);
    const lastCode = lastPoints.length === 1 ? lastPoints[0].codePointAt(0) ?? 0 : 0;
    // Flags are two regional letters: the second joins the first.
    const pairsFlag = isRegional && lastCode >= 0x1f1e6 && lastCode <= 0x1f1ff;
    if ((joins || pairsFlag) && clusters.length) clusters[clusters.length - 1] = last + point;
    else clusters.push(point);
  });
  const emoji = clusters.length ? clusters[clusters.length - 1] : '';
  const first = emoji.codePointAt(0) ?? 0;
  // Emoji live above U+2190 (arrows, symbols, pictographs); plain punctuation doesn't count.
  if (!emoji || first < 0x2190 || emoji.length > 32) return null;
  const bare = emoji.replace(/\uFE0F|\uD83C[\uDFFB-\uDFFF]/g, '');
  if (BLOCKED_REACTIONS.some((blocked) => blocked.replace(/\uFE0F/g, '') === bare)) return null;
  return emoji;
}

/** React with `emoji`, swap to it, or (same emoji again) take your reaction back. */
export function reactTo<T extends Reactable>(target: T, emoji: string): T {
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

/** The most-used emojis first (ties: quick picks in their order, then the rest), for "🔥❤️ 24". */
export function topEmojis(reactions: ReactionCounts | undefined, limit = 3): string[] {
  const order = (emoji: string) => {
    const i = (REACTION_EMOJIS as readonly string[]).indexOf(emoji);
    return i < 0 ? REACTION_EMOJIS.length : i;
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
  const add = (e: ReactionEmoji, n: number) => {
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
