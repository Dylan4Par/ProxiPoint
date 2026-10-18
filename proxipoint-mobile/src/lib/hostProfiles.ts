import { useEffect, useState } from 'react';
import type { PointRecap } from './pointRecap';

/**
 * Public profiles for the sample hosts in useDiscoveryStore. Placeholder data until the backend
 * serves profiles (e.g. GET /users/:handle and GET /users/:handle/recaps).
 */
export interface HostProfile {
  handle: string;
  displayName: string;
  bio: string;
  followers: number;
  following: number;
  /** Points hosted so far (all time). */
  pointsHosted: number;
  joined: string;
  /** Shown as a small check next to the name. */
  verified?: boolean;
  avatarUri?: string | null;
  recaps: PointRecap[];
  contact: HostContact;
}

/**
 * How to reach a host. When visibility is 'private' the app never receives the email or phone;
 * people send a request instead and the host chooses whether to share them.
 */
export interface HostContact {
  visibility: 'public' | 'private';
  email?: string;
  phone?: string;
}

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number, hour = 19) => {
  const date = new Date(Date.now() - days * DAY);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

/**
 * Stand-in photos (random stock images from picsum.photos, fixed per seed so they don't change
 * between launches). Real recaps carry the URLs of the photos the host uploaded.
 */
function samplePhotos(handle: string, index: number, count: number): PointRecap['photos'] {
  const slug = handle.replace('@', '');
  const emojis = ['❤️', '🔥', '🙌', '🎉'] as const;
  return Array.from({ length: count }, (_, n) => ({
    id: `photo-${slug}-${index}-${n + 1}`,
    uri: `https://picsum.photos/seed/${slug}${index}${n + 1}/900/900`,
    reactions: { [emojis[(index + n) % emojis.length]]: { count: 3 + ((slug.length * (n + 2)) % 19), mine: false } },
  }));
}

function recap(
  handle: string,
  index: number,
  pointTitle: string,
  where: string,
  days: number,
  text: string,
  reactions: PointRecap['reactions'],
  photoCount = 0,
): PointRecap {
  return {
    id: `recap-${handle.replace('@', '')}-${index}`,
    pointId: `past-${handle.replace('@', '')}-${index}`,
    pointTitle,
    pointStartsAt: daysAgo(days),
    where,
    text,
    photos: samplePhotos(handle, index, photoCount),
    reactions,
    createdAt: daysAgo(days - 1, 10),
  };
}

const PROFILES: HostProfile[] = [
  {
    handle: '@rustyanchor',
    displayName: 'The Rusty Anchor',
    bio: 'Neighborhood bar with a tiny stage. Live jazz and soul Wednesday through Saturday.',
    followers: 1284,
    following: 36,
    pointsHosted: 212,
    joined: 'March 2025',
    verified: true,
    contact: { visibility: 'public', email: 'bookings@rustyanchor.example', phone: '(303) 555-0142' },
    recaps: [
      recap('@rustyanchor', 1, 'Friday Soul Night', 'The Rusty Anchor', 5, 'Packed house and an encore that went past midnight. Thanks for dancing with us!', {
        '🔥': { count: 41, mine: false },
        '🎉': { count: 18, mine: false },
        '❤️': { count: 12, mine: false },
      }, 3),
      recap('@rustyanchor', 2, 'Thursday Jazz Trio', 'The Rusty Anchor', 12, 'Quiet, warm, and the trio played two new originals. Come early for the booths next time.', {
        '❤️': { count: 22, mine: false },
        '👏': { count: 10, mine: false },
      }, 3),
      recap('@rustyanchor', 3, 'Open Jam Night', 'The Rusty Anchor', 19, 'Eleven players signed up and the last set ran until close. Bring your horn!', {
        '🎉': { count: 15, mine: false },
      }, 2),
    ],
  },
  {
    handle: '@mesa4tacos',
    displayName: 'Mesa 4 Tacos',
    bio: 'Birria and al pastor on wheels. Find us at the plaza every Tuesday.',
    followers: 642,
    following: 58,
    pointsHosted: 87,
    joined: 'June 2025',
    contact: { visibility: 'public', phone: '(303) 555-0187' },
    recaps: [
      recap('@mesa4tacos', 1, 'Taco Tuesday Truck Rally', 'Central Park Plaza', 7, 'Sold out of birria by 7:15. Bringing double next week.', {
        '🔥': { count: 23, mine: false },
        '😂': { count: 4, mine: false },
      }, 3),
      recap('@mesa4tacos', 2, 'Late Night Tacos', 'Pearl Street Mall', 14, 'Al pastor straight off the trompo until 1 a.m. Thanks for the patience in line!', {
        '🔥': { count: 31, mine: false },
        '🙌': { count: 9, mine: false },
      }, 3),
    ],
  },
  {
    handle: '@dinkcrew',
    displayName: 'Dink Crew',
    bio: 'Friendly pickleball open play, all levels. Paddles to borrow, no egos.',
    followers: 310,
    following: 44,
    pointsHosted: 64,
    joined: 'April 2025',
    contact: { visibility: 'private' },
    recaps: [],
  },
  {
    handle: '@creeksidemarket',
    displayName: 'Creekside Market',
    bio: 'Evening farmers market by the creek. 30+ local growers, bakers and makers.',
    followers: 2045,
    following: 112,
    pointsHosted: 58,
    joined: 'May 2025',
    verified: true,
    contact: { visibility: 'public', email: 'hello@creeksidemarket.example', phone: '(303) 555-0119' },
    recaps: [
      recap('@creeksidemarket', 1, 'Evening Farmers Market', 'Boulder Creek Pavilion', 7, 'First peaches of the season went fast. Thank you for supporting local growers!', {
        '❤️': { count: 37, mine: false },
        '🙌': { count: 15, mine: false },
      }, 3),
    ],
  },
  {
    handle: '@meeplecafe',
    displayName: 'Meeple Café',
    bio: 'Board game café with 600+ games and teachers who will explain the rules for you.',
    followers: 877,
    following: 23,
    pointsHosted: 141,
    joined: 'February 2025',
    contact: { visibility: 'public', email: 'events@meeplecafe.example', phone: '(303) 555-0163' },
    recaps: [
      recap('@meeplecafe', 1, 'Board Game Night', 'Meeple Café', 7, '14 tables, one epic six-hour game of Twilight Imperium. Same time next week.', {
        '🎉': { count: 19, mine: false },
        '😂': { count: 7, mine: false },
      }, 2),
    ],
  },
  {
    handle: '@laughinggoat',
    displayName: 'The Laughing Goat',
    bio: 'Coffeehouse by day, open mic by night. Comedy, poetry and acoustic sets.',
    followers: 1530,
    following: 87,
    pointsHosted: 176,
    joined: 'January 2025',
    contact: { visibility: 'public', email: 'openmic@laughinggoat.example' },
    recaps: [],
  },
  {
    handle: '@greenboulder',
    displayName: 'Green Boulder',
    bio: 'Volunteer cleanups along creeks and trails. Show up for an hour and make a difference.',
    followers: 498,
    following: 140,
    pointsHosted: 33,
    joined: 'July 2025',
    contact: { visibility: 'public', email: 'volunteer@greenboulder.example' },
    recaps: [
      recap('@greenboulder', 1, 'Creek Path Cleanup', 'Boulder Creek Path', 14, '22 volunteers, 31 bags of trash and one very confused shopping cart. Great work, everyone.', {
        '🙌': { count: 26, mine: false },
        '❤️': { count: 14, mine: false },
        '👏': { count: 9, mine: false },
      }, 3),
    ],
  },
  {
    handle: '@oldtownarts',
    displayName: 'Old Town Arts',
    bio: 'Gallery collective running the First Wednesday art walk and artist talks.',
    followers: 1102,
    following: 205,
    pointsHosted: 47,
    joined: 'March 2025',
    contact: { visibility: 'public', email: 'artwalk@oldtownarts.example', phone: '(303) 555-0175' },
    recaps: [],
  },
  {
    handle: '@flowwithmaya',
    displayName: 'Maya R.',
    bio: 'Yoga teacher. Gentle outdoor flows at golden hour, all levels welcome.',
    followers: 389,
    following: 171,
    pointsHosted: 52,
    joined: 'May 2025',
    contact: { visibility: 'private' },
    recaps: [
      recap('@flowwithmaya', 1, 'Golden Hour Yoga in the Park', 'Wonderland Hills', 6, 'The sunset tonight was unreal. Thank you for flowing with me.', {
        '❤️': { count: 21, mine: false },
        '🙌': { count: 6, mine: false },
      }, 2),
    ],
  },
  {
    handle: '@quizmasterjen',
    displayName: 'Quizmaster Jen',
    bio: 'Host of Wednesday Pub Trivia. Six rounds, terrible puns, real prizes.',
    followers: 724,
    following: 64,
    pointsHosted: 98,
    joined: 'April 2025',
    contact: { visibility: 'private' },
    recaps: [],
  },
  {
    handle: '@codeandcoffee',
    displayName: 'Code & Coffee',
    bio: 'Monthly meetups for Go, Kotlin and GIS developers. Lightning talks and pizza.',
    followers: 956,
    following: 48,
    pointsHosted: 29,
    joined: 'February 2025',
    verified: true,
    contact: { visibility: 'public', email: 'organizers@codeandcoffee.example' },
    recaps: [
      recap('@codeandcoffee', 1, 'Go & Kotlin Devs Monthly Social', 'Downtown Tech Lab', 28, 'Great talks on PostGIS indexing and Compose maps. Slides are linked on our site.', {
        '👏': { count: 17, mine: false },
        '🔥': { count: 8, mine: false },
      }, 1),
    ],
  },
  {
    handle: '@trailtribe',
    displayName: 'Trail Tribe',
    bio: 'Sunrise hikes and weekend trail runs on the Front Range. Headlamps recommended.',
    followers: 1377,
    following: 90,
    pointsHosted: 120,
    joined: 'March 2025',
    contact: { visibility: 'private' },
    recaps: [],
  },
];

const BY_HANDLE = new Map(PROFILES.map((profile) => [profile.handle.toLowerCase(), profile]));

function normalizeHandle(handle: string): string {
  const clean = handle.trim().replace(/^@+/, '').toLowerCase();
  return `@${clean}`;
}

/** Profile for a handle, or a simple stand-in for hosts we don't have details for yet. */
export function getHostProfile(handle: string): HostProfile {
  const key = normalizeHandle(handle);
  return (
    BY_HANDLE.get(key) ?? {
      handle: key,
      displayName: key.slice(1),
      bio: '',
      followers: 0,
      following: 0,
      pointsHosted: 0,
      joined: '',
      recaps: [],
      contact: { visibility: 'private' },
    }
  );
}

// Who you follow (in memory for now; POST/DELETE /me/following/:handle later).
let following = new Set<string>();
const followListeners = new Set<() => void>();

export function isFollowing(handle: string): boolean {
  return following.has(normalizeHandle(handle));
}

export function setFollowing(handle: string, follow: boolean) {
  const key = normalizeHandle(handle);
  if (following.has(key) === follow) return;
  const next = new Set(following);
  if (follow) next.add(key);
  else next.delete(key);
  following = next;
  followListeners.forEach((listener) => listener());
}

/** Handles you follow; re-renders the caller when you follow or unfollow someone. */
export function useFollowing(): string[] {
  const [handles, setHandles] = useState(() => [...following]);
  useEffect(() => {
    const listener = () => setHandles([...following]);
    followListeners.add(listener);
    listener(); // catch changes made before this screen mounted
    return () => {
      followListeners.delete(listener);
    };
  }, []);
  return handles;
}

// Contact requests you've sent (in memory for now). Server side later:
//   POST   /users/:handle/contact-requests   { message }
//   DELETE /users/:handle/contact-requests/me
// The host sees requests in Activity and accepts or declines; accepting shares their details
// with you. The request never shows your own contact details unless the host accepts.
export interface ContactRequest {
  handle: string;
  message: string;
  status: 'pending' | 'accepted' | 'declined';
  sentAt: string;
}

const contactRequests = new Map<string, ContactRequest>();

export function getContactRequest(handle: string): ContactRequest | null {
  return contactRequests.get(normalizeHandle(handle)) ?? null;
}

export function requestContact(handle: string, message: string): ContactRequest {
  const request: ContactRequest = {
    handle: normalizeHandle(handle),
    message: message.trim(),
    status: 'pending',
    sentAt: new Date().toISOString(),
  };
  contactRequests.set(request.handle, request);
  return request;
}

export function cancelContactRequest(handle: string) {
  contactRequests.delete(normalizeHandle(handle));
}
