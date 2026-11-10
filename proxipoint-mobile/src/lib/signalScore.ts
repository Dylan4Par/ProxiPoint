import type { ChannelPost, PostComment } from './channels';
import type { PointRecap, Reactions } from './pointRecap';

/**
 * Signal Score: how much the community trusts someone, from what they've done locally.
 * Pure (no React) so it's testable and can move to the server as-is.
 *
 * It bundles two halves:
 * - Earned: what other people gave you. Likes (reactions) on your posts and comments, and cheers
 *   (reactions) on the recaps of Points you hosted. People can't like their own posts.
 * - Contributed: what you put in. Posts, comments, Points hosted and recaps.
 *   Contribution can only run CONTRIBUTION_HEADROOM ahead of what you've earned, so posting a lot
 *   of things nobody likes can't buy a strong signal.
 *
 * Paid Boosts never feed in (businesses pay to be seen, never to be ranked). Callers pass only
 * posts and comments you're allowed to see (reported and blocked ones left out).
 */

export const EARN = {
  /** Per like on a post or comment (from someone else). */
  upvote: 1,
  /** Per reaction on a recap or its photos. */
  cheer: 1,
} as const;

export const CONTRIBUTE = {
  post: 2,
  comment: 1,
  pointHosted: 3,
  recap: 2,
} as const;

/** How far contribution can run ahead of earned signal. */
export const CONTRIBUTION_HEADROOM = 25;

/** Score needed for each bar, like a phone's signal meter. */
export const SIGNAL_BARS = [1, 25, 100, 250, 600] as const;
export const SIGNAL_LEVELS = ['No signal', 'Faint', 'Fair', 'Good', 'Strong', 'Full signal'] as const;
export type SignalLevel = (typeof SIGNAL_LEVELS)[number];

/** "Strongest Signal" looks at the last 30 days, so newer people can rise. */
export const STRONGEST_WINDOW_DAYS = 30;

export interface Signal {
  score: number;
  earned: number;
  contributed: number;
  /** 0 to 5. */
  bars: number;
  level: SignalLevel;
  /** Where the earned half came from. */
  postUpvotes: number;
  commentUpvotes: number;
  cheers: number;
  /** What they've done. */
  posts: number;
  comments: number;
  pointsHosted: number;
  recaps: number;
}

export interface SignalSources {
  posts: ChannelPost[];
  comments: PostComment[];
  /** Points hosted, all time. */
  pointsHosted?: number;
  recaps?: PointRecap[];
}

export const sameHandle = (a: string, b: string) =>
  a.replace(/^@+/, '').trim().toLowerCase() === b.replace(/^@+/, '').trim().toLowerCase();

/** Likes from other people (authors can't react to their own posts or comments). */
const othersVotes = (likes: number) => Math.max(0, likes);

const reactionCount = (reactions: Reactions) =>
  Object.values(reactions).reduce((sum, entry) => sum + (entry?.count ?? 0), 0);

/** Reactions on a recap and on each of its photos. */
export function recapCheers(recap: PointRecap): number {
  return reactionCount(recap.reactions) + recap.photos.reduce((sum, photo) => sum + reactionCount(photo.reactions), 0);
}

export function signalBars(score: number): number {
  return SIGNAL_BARS.filter((needed) => score >= needed).length;
}

/** Points to the next bar, or null at full signal. */
export function nextBarIn(score: number): number | null {
  const next = SIGNAL_BARS.find((needed) => score < needed);
  return next === undefined ? null : next - Math.max(0, Math.floor(score));
}

/** Signal Score for one person, from everything they've posted, commented, hosted and recapped. */
export function computeSignal(handle: string, sources: SignalSources): Signal {
  const mine = <T extends { author: string }>(items: T[]) => items.filter((item) => sameHandle(item.author, handle));
  const posts = mine(sources.posts);
  const comments = mine(sources.comments);
  const recaps = sources.recaps ?? [];
  const pointsHosted = Math.max(0, sources.pointsHosted ?? 0);

  const postUpvotes = posts.reduce((sum, post) => sum + othersVotes(post.upvotes), 0);
  const commentUpvotes = comments.reduce((sum, comment) => sum + othersVotes(comment.upvotes), 0);
  const cheers = recaps.reduce((sum, recap) => sum + recapCheers(recap), 0);
  const earned = EARN.upvote * (postUpvotes + commentUpvotes) + EARN.cheer * cheers;

  const rawContribution =
    CONTRIBUTE.post * posts.length +
    CONTRIBUTE.comment * comments.length +
    CONTRIBUTE.pointHosted * pointsHosted +
    CONTRIBUTE.recap * recaps.length;
  const contributed = Math.min(rawContribution, earned + CONTRIBUTION_HEADROOM);

  const score = earned + contributed;
  const bars = signalBars(score);
  return {
    score,
    earned,
    contributed,
    bars,
    level: SIGNAL_LEVELS[bars],
    postUpvotes,
    commentUpvotes,
    cheers,
    posts: posts.length,
    comments: comments.length,
    pointsHosted,
    recaps: recaps.length,
  };
}

// ---- Contributions ------------------------------------------------------------------------------

export type Contribution =
  | { kind: 'post'; id: string; postId: string; channelId: string; body: string; upvotes: number; createdAt: string }
  | { kind: 'comment'; id: string; postId: string; channelId: string; body: string; upvotes: number; createdAt: string };

/**
 * Someone's posts and comments, newest first. A comment carries its post's channel (comments on
 * posts you can't see are left out).
 */
export function contributionsOf(handle: string, posts: ChannelPost[], comments: PostComment[]): Contribution[] {
  const byId = new Map(posts.map((post) => [post.id, post]));
  const items: Contribution[] = [
    ...posts
      .filter((post) => sameHandle(post.author, handle))
      .map((post): Contribution => ({
        kind: 'post',
        id: post.id,
        postId: post.id,
        channelId: post.channelId,
        body: post.body,
        upvotes: post.upvotes,
        createdAt: post.createdAt,
      })),
    ...comments
      .filter((comment) => sameHandle(comment.author, handle) && byId.has(comment.postId))
      .map((comment): Contribution => ({
        kind: 'comment',
        id: comment.id,
        postId: comment.postId,
        channelId: (byId.get(comment.postId) as ChannelPost).channelId,
        body: comment.body,
        upvotes: comment.upvotes,
        createdAt: comment.createdAt,
      })),
  ];
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ---- Strongest Signal ---------------------------------------------------------------------------

export interface SignalRank {
  handle: string;
  score: number;
  posts: number;
  comments: number;
  /** Upvotes from other people on their posts and comments. */
  upvotes: number;
}

/**
 * Who has the strongest signal in a channel (or everywhere, with no channelId), from posts and
 * comments in the last STRONGEST_WINDOW_DAYS. Best first; ties go to whoever has more upvotes,
 * then by handle so the order is stable. People with no earned signal aren't ranked.
 */
export function strongestSignals(
  posts: ChannelPost[],
  comments: PostComment[],
  options: { channelId?: string | null; now?: number; limit?: number; exclude?: (handle: string) => boolean } = {},
): SignalRank[] {
  const now = options.now ?? Date.now();
  const since = now - STRONGEST_WINDOW_DAYS * 24 * 3600000;
  const recent = (createdAt: string) => new Date(createdAt).getTime() >= since;
  const inScope = posts.filter((post) => !options.channelId || post.channelId === options.channelId);
  const scopedPosts = inScope.filter((post) => recent(post.createdAt));
  const postIds = new Set(inScope.map((post) => post.id));
  const scopedComments = comments.filter((comment) => postIds.has(comment.postId) && recent(comment.createdAt));

  const handles = new Map<string, string>();
  for (const item of [...scopedPosts, ...scopedComments]) {
    const key = item.author.replace(/^@+/, '').toLowerCase();
    if (!handles.has(key)) handles.set(key, item.author);
  }

  const ranks: SignalRank[] = [];
  for (const handle of handles.values()) {
    if (options.exclude?.(handle)) continue;
    const signal = computeSignal(handle, { posts: scopedPosts, comments: scopedComments });
    if (signal.earned <= 0) continue;
    ranks.push({
      handle,
      score: signal.score,
      posts: signal.posts,
      comments: signal.comments,
      upvotes: signal.postUpvotes + signal.commentUpvotes,
    });
  }
  ranks.sort((a, b) => b.score - a.score || b.upvotes - a.upvotes || a.handle.localeCompare(b.handle));
  return options.limit ? ranks.slice(0, options.limit) : ranks;
}
