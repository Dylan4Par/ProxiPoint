/**
 * Channels → My Channels → Find channels, split in two:
 * - For you: channels that share #tags with what you follow and with the channels you're in.
 * - Trending: everything else, busiest first (posts and likes this week, then size).
 * Each comes with a short reason line for the row. On-device for now; the server should rank
 * these later (it sees activity from everyone, not just the posts loaded on this phone).
 */

export interface SuggestChannel {
  id: string;
  handle: string;
  tags: string[];
  memberCount: number;
  joined: boolean;
}

export interface SuggestPost {
  channelId: string;
  createdAt: string;
  upvotes: number;
}

export interface Suggestion<C> {
  channel: C;
  reason: string;
}

export const FOR_YOU_LIMIT = 3;
export const TREND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const norm = (tag: string) => tag.replace(/^#/, '').toLowerCase();

/** Posts this week, and how busy the channel is (posts count most, then likes, then size). */
export function trendInfo(
  channel: SuggestChannel,
  posts: readonly SuggestPost[],
  now: number,
): { postsThisWeek: number; score: number } {
  let postsThisWeek = 0;
  let likes = 0;
  for (const post of posts) {
    if (post.channelId !== channel.id) continue;
    const at = Date.parse(post.createdAt);
    if (!Number.isFinite(at) || now - at > TREND_WINDOW_MS) continue;
    postsThisWeek += 1;
    likes += post.upvotes || 0;
  }
  const score = postsThisWeek * 3 + likes * 0.5 + Math.log10(channel.memberCount + 1);
  return { postsThisWeek, score };
}

/** How well a channel fits you, and why (the #tag you follow, or the channel you're in). */
export function fitFor(
  channel: SuggestChannel,
  myTags: readonly string[],
  joined: readonly SuggestChannel[],
): { score: number; reason: string | null } {
  const mine = new Set(myTags.map(norm));
  const followedMatch = channel.tags.find((tag) => mine.has(norm(tag)));
  let score = channel.tags.filter((tag) => mine.has(norm(tag))).length * 2;
  let likeChannel: SuggestChannel | null = null;
  let bestShared = 0;
  for (const other of joined) {
    const theirs = new Set(other.tags.map(norm));
    const shared = channel.tags.filter((tag) => theirs.has(norm(tag))).length;
    score += shared;
    if (shared > bestShared) {
      bestShared = shared;
      likeChannel = other;
    }
  }
  const reason = followedMatch
    ? `Because you follow ${followedMatch.startsWith('#') ? followedMatch : `#${followedMatch}`}`
    : likeChannel
      ? `Like ${likeChannel.handle}`
      : null;
  return { score, reason };
}

const trendReason = (postsThisWeek: number) =>
  postsThisWeek > 0 ? `${postsThisWeek} ${postsThisWeek === 1 ? 'post' : 'posts'} this week` : 'Popular nearby';

/**
 * Splits the channels you haven't joined into For you (best fits, up to FOR_YOU_LIMIT) and
 * Trending (the rest, busiest first). Every unjoined channel lands in exactly one of the two.
 */
export function suggestChannels<C extends SuggestChannel>(
  channels: readonly C[],
  posts: readonly SuggestPost[],
  myTags: readonly string[],
  now: number,
): { forYou: Suggestion<C>[]; trending: Suggestion<C>[] } {
  const joined = channels.filter((channel) => channel.joined);
  const ranked = channels
    .filter((channel) => !channel.joined)
    .map((channel) => ({ channel, trend: trendInfo(channel, posts, now), fit: fitFor(channel, myTags, joined) }));

  const forYou = ranked
    .filter((entry) => entry.fit.score > 0 && entry.fit.reason)
    .sort((a, b) => b.fit.score - a.fit.score || b.trend.score - a.trend.score)
    .slice(0, FOR_YOU_LIMIT);
  const picked = new Set(forYou.map((entry) => entry.channel.id));
  const trending = ranked
    .filter((entry) => !picked.has(entry.channel.id))
    .sort((a, b) => b.trend.score - a.trend.score);

  return {
    forYou: forYou.map((entry) => ({ channel: entry.channel, reason: entry.fit.reason as string })),
    trending: trending.map((entry) => ({ channel: entry.channel, reason: trendReason(entry.trend.postsThisWeek) })),
  };
}
