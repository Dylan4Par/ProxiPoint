import type { Channel, ChannelPost, PostComment } from './channels';
import type { HostProfile } from './hostProfiles';
import type { LocalPlace } from './localPlaces';

/**
 * Des Moines demo: bar-league and tournament nights (trivia, pool, darts, cornhole) at nine real
 * Des Moines bars, run by four made-up local organizers, each with its own channel. Sample data
 * for screenshots in partner outreach (see the partner one-pager); nothing here is real. The bars
 * are real places, the events, organizers, players and posts are not, so label any screenshot as
 * a mockup.
 *
 * Everything is in this one file: delete it and the few lines that import it to remove the demo.
 * To see it, put the device (or emulator) location in Des Moines, e.g. 41.5868, -93.6250.
 */

export const DES_MOINES = { latitude: 41.5868, longitude: -93.625 };

export type DsmGame = 'trivia' | 'pool' | 'darts' | 'cornhole';

interface DsmVenue {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

// Coordinates from Geocodio (rooftop, or address-range for Walker’s Place and Big Dog Billiards), Nov 2026.
const VENUES = {
  walkers: { id: 'dsm-walkers', name: 'Walker’s Place', address: '475 NE Broadway Ave, Des Moines, IA 50313', latitude: 41.644189, longitude: -93.61298 },
  ricochet: { id: 'dsm-ricochet', name: 'Ricochet', address: '400 Locust St Ste 105, Des Moines, IA 50309', latitude: 41.587132, longitude: -93.622805 },
  cheapSeats: { id: 'dsm-cheap-seats', name: 'Cheap Seats Sports Bar', address: '2301 Hubbell Ave, Des Moines, IA 50317', latitude: 41.603784, longitude: -93.574133 },
  greenwood: { id: 'dsm-greenwood', name: 'Greenwood Lounge', address: '3707 Ingersoll Ave, Des Moines, IA 50312', latitude: 41.586524, longitude: -93.667299 },
  gt: { id: 'dsm-gt', name: 'GT', address: '3013 Ingersoll Ave, Des Moines, IA 50312', latitude: 41.586292, longitude: -93.658546 },
  johnnys: { id: 'dsm-johnnys', name: 'Johnny’s Hall of Fame', address: '302 Court Ave, Des Moines, IA 50309', latitude: 41.585086, longitude: -93.620561 },
  toads: { id: 'dsm-toads', name: 'Toads Tavern', address: '3002 State Ave, Des Moines, IA 50317', latitude: 41.60163, longitude: -93.558231 },
  bigDog: { id: 'dsm-big-dog', name: 'Big Dog Billiards', address: '4510 NE 14th St, Des Moines, IA 50313', latitude: 41.642016, longitude: -93.600302 },
  thirsty: { id: 'dsm-thirsty', name: 'Thirsty Sportsman', address: '4808 SW 9th St, Des Moines, IA 50315', latitude: 41.540346, longitude: -93.626327 },
} satisfies Record<string, DsmVenue>;
type VenueKey = keyof typeof VENUES;

/**
 * Photos of each game, from the tag-photo collection in Spaces (tools/tag-photos in
 * overwatchcore-ingest; Pexels photos). Each is uploaded as a 1200x675 "wide" crop and a 400x400
 * "square" one; these are the wide ones. Empty = seeded stock stand-ins.
 */
const TAG_PHOTOS = 'https://proxipoint-assets.sfo3.cdn.digitaloceanspaces.com/tag-photos/tags/';
export const DSM_PHOTOS: Record<DsmGame, string[]> = {
  trivia: [`${TAG_PHOTOS}trivia-night/01-93c2e2fc-wide.jpg`, `${TAG_PHOTOS}trivia-night/02-575ac999-wide.jpg`],
  pool: [`${TAG_PHOTOS}billiards/01-261c1aed-wide.jpg`, `${TAG_PHOTOS}billiards/02-aea50b52-wide.jpg`],
  darts: [`${TAG_PHOTOS}darts/01-26946c68-wide.jpg`, `${TAG_PHOTOS}darts/02-d337bebc-wide.jpg`],
  cornhole: [`${TAG_PHOTOS}cornhole/01-33ec5ff9-wide.jpg`, `${TAG_PHOTOS}cornhole/02-82a4d597-wide.jpg`],
};

/**
 * The n-th photo of a game (wraps around), or a fixed stand-in when the game has none. 'square'
 * picks the 400x400 crop, for small round spots (event covers on cards, avatars).
 */
export function dsmPhoto(game: DsmGame, n: number, seed: string, shape: 'wide' | 'square' = 'wide'): string {
  const list = DSM_PHOTOS[game];
  if (list.length === 0) return shape === 'square' ? `https://picsum.photos/seed/${seed}/600/600` : `https://picsum.photos/seed/${seed}/1200/900`;
  const wide = list[n % list.length];
  return shape === 'square' ? wide.replace(/-wide\.jpg$/, '-square.jpg') : wide;
}

// ---- Organizers ---------------------------------------------------------------------------

const ORGANIZER: Record<DsmGame, { handle: string; name: string; bio: string; followers: number; channel: string }> = {
  trivia: {
    handle: '@dsmtrivia',
    name: 'DSM Trivia Co.',
    bio: 'Pub trivia six nights a week across Des Moines. Teams of up to six, free to play, bar tabs for the winners.',
    followers: 1460,
    channel: 'dsm-trivia',
  },
  pool: {
    handle: '@dsmpoolleague',
    name: 'Des Moines Pool League',
    bio: 'Handicapped 8-ball and 9-ball team leagues, plus weekend tournaments. New players placed on a team.',
    followers: 820,
    channel: 'dsm-pool',
  },
  darts: {
    handle: '@dsmdarts',
    name: 'DSM Darts Association',
    bio: 'Steel-tip and soft-tip leagues and blind-draw tournaments in bars all over the metro.',
    followers: 540,
    channel: 'dsm-darts',
  },
  cornhole: {
    handle: '@dsmcornhole',
    name: 'Des Moines Cornhole Club',
    bio: 'Indoor cornhole all winter: weekly leagues, bag tournaments and a season-end championship.',
    followers: 690,
    channel: 'dsm-cornhole',
  },
};

export const DSM_PROFILES: HostProfile[] = (Object.keys(ORGANIZER) as DsmGame[]).map((game, i) => {
  const org = ORGANIZER[game];
  return {
    handle: org.handle,
    displayName: org.name,
    bio: org.bio,
    followers: org.followers,
    following: 12 + i * 7,
    pointsHosted: 180 + i * 61,
    joined: 'August 2025',
    avatarUri: dsmPhoto(game, 0, `dsm-avatar-${game}`, 'square'),
    recaps: [],
    contact: { visibility: 'private' },
  };
});

// ---- Points -------------------------------------------------------------------------------

/** One game night. `start`: minutes from now (today, so the map always has something on), or a day + clock time. */
type Night = [
  id: string,
  venue: VenueKey,
  game: DsmGame,
  kind: 'league' | 'tournament',
  start: number | { dayOffset: number; hour: number; minute: number },
  lengthMin: number,
  going: number,
];

const day = (dayOffset: number, hour: number, minute = 0) => ({ dayOffset, hour, minute });

const NIGHTS: Night[] = [
  // Today: one per bar, some on now, the rest starting through the evening.
  ['dsm-johnnys-trivia', 'johnnys', 'trivia', 'league', -40, 120, 52],
  ['dsm-bigdog-8ball', 'bigDog', 'pool', 'league', -60, 180, 24],
  ['dsm-walkers-9ball', 'walkers', 'pool', 'tournament', -20, 240, 28],
  ['dsm-ricochet-darts', 'ricochet', 'darts', 'league', 45, 180, 18],
  ['dsm-toads-bags', 'toads', 'cornhole', 'tournament', 60, 180, 32],
  ['dsm-cheapseats-bags', 'cheapSeats', 'cornhole', 'league', 90, 150, 22],
  ['dsm-gt-trivia', 'gt', 'trivia', 'league', 120, 120, 41],
  ['dsm-greenwood-darts', 'greenwood', 'darts', 'tournament', 150, 210, 20],
  ['dsm-thirsty-trivia', 'thirsty', 'trivia', 'league', 180, 120, 36],
  // The rest of the week.
  ['dsm-johnnys-darts', 'johnnys', 'darts', 'tournament', day(1, 19, 0), 210, 24],
  ['dsm-ricochet-trivia', 'ricochet', 'trivia', 'league', day(1, 19, 30), 120, 47],
  ['dsm-bigdog-darts', 'bigDog', 'darts', 'league', day(1, 19, 0), 180, 16],
  ['dsm-cheapseats-pool', 'cheapSeats', 'pool', 'league', day(1, 19, 0), 180, 20],
  ['dsm-toads-trivia', 'toads', 'trivia', 'league', day(2, 19, 0), 120, 38],
  ['dsm-greenwood-pool', 'greenwood', 'pool', 'league', day(2, 19, 30), 180, 18],
  ['dsm-gt-bags', 'gt', 'cornhole', 'league', day(2, 18, 30), 150, 24],
  ['dsm-thirsty-darts', 'thirsty', 'darts', 'league', day(2, 19, 0), 180, 14],
  ['dsm-walkers-trivia', 'walkers', 'trivia', 'tournament', day(3, 19, 0), 150, 58],
  ['dsm-johnnys-bags', 'johnnys', 'cornhole', 'league', day(3, 18, 30), 150, 26],
  ['dsm-bigdog-9ball', 'bigDog', 'pool', 'tournament', day(3, 18, 0), 300, 32],
  ['dsm-ricochet-bags', 'ricochet', 'cornhole', 'tournament', day(4, 13, 0), 240, 40],
  ['dsm-cheapseats-darts', 'cheapSeats', 'darts', 'tournament', day(4, 14, 0), 240, 22],
  ['dsm-toads-pool', 'toads', 'pool', 'league', day(4, 19, 0), 180, 16],
  ['dsm-greenwood-trivia', 'greenwood', 'trivia', 'league', day(4, 19, 30), 120, 33],
  ['dsm-gt-pool', 'gt', 'pool', 'tournament', day(5, 14, 0), 300, 24],
  ['dsm-thirsty-bags', 'thirsty', 'cornhole', 'tournament', day(5, 12, 0), 300, 36],
  ['dsm-walkers-darts', 'walkers', 'darts', 'league', day(5, 19, 0), 180, 12],
  ['dsm-johnnys-pool', 'johnnys', 'pool', 'league', day(6, 19, 0), 180, 18],
  ['dsm-ricochet-pool', 'ricochet', 'pool', 'tournament', day(6, 13, 0), 300, 28],
  ['dsm-cheapseats-trivia', 'cheapSeats', 'trivia', 'tournament', day(6, 18, 0), 180, 54],
  ['dsm-toads-darts', 'toads', 'darts', 'tournament', day(6, 14, 0), 240, 20],
  ['dsm-greenwood-bags', 'greenwood', 'cornhole', 'league', day(6, 18, 30), 150, 20],
  ['dsm-gt-darts', 'gt', 'darts', 'league', day(6, 19, 0), 180, 14],
  ['dsm-thirsty-pool', 'thirsty', 'pool', 'league', day(6, 19, 0), 180, 16],
  ['dsm-walkers-bags', 'walkers', 'cornhole', 'league', day(6, 18, 30), 150, 18],
  ['dsm-bigdog-trivia', 'bigDog', 'trivia', 'league', day(6, 19, 30), 120, 30],
];

const TAGS: Record<DsmGame, Record<'league' | 'tournament', string[]>> = {
  trivia: { league: ['#TriviaNight', '#Trivia', '#BarTrivia'], tournament: ['#TriviaTournament', '#Trivia', '#BarTrivia'] },
  pool: { league: ['#Billiards', '#PoolHall'], tournament: ['#PoolTournament', '#Billiards'] },
  darts: { league: ['#Darts'], tournament: ['#DartsTournament', '#Darts'] },
  cornhole: { league: ['#Cornhole'], tournament: ['#Cornhole', '#BarGames'] },
};

const TITLE: Record<DsmGame, Record<'league' | 'tournament', string>> = {
  trivia: { league: 'Pub Trivia League', tournament: 'Trivia Tournament of Champions' },
  pool: { league: '8-Ball League Night', tournament: '9-Ball Open Tournament' },
  darts: { league: 'Steel-Tip Darts League', tournament: 'Blind Draw Darts Tournament' },
  cornhole: { league: 'Cornhole League Night', tournament: 'Bag Toss Tournament' },
};

const ABOUT: Record<DsmGame, Record<'league' | 'tournament', string>> = {
  trivia: {
    league: 'Seven rounds, teams of up to six, free to play. Weekly standings; top team takes a $50 bar tab.',
    tournament: 'This season’s top league teams plus open seats for walk-ins. Three rounds of finals, $250 in prizes.',
  },
  pool: {
    league: 'Handicapped 8-ball team league. Subs welcome; new players get placed on a team. Tables free after 10.',
    tournament: 'Double elimination, race to 5 on the winners’ side. $20 entry, 32 players max, calcutta at the start.',
  },
  darts: {
    league: '501 and cricket team matches, four players a side. Boards open for practice an hour early.',
    tournament: 'Partners drawn at random, so any skill level can win. $10 a player, 100% payout.',
  },
  cornhole: {
    league: 'Rotating-partner league, two games a round. Boards and bags provided; bring your own if you have them.',
    tournament: 'Blind-draw doubles, double elimination. $15 a player, ACL-style boards, cash to the top three teams.',
  },
};

const MAX: Record<DsmGame, Record<'league' | 'tournament', number>> = {
  trivia: { league: 80, tournament: 90 },
  pool: { league: 32, tournament: 32 },
  darts: { league: 24, tournament: 32 },
  cornhole: { league: 32, tournament: 48 },
};

export interface DsmSeedPoint {
  id: string;
  title: string;
  tags: string[];
  venue: string;
  host: string;
  description: string;
  east: number;
  north: number;
  startInMin: number;
  at?: { dayOffset: number; hour: number; minute: number };
  lengthMin: number;
  attendeeCount: number;
  maxAttendance: number | null;
  radiusMeters: number;
  near: { latitude: number; longitude: number };
  /** Posted by the organizer (not listed by @LocalRadar). */
  hostedBy: true;
  coverPhotoUri: string;
}

export const DSM_SEED_POINTS: DsmSeedPoint[] = NIGHTS.map(([id, venueKey, game, kind, start, lengthMin, going], i) => {
  const venue = VENUES[venueKey];
  return {
    id,
    title: TITLE[game][kind],
    tags: TAGS[game][kind],
    venue: venue.name,
    host: ORGANIZER[game].handle,
    description: ABOUT[game][kind],
    east: 0,
    north: 0,
    startInMin: typeof start === 'number' ? start : 0,
    at: typeof start === 'number' ? undefined : start,
    lengthMin,
    attendeeCount: going,
    maxAttendance: MAX[game][kind],
    radiusMeters: going > 40 ? 1000 : 750,
    near: { latitude: venue.latitude, longitude: venue.longitude },
    hostedBy: true,
    coverPhotoUri: dsmPhoto(game, i, id, 'square'),
  };
});

// ---- Places, channels and posts -------------------------------------------------------------

export const DSM_PLACES: LocalPlace[] = Object.values(VENUES).map((venue) => ({
  id: venue.id,
  name: venue.name,
  kind: 'venue',
  latitude: venue.latitude,
  longitude: venue.longitude,
  area: 'Des Moines, IA',
  address: venue.address,
}));

export const DSM_CHANNELS: Channel[] = [
  {
    id: ORGANIZER.trivia.channel,
    name: 'Des Moines Trivia Nights',
    handle: 'c/dsmtrivia',
    description: 'Every pub quiz in the metro, weekly standings, and teams looking for players. Run by DSM Trivia Co.',
    tags: ['#TriviaNight', '#Trivia', '#BarTrivia', '#TriviaTournament', '#PubQuiz'],
    memberCount: 1312,
    joined: true,
    followed: true,
    owner: ORGANIZER.trivia.handle,
  },
  {
    id: ORGANIZER.pool.channel,
    name: 'Des Moines Pool League',
    handle: 'c/dsmpool',
    description: '8-ball and 9-ball leagues, weekend tournaments, open tables and subs needed.',
    tags: ['#Billiards', '#PoolTournament', '#PoolHall'],
    memberCount: 746,
    joined: true,
    followed: true,
    owner: ORGANIZER.pool.handle,
  },
  {
    id: ORGANIZER.darts.channel,
    name: 'DSM Darts',
    handle: 'c/dsmdarts',
    description: 'Steel and soft-tip leagues, blind draws and board reports from bars around Des Moines.',
    tags: ['#Darts', '#DartsTournament'],
    memberCount: 488,
    joined: true,
    followed: true,
    owner: ORGANIZER.darts.handle,
  },
  {
    id: ORGANIZER.cornhole.channel,
    name: 'Des Moines Cornhole',
    handle: 'c/dsmcornhole',
    description: 'Indoor leagues all winter, bag tournaments, and partners wanted.',
    tags: ['#Cornhole'],
    memberCount: 631,
    joined: true,
    followed: true,
    owner: ORGANIZER.cornhole.handle,
  },
];

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

function at(venueKey: VenueKey, pointId?: string): ChannelPost['place'] {
  const venue = VENUES[venueKey];
  return { latitude: venue.latitude, longitude: venue.longitude, label: venue.name, placeId: venue.id, placeKind: 'venue', pointId };
}

export const DSM_POSTS: ChannelPost[] = [
  // Trivia
  {
    id: 'dsm-p1', channelId: 'dsm-trivia', author: '@dsmtrivia', kind: 'heads_up',
    body: 'Round 4 is the picture round tonight at Johnny’s. Still room for two more teams, grab a table by the big screen.',
    createdAt: minutesAgo(12), upvotes: 38, voted: false, confirmations: 4,
    photos: [dsmPhoto('trivia', 1, 'dsm-p1')], place: at('johnnys', 'dsm-johnnys-trivia'), pinnedUntil: hoursFromNow(2),
  },
  {
    id: 'dsm-p2', channelId: 'dsm-trivia', author: '@quizzlybears', kind: 'question',
    body: 'Our team lost two people to a move. Anyone want to join the Quizzly Bears for GT on Wednesdays? We’re mid-table and fun.',
    createdAt: minutesAgo(95), upvotes: 14, voted: false,
  },
  {
    id: 'dsm-p3', channelId: 'dsm-trivia', author: '@dsmtrivia',
    body: 'Week 6 standings: Quizzly Bears hold first by two points, Les Quizerables close behind. Champions tournament at Walker’s in three days.',
    createdAt: minutesAgo(400), upvotes: 61, voted: false,
    photos: [dsmPhoto('trivia', 2, 'dsm-p3'), dsmPhoto('trivia', 3, 'dsm-p3b')],
  },
  // Pool
  {
    id: 'dsm-p4', channelId: 'dsm-pool', author: '@dsmpoolleague', kind: 'heads_up',
    body: '9-ball open is underway at Walker’s: 28 players, winners’ side down to the last 16. Spectators welcome.',
    createdAt: minutesAgo(8), upvotes: 27, voted: false, confirmations: 6,
    photos: [dsmPhoto('pool', 1, 'dsm-p4')], place: at('walkers', 'dsm-walkers-9ball'), pinnedUntil: hoursFromNow(3),
  },
  {
    id: 'dsm-p5', channelId: 'dsm-pool', author: '@railbird_rob', kind: 'question',
    body: 'Team at Big Dog needs a sub for Thursday 8-ball. Skill level 3 to 5, just show up by 6:45.',
    createdAt: minutesAgo(70), upvotes: 11, voted: false,
    place: at('bigDog', 'dsm-bigdog-8ball'),
  },
  {
    id: 'dsm-p6', channelId: 'dsm-pool', author: '@chalkandcue', kind: 'tip',
    body: 'Big Dog just recovered tables 3 through 6. Fastest cloth in town right now, worth the drive.',
    createdAt: minutesAgo(1600), upvotes: 33, voted: false,
    photos: [dsmPhoto('pool', 2, 'dsm-p6')], place: at('bigDog'),
  },
  // Darts
  {
    id: 'dsm-p7', channelId: 'dsm-darts', author: '@dsmdarts', kind: 'heads_up',
    body: 'Blind draw at Greenwood tonight, sign-ups close at 7:15. $10 a player, everything paid back out.',
    createdAt: minutesAgo(30), upvotes: 19, voted: false,
    photos: [dsmPhoto('darts', 1, 'dsm-p7')], place: at('greenwood', 'dsm-greenwood-darts'), pinnedUntil: hoursFromNow(4),
  },
  {
    id: 'dsm-p8', channelId: 'dsm-darts', author: '@tonplus80', kind: 'chat',
    body: 'Hit my first 180 at Ricochet last night in league. Bought the whole board a round, worth it.',
    createdAt: minutesAgo(900), upvotes: 47, voted: false,
    photos: [dsmPhoto('darts', 2, 'dsm-p8')], place: at('ricochet'),
  },
  {
    id: 'dsm-p9', channelId: 'dsm-darts', author: '@dsmdarts', kind: 'tip',
    body: 'Spring league sign-ups are open: steel-tip Tuesdays, soft-tip Thursdays. Teams of four, singles placed on a team.',
    createdAt: minutesAgo(2600), upvotes: 24, voted: false,
  },
  // Cornhole
  {
    id: 'dsm-p10', channelId: 'dsm-cornhole', author: '@dsmcornhole', kind: 'heads_up',
    body: 'Boards are set at Toads for tonight’s bag tournament. 16 teams in, room for a few more. Check in at the bar.',
    createdAt: minutesAgo(20), upvotes: 29, voted: false, confirmations: 3,
    photos: [dsmPhoto('cornhole', 1, 'dsm-p10'), dsmPhoto('cornhole', 2, 'dsm-p10b')], place: at('toads', 'dsm-toads-bags'), pinnedUntil: hoursFromNow(4),
  },
  {
    id: 'dsm-p11', channelId: 'dsm-cornhole', author: '@baggerbeth', kind: 'question',
    body: 'Looking for a partner for the Thirsty Sportsman tournament this weekend. I throw slide bags, averaging about 6 PPR.',
    createdAt: minutesAgo(210), upvotes: 9, voted: false,
    place: at('thirsty', 'dsm-thirsty-bags'),
  },
  {
    id: 'dsm-p12', channelId: 'dsm-cornhole', author: '@dsmcornhole',
    body: 'League night recap from Cheap Seats: 22 throwers, three four-baggers, and a tiebreaker that went to 27. Same time next week.',
    createdAt: minutesAgo(1500), upvotes: 41, voted: false,
    photos: [dsmPhoto('cornhole', 3, 'dsm-p12')], place: at('cheapSeats'),
  },
];

export const DSM_COMMENTS: PostComment[] = [
  { id: 'dsm-c1', postId: 'dsm-p1', parentId: null, author: '@lesquizerables', body: 'Saving the corner booth, see you at 7!', createdAt: minutesAgo(9), upvotes: 5, voted: false },
  { id: 'dsm-c2', postId: 'dsm-p2', parentId: null, author: '@trivianewbie', body: 'I’m in if you’ll take someone who only knows 90s movies.', createdAt: minutesAgo(80), upvotes: 7, voted: false },
  { id: 'dsm-c3', postId: 'dsm-p2', parentId: 'dsm-c2', author: '@quizzlybears', body: 'That’s literally our weakest round. Welcome aboard.', createdAt: minutesAgo(74), upvotes: 9, voted: false },
  { id: 'dsm-c4', postId: 'dsm-p4', parentId: null, author: '@chalkandcue', body: 'Who’s still on the winners’ side?', createdAt: minutesAgo(5), upvotes: 2, voted: false },
  { id: 'dsm-c5', postId: 'dsm-p10', parentId: null, author: '@baggerbeth', body: 'Team Airmail is on the way, save us a spot!', createdAt: minutesAgo(15), upvotes: 4, voted: false },
  { id: 'dsm-c6', postId: 'dsm-p8', parentId: null, author: '@dsmdarts', body: 'Congrats! Added to the league’s 180 board.', createdAt: minutesAgo(860), upvotes: 12, voted: false },
];
