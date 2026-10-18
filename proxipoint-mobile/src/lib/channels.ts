import { useEffect, useState } from 'react';

/**
 * Channels: groups people join, like subreddits for a local scene. Each channel has its own
 * feed of posts, and pulls in the Points that use its #tags.
 *
 * Kept in memory with sample data for now (same pattern as My Drops and Activity).
 * Server side later:
 *   GET    /channels?lat&lon&q          channels near you / search
 *   GET    /me/channels                 channels you've joined
 *   POST   /channels/:id/membership     join      DELETE /channels/:id/membership   leave
 *   GET    /me/channels/feed            newest posts from every channel you've joined
 *   GET    /channels/:id/posts          one channel's posts (newest first)
 *   POST   /channels/:id/posts          { body, pointId? }
 *   PUT    /posts/:id/vote              { value: 1 | 0 }
 * Posts need the same report/block handling as recaps (see moderation.ts).
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

export interface ChannelPost {
  id: string;
  channelId: string;
  author: string;
  body: string;
  createdAt: string;
  upvotes: number;
  comments: number;
  /** Whether you upvoted it. */
  voted: boolean;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();

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
    comments: 7,
    voted: false,
  },
  {
    id: 'p2',
    channelId: 'dink-crew',
    author: '@dinkcrew',
    body: 'Courts 3 and 4 at Meadow Park were resurfaced this week. Sunset open play is back on.',
    createdAt: minutesAgo(55),
    upvotes: 19,
    comments: 3,
    voted: false,
  },
  {
    id: 'p3',
    channelId: 'frontrange-live',
    author: '@sam.plays.bass',
    body: 'Anyone have a spare 1/4" cable for the jazz jam? Mine died mid-song last week.',
    createdAt: minutesAgo(140),
    upvotes: 8,
    comments: 12,
    voted: false,
  },
  {
    id: 'p4',
    channelId: 'food-truck-chasers',
    author: '@mesa4tacos',
    body: 'Truck rally is at Central Park Plaza tonight. Birria and elote are back on the menu.',
    createdAt: minutesAgo(32),
    upvotes: 88,
    comments: 21,
    voted: false,
  },
  {
    id: 'p5',
    channelId: 'trail-tribe',
    author: '@trailtribe',
    body: 'Sunrise Ridge hike meets at Mesa Trailhead. Bring a headlamp; we start in the dark.',
    createdAt: minutesAgo(300),
    upvotes: 64,
    comments: 9,
    voted: false,
  },
  {
    id: 'p6',
    channelId: 'dink-crew',
    author: '@kim.dinks',
    body: 'Looking for a 3.5 partner for the Saturday ladder. Reply if you’re in.',
    createdAt: minutesAgo(420),
    upvotes: 5,
    comments: 4,
    voted: false,
  },
  {
    id: 'p7',
    channelId: 'tabletop-trivia',
    author: '@quizmasterjen',
    body: 'Two teams still need a fifth for Wednesday trivia at the Brickhouse. Music round this week!',
    createdAt: minutesAgo(75),
    upvotes: 23,
    comments: 6,
    voted: false,
  },
  {
    id: 'p8',
    channelId: 'frontrange-live',
    author: '@laughinggoat',
    body: 'Open mic sign-ups start at 7. Comedy first, acoustic sets after 8:30.',
    createdAt: minutesAgo(600),
    upvotes: 31,
    comments: 2,
    voted: false,
  },
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

export function addPost(channelId: string, author: string, body: string): ChannelPost {
  const post: ChannelPost = {
    id: `p-${Date.now()}`,
    channelId,
    author,
    body: body.trim(),
    createdAt: new Date().toISOString(),
    upvotes: 1,
    comments: 0,
    voted: true,
  };
  posts = [post, ...posts];
  changed();
  return post;
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
