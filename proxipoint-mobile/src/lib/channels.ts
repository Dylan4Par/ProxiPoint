import { useEffect, useState } from 'react';
import { isAuthoredAllowed, useModeration } from './moderation';
import {
  accessOf,
  canViewChannel,
  membershipAction,
  uniqueHandle,
  type ChannelAccess,
  type NewChannelInput,
} from './channelAccess';
import { SAMPLE_PLACES, placeRef, type PlaceKind } from './localPlaces';
import { answerStillHappening, type PostKind } from './postKinds';
import { reactTo, sampleReactions, type ChannelReplies, type ReactionCounts } from './postReactions';

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
 *   POST   /channels/:id/follow         follow    DELETE /channels/:id/follow       unfollow
 *   GET    /me/channels/feed?sort=hot|new|top|near&lat&lon
 *   GET    /channels/:id/posts?sort=…   one channel's posts
 *   POST   /channels/:id/posts          { body, place?: { lat, lon, label, pointId? }, pinHours? }
 *   GET    /posts/pinned?bbox=…         live pins inside the map view, from channels you follow
 *   PUT    /posts/:id/reaction          { emoji } (one per person; DELETE to take it back)
 *   GET    /posts/:id/comments          POST /posts/:id/comments { body, parentId? }
 *   PUT    /comments/:id/like           (DELETE to take it back)
 *   PATCH  /channels/:id                { replies: 'on' | 'questions' | 'off' } (moderator)
 *   POST   /channels                    create { name, description, tags, access }
 *   PATCH  /channels/:id                { access?, description?, tags? } (moderator)
 *   POST   /channels/:id/requests       ask to join (private) or to post (restricted)
 *   DELETE /channels/:id/requests/me    take the request back
 *   GET    /channels/:id/requests       moderator: pending requests
 *   POST   /channels/:id/requests/:handle/approve | /decline
 *   DELETE /channels/:id/approved/:handle   moderator: take approval away
 * Access (public / restricted / private) is in channelAccess.ts; the server enforces it on every
 * read and write, so a private channel's posts never reach someone who isn't approved.
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
  /**
   * Following puts the channel's pinned posts on your Explore Map. Separate from joining (which
   * makes you a member who can post and puts the channel in your feed): you can follow without
   * joining, and joining doesn't follow.
   */
  followed?: boolean;
  /** Started automatically for a city or #tag (see autoChannels.ts). */
  auto?: boolean;
  /** Who moderates it. Null on an auto channel nobody has claimed yet. */
  owner?: string | null;
  /** Public (default), restricted or private. See channelAccess.ts. */
  access?: ChannelAccess;
  /** You moderate it (you created or claimed it). */
  moderator?: boolean;
  /** You're approved: can post in a restricted channel, and are a member of a private one. */
  approved?: boolean;
  /** You've asked to join (private) or to post (restricted) and are waiting. */
  requested?: boolean;
  /** Moderator only: people waiting for approval, oldest first. */
  requests?: ChannelRequest[];
  /** Moderator only: who's approved (besides the moderator). */
  approvedUsers?: string[];
  /** Replies on every post (the poster chooses), on Questions only, or off. Default 'on'. */
  replies?: ChannelReplies;
}

export interface ChannelRequest {
  handle: string;
  at: string;
  note?: string;
}

/** Where a post is pinned: a Point's venue, or a block-level spot. */
export interface PostPlace {
  latitude: number;
  longitude: number;
  /** e.g. "The Rusty Anchor" or "Near you". */
  label: string;
  /** Set when pinned at a Point's venue. */
  pointId?: string;
  /** The place it's about (see localPlaces.ts). Posts stay on their place after the pin expires. */
  placeId?: string;
  placeKind?: PlaceKind;
}

export interface ChannelPost {
  id: string;
  channelId: string;
  author: string;
  body: string;
  createdAt: string;
  /** Likes: how many people reacted (one reaction each, never the author's). */
  upvotes: number;
  /** Whether you reacted (kept in step with myReaction). */
  voted: boolean;
  /** Reactions by emoji (they add up to `upvotes`). */
  reactions?: ReactionCounts;
  /** Your reaction, if any (any emoji). */
  myReaction?: string | null;
  /** The poster's "Allow replies" choice. Unset = the kind's default (see postReactions.ts). */
  repliesOn?: boolean;
  /** Pinned to the map at this place, until pinnedUntil. The post itself stays in the feed. */
  place?: PostPlace | null;
  pinnedUntil?: string | null;
  /** Photo URLs, up to POST_PHOTO_LIMIT (uploaded first, then sent with the post). */
  photos?: string[];
  /** Chat (default), heads-up, question or tip. See postKinds.ts. */
  kind?: PostKind;
  /** Heads-ups: how many people said it's still happening / that it's over. */
  confirmations?: number;
  endedReports?: number;
  /** Your answer to "Still happening?". */
  myAnswer?: 'yes' | 'over' | null;
}

/** Most photos on one post. */
export const POST_PHOTO_LIMIT = 4;

export interface PostComment {
  id: string;
  postId: string;
  /** Top-level comments have null; replies point at a top-level comment (one level deep). */
  parentId: string | null;
  author: string;
  body: string;
  createdAt: string;
  /** Likes (a heart; never the author's own). */
  upvotes: number;
  /** Whether you liked it. */
  voted: boolean;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

/**
 * Stand-in photos for the sample posts (random stock images from picsum.photos, fixed per seed so
 * they don't change between launches; same approach as hostProfiles.ts). Real posts carry the
 * URLs of the photos people uploaded.
 */
function samplePostPhotos(postId: string, count: number): string[] {
  return Array.from({ length: count }, (_, n) => `https://picsum.photos/seed/pp-${postId}-${n + 1}/1200/900`);
}

// Sample posts sit at the sample places (localPlaces.ts), the same spots as the sample Points.
const daysAgo = (days: number) => minutesAgo(days * 24 * 60);
function samplePlace(id: string, pointId?: string): PostPlace {
  const place = SAMPLE_PLACES.find((item) => item.id === id);
  if (!place) throw new Error(`Unknown sample place ${id}`);
  return placeRef(place, pointId);
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
    followed: true,
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
  {
    id: 'erie-notices',
    name: 'Erie Town Notices',
    handle: 'c/erienotices',
    description: 'Road closures, town meetings and official heads-ups. Approved posters only; everyone can comment.',
    tags: ['#TownHall', '#Community'],
    memberCount: 3120,
    joined: false,
    access: 'restricted',
    owner: '@erie.local',
  },
  {
    id: 'owls-crew',
    name: 'Midnight Owls Crew',
    handle: 'c/owlscrew',
    description: 'Band and crew only: set lists, load-in times and gear swaps.',
    tags: ['#Jazz'],
    memberCount: 14,
    joined: false,
    access: 'private',
    owner: '@sam.plays.bass',
  },
];

let posts: ChannelPost[] = [
  {
    id: 'p1',
    channelId: 'frontrange-live',
    author: '@sam.plays.bass',
    body: 'Midnight Owls go on at 9:30 tonight. Patio is open, and the second set is all requests.',
    createdAt: minutesAgo(18),
    upvotes: 42,
    voted: false,
    photos: samplePostPhotos('p1', 1),
    kind: 'heads_up',
    place: samplePlace('pl-rusty-anchor', 'pt-midnight-owls'),
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
    photos: samplePostPhotos('p2', 1),
    kind: 'tip',
    place: samplePlace('pl-meadow-park', 'pt-sunset-pickleball'),
    pinnedUntil: hoursFromNow(20),
  },
  {
    id: 'p3',
    channelId: 'frontrange-live',
    author: '@sam.plays.bass',
    body: 'Anyone have a spare 1/4" cable for the jazz jam? Mine died mid-song last week.',
    kind: 'question',
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
    photos: samplePostPhotos('p4', 3),
    kind: 'heads_up',
    confirmations: 3,
    place: samplePlace('pl-central-plaza', 'pt-taco-rally'),
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
    photos: samplePostPhotos('p5', 2),
    place: samplePlace('pl-mesa-trailhead', 'pt-sunrise-hike'),
    pinnedUntil: hoursFromNow(10),
  },
  {
    id: 'p6',
    channelId: 'dink-crew',
    author: '@kim.dinks',
    body: 'Looking for a 3.5 partner for the Saturday ladder. Reply if you’re in.',
    kind: 'question',
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
    author: '@openmicolly',
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
    photos: samplePostPhotos('p9', 1),
    kind: 'heads_up',
    place: samplePlace('pl-briggs-main'),
    pinnedUntil: hoursFromNow(5),
  },
  {
    id: 'p10',
    channelId: 'erie-notices',
    author: '@erie.local',
    body: 'Town board meets Tuesday at 6:30 in the library community room. Agenda: the Briggs St festival and new crosswalks.',
    place: samplePlace('pl-erie-library'),
    createdAt: minutesAgo(200),
    upvotes: 57,
    voted: false,
  },
  // Older posts: their pins are long gone, but they stay on their places and in search.
  {
    id: 'p12',
    channelId: 'trail-tribe',
    author: '@earlybird',
    body: 'The Mesa Trailhead lot is full by 7 on weekends. Park at the church on Ridge Rd and take the connector path (5 min walk).',
    createdAt: daysAgo(20),
    upvotes: 48,
    voted: false,
    kind: 'tip',
    place: samplePlace('pl-mesa-trailhead'),
    pinnedUntil: daysAgo(19),
  },
  {
    id: 'p13',
    channelId: 'food-truck-chasers',
    author: '@hungryinerie',
    body: 'Best birria at the plaza is Mesa 4 Tacos. Get there before 6 or it’s gone. Bring cash for the churro cart.',
    createdAt: daysAgo(9),
    upvotes: 36,
    voted: false,
    kind: 'tip',
    place: samplePlace('pl-central-plaza'),
    pinnedUntil: daysAgo(8),
  },
  {
    id: 'p14',
    channelId: 'dink-crew',
    author: '@paddlepete',
    body: 'Do the Meadow Park courts have lights? Thinking about evening play once it gets dark earlier.',
    createdAt: daysAgo(30),
    upvotes: 17,
    voted: false,
    kind: 'question',
    place: samplePlace('pl-meadow-park'),
    pinnedUntil: daysAgo(29),
  },
  {
    id: 'p15',
    channelId: 'trail-tribe',
    author: '@trailtribe',
    body: 'Coal Creek Trail is muddy past the second bridge after rain. Fine on a bike, messy on foot.',
    createdAt: daysAgo(3),
    upvotes: 22,
    voted: false,
    kind: 'tip',
    photos: samplePostPhotos('p15', 1),
    place: samplePlace('pl-coal-creek'),
    pinnedUntil: daysAgo(2),
  },
  {
    // In a private channel: only its approved members ever see this.
    id: 'p11',
    channelId: 'owls-crew',
    author: '@sam.plays.bass',
    body: 'Load-in at 7:45 tonight through the alley door. Second set list is in the shared folder.',
    createdAt: minutesAgo(90),
    upvotes: 6,
    voted: false,
  },
];

let comments: PostComment[] = [
  { id: 'c1', postId: 'p1', parentId: null, author: '@jazzcat', body: 'Is there a cover after 9?', createdAt: minutesAgo(14), upvotes: 6, voted: false },
  { id: 'c2', postId: 'p1', parentId: 'c1', author: '@sam.plays.bass', body: '$5 after 9, free before.', createdAt: minutesAgo(12), upvotes: 9, voted: false },
  { id: 'c3', postId: 'p1', parentId: null, author: '@vinylvic', body: 'Requesting “Moanin’” for the second set.', createdAt: minutesAgo(6), upvotes: 3, voted: false },
  { id: 'c4', postId: 'p3', parentId: null, author: '@lena.keys', body: 'I’ve got two. I’ll bring one Thursday.', createdAt: minutesAgo(120), upvotes: 7, voted: false },
  { id: 'c5', postId: 'p3', parentId: 'c4', author: '@sam.plays.bass', body: 'Legend. Thank you!', createdAt: minutesAgo(115), upvotes: 2, voted: false },
  { id: 'c6', postId: 'p4', parentId: null, author: '@hungryinerie', body: 'How long is the line right now?', createdAt: minutesAgo(20), upvotes: 11, voted: false },
  { id: 'c7', postId: 'p4', parentId: 'c6', author: '@mesa4tacos', body: 'About 10 minutes. Birria is going fast.', createdAt: minutesAgo(16), upvotes: 15, voted: false },
  { id: 'c8', postId: 'p4', parentId: null, author: '@veggiedan', body: 'Any vegetarian options this time?', createdAt: minutesAgo(10), upvotes: 4, voted: false },
  { id: 'c9', postId: 'p5', parentId: null, author: '@earlybird', body: 'What time exactly? Want to carpool from Lafayette.', createdAt: minutesAgo(250), upvotes: 5, voted: false },
  { id: 'c10', postId: 'p2', parentId: null, author: '@paddlepete', body: 'Finally! Nets are new too.', createdAt: minutesAgo(40), upvotes: 4, voted: false },
  { id: 'c11', postId: 'p14', parentId: null, author: '@dinkcrew', body: 'Yes, courts 1–4 have lights until 10pm. The switch is on the pole by the gate.', createdAt: daysAgo(29), upvotes: 21, voted: false },
  { id: 'c12', postId: 'p12', parentId: null, author: '@flowwithmaya', body: 'Can confirm, the church lot is fine on Saturdays too.', createdAt: daysAgo(18), upvotes: 6, voted: false },
];

// Sample likes: the counts above become a spread of reactions, and the authors' own starting
// votes are taken out (people can't react to their own posts). Posts that already have comments
// keep replies on.
posts = posts.map((post) => {
  const likes = Math.max(0, post.upvotes - 1);
  return {
    ...post,
    upvotes: likes,
    reactions: sampleReactions(post.id, likes),
    myReaction: null,
    repliesOn: comments.some((comment) => comment.postId === post.id) ? true : post.repliesOn,
  };
});
comments = comments.map((comment) => ({ ...comment, upvotes: Math.max(0, comment.upvotes - 1) }));

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

export function getPost(id: string): ChannelPost | null {
  return posts.find((post) => post.id === id) ?? null;
}

/**
 * Adds auto-started channels (from planAutoChannels) that aren't in the list yet. Existing ones
 * keep their members, owner and join state.
 * Server side later: the server creates these as Points come in; GET /channels returns them.
 */
export function syncAutoChannels(planned: Channel[]) {
  const ids = new Set(channels.map((channel) => channel.id));
  const fresh = planned.filter((channel) => !ids.has(channel.id));
  if (!fresh.length) return;
  channels = [...channels, ...fresh];
  changed();
}

/**
 * Claim an unclaimed auto channel: you become its moderator (and join it).
 * Server side later: POST /channels/:id/claim — first come, with limits (account age, one claim
 * at a time) and a review queue, so channels can't be grabbed in bulk.
 */
export function claimChannel(id: string, handle: string) {
  channels = channels.map((channel) =>
    channel.id === id && channel.auto && !channel.owner
      ? {
          ...channel,
          owner: handle,
          moderator: true,
          approved: true,
          joined: true,
          memberCount: channel.joined ? channel.memberCount : channel.memberCount + 1,
        }
      : channel,
  );
  changed();
}

/**
 * A Point with 'channel' visibility is only for that channel's members (and its host, whose own
 * Points are always shown). Everything else passes. The server enforces the same rule.
 */
export function canSeePoint(node: unknown): boolean {
  const n = (node ?? {}) as { visibility?: unknown; channelId?: unknown; origin?: unknown };
  if (n.visibility !== 'channel' || n.origin === 'local') return true;
  return typeof n.channelId === 'string' && Boolean(getChannel(n.channelId)?.joined);
}

/** Follow or unfollow: whether the channel's pinned posts show on your map. */
export function setFollowed(id: string, followed: boolean) {
  channels = channels.map((channel) => (channel.id === id ? { ...channel, followed } : channel));
  changed();
}

export function setJoined(id: string, joined: boolean) {
  channels = channels.map((channel) =>
    channel.id === id && channel.joined !== joined
      ? {
          ...channel,
          joined,
          memberCount: Math.max(0, channel.memberCount + (joined ? 1 : -1)),
          // Leaving a private channel ends your approval: you'd have to ask again.
          approved: !joined && accessOf(channel) === 'private' ? false : channel.approved,
        }
      : channel,
  );
  changed();
}

/** Ask to join (private) or to post (restricted), or take the request back. */
export function setRequested(id: string, requested: boolean) {
  channels = channels.map((channel) => (channel.id === id ? { ...channel, requested } : channel));
  changed();
}

/**
 * The Join button: join or leave; on a private channel, ask to join or take the request back.
 * Moderators can't leave their own channel this way.
 */
export function toggleMembership(id: string) {
  const channel = getChannel(id);
  if (!channel) return;
  switch (membershipAction(channel)) {
    case 'join':
      return setJoined(id, true);
    case 'leave':
      return setJoined(id, false);
    case 'request':
      return setRequested(id, true);
    case 'requested':
      return setRequested(id, false);
    default:
  }
}

/**
 * Start a new channel. You moderate it, you're its first member, and it's on your map.
 * Server side: POST /channels; the server picks the final c/handle.
 */
export function createChannel(input: NewChannelInput, ownerHandle: string): Channel {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const handle = uniqueHandle(name, channels.map((channel) => channel.handle));
  const channel: Channel = {
    id: `ch-${handle.slice(2)}-${Date.now().toString(36)}`,
    name,
    handle,
    description: input.description.trim(),
    tags: input.tags,
    memberCount: 1,
    joined: true,
    followed: true,
    access: input.access,
    owner: ownerHandle,
    moderator: true,
    approved: true,
    approvedUsers: [],
    // Dev builds only: one sample request, so the approval flow can be tried before the backend
    // sends real ones.
    requests:
      input.access !== 'public' && (globalThis as { __DEV__?: boolean }).__DEV__
        ? [{ handle: '@sam.plays.bass', at: new Date().toISOString(), note: 'Sample request (dev build only)' }]
        : [],
  };
  channels = [channel, ...channels];
  changed();
  return channel;
}

/** Moderator: change who can view and post. */
export function setAccess(id: string, access: ChannelAccess) {
  channels = channels.map((channel) => (channel.id === id && channel.moderator ? { ...channel, access } : channel));
  changed();
}

const handleKey = (handle: string) => handle.replace(/^@+/, '').toLowerCase();

/** Moderator: approve a request. On a private channel that makes them a member. */
export function approveRequest(id: string, handle: string) {
  channels = channels.map((channel) => {
    if (channel.id !== id || !channel.moderator) return channel;
    const requests = (channel.requests ?? []).filter((request) => handleKey(request.handle) !== handleKey(handle));
    const approvedUsers = [...(channel.approvedUsers ?? []).filter((h) => handleKey(h) !== handleKey(handle)), handle];
    const joins = accessOf(channel) === 'private' ? 1 : 0;
    return { ...channel, requests, approvedUsers, memberCount: channel.memberCount + joins };
  });
  changed();
}

export function declineRequest(id: string, handle: string) {
  channels = channels.map((channel) =>
    channel.id === id && channel.moderator
      ? { ...channel, requests: (channel.requests ?? []).filter((request) => handleKey(request.handle) !== handleKey(handle)) }
      : channel,
  );
  changed();
}

/** Moderator: take someone's approval away (they leave a private channel). */
export function removeApproved(id: string, handle: string) {
  channels = channels.map((channel) => {
    if (channel.id !== id || !channel.moderator) return channel;
    const before = channel.approvedUsers ?? [];
    const approvedUsers = before.filter((h) => handleKey(h) !== handleKey(handle));
    const left = accessOf(channel) === 'private' && approvedUsers.length < before.length ? 1 : 0;
    return { ...channel, approvedUsers, memberCount: Math.max(1, channel.memberCount - left) };
  });
  changed();
}

/**
 * React to a post (one reaction each): add, swap to another emoji, or tap yours again to take it
 * back. The screen doesn't offer it on your own posts.
 */
export function reactToPost(postId: string, emoji: string) {
  posts = posts.map((post) => {
    if (post.id !== postId) return post;
    const next = reactTo(post, emoji);
    return { ...next, voted: Boolean(next.myReaction) };
  });
  changed();
}

/** Moderator: replies on every post, Questions only, or off. */
export function setChannelReplies(id: string, replies: ChannelReplies) {
  channels = channels.map((channel) => (channel.id === id && channel.moderator ? { ...channel, replies } : channel));
  changed();
}

/**
 * New post (no likes yet). Pass `pin` to tie it to a place (block-level or a
 * known place, never an exact GPS fix) and show it on the map for `hours` (0: place only).
 */
export function addPost(
  channelId: string,
  author: string,
  body: string,
  pin: { place: PostPlace; hours: number } | null = null,
  photos: string[] = [],
  kind: PostKind = 'chat',
  repliesOn?: boolean,
): ChannelPost {
  const post: ChannelPost = {
    id: `p-${Date.now()}`,
    channelId,
    author,
    body: body.trim(),
    createdAt: new Date().toISOString(),
    upvotes: 0,
    voted: false,
    reactions: {},
    myReaction: null,
    repliesOn,
    place: pin ? pin.place : null,
    // On the map only when attached to an event (a Point) with hours > 0; otherwise the post is on
    // the place's page only.
    pinnedUntil:
      pin && pin.place.pointId && pin.hours > 0 ? new Date(Date.now() + pin.hours * 3600000).toISOString() : null,
    photos: photos.slice(0, POST_PHOTO_LIMIT),
    kind,
  };
  posts = [post, ...posts];
  changed();
  return post;
}

/**
 * "Still happening?" on a heads-up: yes keeps it on the map a while longer, over takes the pin
 * down. One answer per person. Server side: PUT /posts/:id/still-happening { value: true | false };
 * the server should need a couple of "over" answers (or the author's) before taking a pin down.
 */
export function answerHeadsUp(postId: string, stillHappening: boolean) {
  posts = posts.map((post) => {
    if (post.id !== postId || post.myAnswer) return post;
    return { ...answerStillHappening(post, stillHappening), myAnswer: stillHappening ? 'yes' : 'over' };
  });
  changed();
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
    upvotes: 0,
    voted: false,
  };
  comments = [...comments, comment];
  changed();
  return comment;
}

/** Like a comment, or take the like back. */
export function toggleCommentLike(commentId: string) {
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

/** A post in a channel you're allowed to view (private channels: approved members only). */
export function isPostViewable(post: Pick<ChannelPost, 'channelId'>): boolean {
  return canViewChannel(getChannel(post.channelId));
}

/**
 * Posts you should see: without ones you reported, by people you blocked, or in private channels
 * you're not approved for. Re-renders on new posts, votes, reports, blocks and access changes.
 * Use this (not usePosts) anywhere posts are shown.
 */
export function useVisiblePosts(): ChannelPost[] {
  const all = usePosts();
  useModeration();
  useChannels(); // access and approval changes
  return all.filter((post) => isAuthoredAllowed(post) && isPostViewable(post));
}

/** Comments you should see (same rules as useVisiblePosts, by the post they're on). */
export function useVisibleComments(): PostComment[] {
  const all = useComments();
  useModeration();
  useChannels();
  return all.filter((comment) => {
    const post = getPost(comment.postId);
    return isAuthoredAllowed(comment) && (!post || isPostViewable(post));
  });
}
