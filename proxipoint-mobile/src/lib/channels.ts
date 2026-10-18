import { useEffect, useState } from 'react';

/**
 * Channels: groups people join, like subreddits for a local scene. Each channel has its own
 * feed of posts, and pulls in the Points that use its #tags. A post can be pinned to a place for
 * a few hours, and shows as a speech-bubble pin on Explore Map until then.
 *
 * Kept in memory with sample data for now (same pattern as My Drops and Activity).
 * Server side later:
 *   GET    /channels?lat&lon&q          channels near you / search
 *   GET    /me/channels                 channels you've joined
 *   POST   /channels/:id/membership     join      DELETE /channels/:id/membership   leave
 *   GET    /me/channels/feed?sort=hot|new|top|near&lat&lon
 *   GET    /channels/:id/posts?sort=…   one channel's posts
 *   POST   /channels/:id/posts          { body, place?: { lat, lon, label, pointId? }, pinHours? }
 *   GET    /posts/pinned?bbox=…         pins still live inside the map view
 *   PUT    /posts/:id/vote              { value: 1 | 0 }
 *   GET    /posts/:id/comments          POST /posts/:id/comments { body, parentId? }
 *   PUT    /comments/:id/vote           { value: 1 | 0 }
 * Ranking stays community-only: votes, comments, age and distance. Boosts never feed into it.
 * Pinned places are block-level (see snapToBlock in postRanking.ts), never an exact GPS fix.
 * Posts and comments need the same report/block handling as recaps (see moderation.ts).
 */

export interface Channel {
  id: string;
  name: string;
  /** Short handle shown under the name, e.g. "c/frontrangelive". */
  handle: string;
  description: string;
  /** Points with any of these #tags show up in the channel. Main one first. */
  tags: string[];
  memberCount: number;
  joined: boolean;
}

/** Where a post is pinned: a Point's venue, or a block-level spot. */
export interface PostPlace {
  latitude: number;
  longitude: number;
  /** e.g. "The Rusty Anchor" or "Near you". */
  label: string;
  /** Set when pinned at a Point's venue. */
  pointId?: string;
}

export interface ChannelPost {
  id: string;
  channelId: string;
  author: string;
  body: string;
  createdAt: string;
  upvotes: number;
  /** Whether you upvoted it. */
  voted: boolean;
  /** Pinned to the map at this place, until pinnedUntil. The post itself stays in the feed. */
  place?: PostPlace | null;
  pinnedUntil?: string | null;
}

export interface PostComment {
  id: string;
  postId: string;
  /** Top-level comments have null; replies point at a top-level comment (one level deep). */
  parentId: string | null;
  author: string;
  body: string;
  createdAt: string;
  upvotes: number;
  voted: boolean;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

// Sample places, placed the same way as the sample Points (meters east/north of the default spot).
const SAMPLE_ORIGIN = { latitude: 40.061708, longitude: -105.038292 };
function sampleSpot(east: number, north: number, label: string, pointId?: string): PostPlace {
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos((SAMPLE_ORIGIN.latitude * Math.PI) / 180);
  return {
    latitude: SAMPLE_ORIGIN.latitude + north / metersPerDegLat,
    longitude: SAMPLE_ORIGIN.longitude + east / metersPerDegLon,
    label,
    pointId,
  };
}

let channels: Channel[] = [
  {
    id: 'frontrange-live',
    name: 'Front Range Live Music',
    handle: 'c/frontrangelive',
    description: 'Shows, jams and open stages from Boulder to Erie. Post set times and who’s playing.',
    tags: ['#LiveMusic', '#Jazz', '#Soul', '#OpenMic'],
    memberCount: 1240,
    joined: true,
  },
  {
    id: 'dink-crew',
    name: 'Dink Crew Pickleball',
    handle: 'c/dinkcrew',
    description: 'Open play, ladders and court conditions. All levels welcome.',
    tags: ['#Pickleball', '#OpenPlay'],
    memberCount: 386,
    joined: true,
  },
  {
    id: 'food-truck-chasers',
    name: 'Food Truck Chasers',
    handle: 'c/foodtrucks',
    description: 'Where the trucks are parked tonight, plus markets and pop-ups.',
    tags: ['#FoodTrucks', '#TacoTuesday', '#FarmersMarket', '#LocalFood', '#Tasting'],
    memberCount: 2105,
    joined: false,
  },
  {
    id: 'tabletop-trivia',
    name: 'Tabletop & Trivia',
    handle: 'c/tabletop',
    description: 'Board game nights, pub trivia teams looking for players, and game swaps.',
    tags: ['#BoardGames', '#TriviaNight', '#Social'],
    memberCount: 512,
    joined: false,
  },
  {
    id: 'trail-tribe',
    name: 'Trail Tribe',
    handle: 'c/trailtribe',
    description: 'Group hikes, sunrise missions and outdoor yoga. Trail reports welcome.',
    tags: ['#Hiking', '#Outdoors', '#Yoga', '#Sunrise'],
    memberCount: 1630,
    joined: false,
  },
  {
    id: 'boulder-devs',
    name: 'Boulder Devs & Makers',
    handle: 'c/boulderdevs',
    description: 'Meetups, hack nights and coffee chats for people who build things.',
    tags: ['#TechMeetup', '#Kotlin', '#GIS'],
    memberCount: 744,
    joined: false,
  },
  {
    id: 'old-town-arts',
    name: 'Old Town Arts',
    handle: 'c/oldtownarts',
    description: 'Art walks, gallery openings and local artist markets.',
    tags: ['#ArtWalk', '#Gallery', '#LocalArtists'],
    memberCount: 298,
    joined: false,
  },
  {
    id: 'green-volunteers',
    name: 'Green Boulder Volunteers',
    handle: 'c/greenboulder',
    description: 'Creek cleanups, tree plantings and other ways to pitch in.',
    tags: ['#Volunteer', '#CreekCleanup'],
    memberCount: 457,
    joined: false,
  },
];

let posts: ChannelPost[] = [
  {
    id: 'p1',
    channelId: 'frontrange-live',
    author: '@rustyanchor',
    body: 'Midnight Owls go on at 9:30 tonight. Patio is open, and the second set is all requests.',
    createdAt: minutesAgo(18),
    upvotes: 42,
    voted: false,
    place: sampleSpot(-260, 180, 'The Rusty Anchor', 'pt-midnight-owls'),
    pinnedUntil: hoursFromNow(3),
  },
  {
    id: 'p2',
    channelId: 'dink-crew',
    author: '@dinkcrew',
    body: 'Courts 3 and 4 at Meadow Park were resurfaced this week. Sunset open play is back on.',
    createdAt: minutesAgo(55),
    upvotes: 19,
    voted: false,
    place: sampleSpot(-700, -350, 'Meadow Park Courts', 'pt-sunset-pickleball'),
    pinnedUntil: hoursFromNow(20),
  },
  {
    id: 'p3',
    channelId: 'frontrange-live',
    author: '@sam.plays.bass',
    body: 'Anyone have a spare 1/4" cable for the jazz jam? Mine died mid-song last week.',
    createdAt: minutesAgo(140),
    upvotes: 8,
    voted: false,
  },
  {
    id: 'p4',
    channelId: 'food-truck-chasers',
    author: '@mesa4tacos',
    body: 'Truck rally is at Central Park Plaza tonight. Birria and elote are back on the menu.',
    createdAt: minutesAgo(32),
    upvotes: 88,
    voted: false,
    place: sampleSpot(340, 420, 'Central Park Plaza', 'pt-taco-rally'),
    pinnedUntil: hoursFromNow(2),
  },
  {
    id: 'p5',
    channelId: 'trail-tribe',
    author: '@trailtribe',
    body: 'Sunrise Ridge hike meets at Mesa Trailhead. Bring a headlamp; we start in the dark.',
    createdAt: minutesAgo(300),
    upvotes: 64,
    voted: false,
    place: sampleSpot(-900, 900, 'Mesa Trailhead', 'pt-sunrise-hike'),
    pinnedUntil: hoursFromNow(10),
  },
  {
    id: 'p6',
    channelId: 'dink-crew',
    author: '@kim.dinks',
    body: 'Looking for a 3.5 partner for the Saturday ladder. Reply if you’re in.',
    createdAt: minutesAgo(420),
    upvotes: 5,
    voted: false,
  },
  {
    id: 'p7',
    channelId: 'tabletop-trivia',
    author: '@quizmasterjen',
    body: 'Two teams still need a fifth for Wednesday trivia at the Brickhouse. Music round this week!',
    createdAt: minutesAgo(75),
    upvotes: 23,
    voted: false,
  },
  {
    id: 'p8',
    channelId: 'frontrange-live',
    author: '@laughinggoat',
    body: 'Open mic sign-ups start at 7. Comedy first, acoustic sets after 8:30.',
    createdAt: minutesAgo(600),
    upvotes: 31,
    voted: false,
  },
  {
    id: 'p9',
    channelId: 'frontrange-live',
    author: '@erie.local',
    body: 'Street parking on Briggs is closed for the festival setup. Park behind the library instead.',
    createdAt: minutesAgo(25),
    upvotes: 14,
    voted: false,
    place: sampleSpot(120, -60, 'Near Briggs St'),
    pinnedUntil: hoursFromNow(5),
  },
];

let comments: PostComment[] = [
  { id: 'c1', postId: 'p1', parentId: null, author: '@jazzcat', body: 'Is there a cover after 9?', createdAt: minutesAgo(14), upvotes: 6, voted: false },
  { id: 'c2', postId: 'p1', parentId: 'c1', author: '@rustyanchor', body: '$5 after 9, free before.', createdAt: minutesAgo(12), upvotes: 9, voted: false },
  { id: 'c3', postId: 'p1', parentId: null, author: '@vinylvic', body: 'Requesting “Moanin’” for the second set.', createdAt: minutesAgo(6), upvotes: 3, voted: false },
  { id: 'c4', postId: 'p3', parentId: null, author: '@lena.keys', body: 'I’ve got two. I’ll bring one Thursday.', createdAt: minutesAgo(120), upvotes: 7, voted: false },
  { id: 'c5', postId: 'p3', parentId: 'c4', author: '@sam.plays.bass', body: 'Legend. Thank you!', createdAt: minutesAgo(115), upvotes: 2, voted: false },
  { id: 'c6', postId: 'p4', parentId: null, author: '@hungryinerie', body: 'How long is the line right now?', createdAt: minutesAgo(20), upvotes: 11, voted: false },
  { id: 'c7', postId: 'p4', parentId: 'c6', author: '@mesa4tacos', body: 'About 10 minutes. Birria is going fast.', createdAt: minutesAgo(16), upvotes: 15, voted: false },
  { id: 'c8', postId: 'p4', parentId: null, author: '@veggiedan', body: 'Any vegetarian options this time?', createdAt: minutesAgo(10), upvotes: 4, voted: false },
  { id: 'c9', postId: 'p5', parentId: null, author: '@earlybird', body: 'What time exactly? Want to carpool from Lafayette.', createdAt: minutesAgo(250), upvotes: 5, voted: false },
  { id: 'c10', postId: 'p2', parentId: null, author: '@paddlepete', body: 'Finally! Nets are new too.', createdAt: minutesAgo(40), upvotes: 4, voted: false },
];

const listeners = new Set<() => void>();
function changed() {
  listeners.forEach((listener) => listener());
}

function useStore<T>(read: () => T): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const listener = () => setValue(read());
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export function getChannels(): Channel[] {
  return channels;
}

export function getChannel(id: string): Channel | null {
  return channels.find((channel) => channel.id === id) ?? null;
}

export function setJoined(id: string, joined: boolean) {
  channels = channels.map((channel) =>
    channel.id === id && channel.joined !== joined
      ? { ...channel, joined, memberCount: Math.max(0, channel.memberCount + (joined ? 1 : -1)) }
      : channel,
  );
  changed();
}

/** Upvote, or take the upvote back. */
export function toggleVote(postId: string) {
  posts = posts.map((post) =>
    post.id === postId ? { ...post, voted: !post.voted, upvotes: post.upvotes + (post.voted ? -1 : 1) } : post,
  );
  changed();
}

/**
 * New post, starting with your own upvote. Pass `pin` to show it on the map at a place for
 * `hours` (the place should already be block-level or a Point's venue).
 */
export function addPost(
  channelId: string,
  author: string,
  body: string,
  pin: { place: PostPlace; hours: number } | null = null,
): ChannelPost {
  const post: ChannelPost = {
    id: `p-${Date.now()}`,
    channelId,
    author,
    body: body.trim(),
    createdAt: new Date().toISOString(),
    upvotes: 1,
    voted: true,
    place: pin ? pin.place : null,
    pinnedUntil: pin ? new Date(Date.now() + pin.hours * 3600000).toISOString() : null,
  };
  posts = [post, ...posts];
  changed();
  return post;
}

export function addComment(postId: string, author: string, body: string, parentId: string | null = null): PostComment {
  // Replies stay one level deep: a reply to a reply goes under the same top-level comment.
  const parent = parentId ? comments.find((comment) => comment.id === parentId) : null;
  const comment: PostComment = {
    id: `c-${Date.now()}`,
    postId,
    parentId: parent ? parent.parentId ?? parent.id : null,
    author,
    body: body.trim(),
    createdAt: new Date().toISOString(),
    upvotes: 1,
    voted: true,
  };
  comments = [...comments, comment];
  changed();
  return comment;
}

export function toggleCommentVote(commentId: string) {
  comments = comments.map((comment) =>
    comment.id === commentId
      ? { ...comment, voted: !comment.voted, upvotes: comment.upvotes + (comment.voted ? -1 : 1) }
      : comment,
  );
  changed();
}

/** All channels; re-renders on join/leave. */
export function useChannels(): Channel[] {
  return useStore(() => channels);
}

/** All posts, newest first; re-renders on new posts and votes. */
export function usePosts(): ChannelPost[] {
  return useStore(() =>
    [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  );
}

/** All comments; re-renders on new comments and votes. */
export function useComments(): PostComment[] {
  return useStore(() => comments);
}
