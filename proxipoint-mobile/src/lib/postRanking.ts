import { calculateDistanceMeters } from './locationFilter';
import type { ChannelPost, PostComment } from './channels';

/**
 * Sorting for channel posts, pinned-post rules and comment threads. Pure functions (no React),
 * so they're easy to test and can move to the server as-is.
 *
 * Ranking is community-only: upvotes, comments, age and distance. Boosts (paid) never feed into
 * it; they get their own labeled slots elsewhere.
 */

export type PostSort = 'hot' | 'new' | 'top' | 'near';

/** Feeds open on New (newest first); the others are a tap away. */
export const POST_SORTS: Array<{ id: PostSort; label: string }> = [
  { id: 'new', label: 'New' },
  { id: 'hot', label: 'Hot' },
  { id: 'top', label: 'Most liked' },
  { id: 'near', label: 'Near' },
];

export interface LatLon {
  latitude: number;
  longitude: number;
}

/** Posts with no place count as this far away in the Near sort (channel-wide, not "here"). */
export const UNPINNED_DISTANCE_METERS = 5000;

const ageHours = (post: Pick<ChannelPost, 'createdAt'>, now: number) =>
  Math.max(0, (now - new Date(post.createdAt).getTime()) / 3600000);

/**
 * Hot: engagement over age. Comments count double (a conversation is a stronger signal than a
 * tap), and the +2h keeps brand-new posts from jumping straight to the top.
 */
export function hotScore(post: ChannelPost, commentCount: number, now = Date.now()): number {
  const engagement = Math.max(0, post.upvotes) + 2 * commentCount + 1;
  return engagement / Math.pow(ageHours(post, now) + 2, 1.5);
}

/** Meters from `center` to where the post is pinned (null when it has no place). */
export function postDistance(post: ChannelPost, center: LatLon): number | null {
  if (!post.place) return null;
  return calculateDistanceMeters(center.latitude, center.longitude, post.place.latitude, post.place.longitude);
}

/** Near: hot, discounted by distance, so a fresh post next door beats a popular one across town. */
export function nearScore(post: ChannelPost, commentCount: number, center: LatLon, now = Date.now()): number {
  const meters = postDistance(post, center) ?? UNPINNED_DISTANCE_METERS;
  return hotScore(post, commentCount, now) / (1 + meters / 1000);
}

export function sortPosts(
  posts: ChannelPost[],
  sort: PostSort,
  options: { now?: number; center?: LatLon | null; commentCounts?: Record<string, number> } = {},
): ChannelPost[] {
  const now = options.now ?? Date.now();
  const counts = options.commentCounts ?? {};
  const n = (post: ChannelPost) => counts[post.id] ?? 0;
  const newest = (a: ChannelPost, b: ChannelPost) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const list = [...posts];
  switch (sort) {
    case 'new':
      return list.sort(newest);
    case 'top':
      return list.sort((a, b) => b.upvotes - a.upvotes || newest(a, b));
    case 'near':
      if (options.center) {
        const center = options.center;
        return list.sort((a, b) => nearScore(b, n(b), center, now) - nearScore(a, n(a), center, now) || newest(a, b));
      }
      return list.sort((a, b) => hotScore(b, n(b), now) - hotScore(a, n(a), now) || newest(a, b));
    case 'hot':
    default:
      return list.sort((a, b) => hotScore(b, n(b), now) - hotScore(a, n(a), now) || newest(a, b));
  }
}

/** Comment counts per post. */
export function countComments(comments: PostComment[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const comment of comments) counts[comment.postId] = (counts[comment.postId] ?? 0) + 1;
  return counts;
}

// ---- Pins --------------------------------------------------------------------------------------

/** Pin lengths offered when posting. */
export const PIN_HOURS = [2, 6, 24];

/** The post is still showing on the map. */
export function isPinLive(post: ChannelPost, now = Date.now()): boolean {
  return Boolean(post.place && post.pinnedUntil && new Date(post.pinnedUntil).getTime() > now);
}

/** "2h left", "45m left" */
export function pinTimeLeft(post: ChannelPost, now = Date.now()): string | null {
  if (!isPinLive(post, now)) return null;
  const minutes = Math.round((new Date(post.pinnedUntil as string).getTime() - now) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m left`;
  return `${Math.round(minutes / 60)}h left`;
}

/**
 * Rounds a position to a ~100 m grid (0.001°), so a post pinned "near me" shows the block,
 * never your exact spot (your home, for one).
 */
export function snapToBlock(position: LatLon): LatLon {
  const snap = (value: number) => Math.round(value * 1000) / 1000;
  return { latitude: snap(position.latitude), longitude: snap(position.longitude) };
}

// ---- Comment threads ---------------------------------------------------------------------------

export interface CommentThread {
  comment: PostComment;
  replies: PostComment[];
}

/**
 * One post's comments as threads: top-level comments best first (upvotes, then oldest), each
 * with its replies oldest first so the conversation reads in order.
 */
export function buildThreads(comments: PostComment[], postId: string): CommentThread[] {
  const mine = comments.filter((comment) => comment.postId === postId);
  const time = (comment: PostComment) => new Date(comment.createdAt).getTime();
  const tops = mine
    .filter((comment) => !comment.parentId || !mine.some((other) => other.id === comment.parentId))
    .sort((a, b) => b.upvotes - a.upvotes || time(a) - time(b));
  return tops.map((comment) => ({
    comment,
    replies: mine.filter((reply) => reply.parentId === comment.id).sort((a, b) => time(a) - time(b)),
  }));
}
