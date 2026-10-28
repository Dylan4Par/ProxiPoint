/**
 * The allowed #tags. People pick from this list (Create Drop, filters, followed tags, channels,
 * Series); they can't invent their own, which keeps tags tidy and matchable. The list itself is
 * generated from data/hashtag-taxonomy.xlsx (scripts/build_hashtags.py → hashtagList.ts); the
 * server should hold the same list and reject anything else.
 */
import {
  HASHTAG_CATEGORIES,
  HASHTAG_LIST,
  type HashtagCategory,
  type HashtagCategoryId,
  type HashtagEntry,
} from './hashtagList';

export { HASHTAG_CATEGORIES, HASHTAG_LIST };
export type { HashtagCategory, HashtagCategoryId, HashtagEntry };

/** "#LiveMusic" / "livemusic" / "Live_Music" → "livemusic". */
export const tagKey = (tag: string) => tag.replace(/^#+/, '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();

/**
 * Tags used before the list existed (and common spellings), mapped onto a listed tag so saved
 * Drops, filters and followed tags carry over. Anything not here and not listed is dropped.
 */
const LEGACY: Record<string, string> = {
  // Music & nightlife
  music: 'LiveMusic', livemusic: 'LiveMusic', soul: 'LiveMusic', blues: 'LiveMusic', bluegrass: 'LiveMusic',
  rock: 'LiveMusic', acoustic: 'LiveMusic', songwriters: 'LiveMusic', concert: 'LiveMusic', band: 'LiveMusic',
  vinyl: 'DJSet', vinylnight: 'DJSet', records: 'DJSet', dj: 'DJSet', nightlife: 'DJSet',
  brewery: 'CraftBeer', pub: 'CraftBeer', beer: 'CraftBeer', wine: 'WineTasting',
  poetry: 'PoetrySlam', standup: 'Comedy',
  // Games & social
  trivia: 'BoardGames', trivianight: 'BoardGames', musicbingo: 'BoardGames', catan: 'BoardGames',
  chess: 'BoardGames', strategy: 'BoardGames', tabletop: 'BoardGames',
  dogs: 'DogFriendly', crafts: 'MakersAndCrafts', makers: 'MakersAndCrafts', network: 'Networking',
  // Food
  tacotuesday: 'Tacos', taco: 'Tacos', localfood: 'FarmersMarket', honey: 'FarmersMarket',
  foodtruck: 'FoodTrucks', dumplings: 'FoodTrucks', dessert: 'Baking', bbqnight: 'BBQ',
  // Sports & outdoors
  openplay: 'Pickleball', drills: 'Pickleball', league: 'Pickleball', '5k': 'RunClub', running: 'RunClub',
  nighthike: 'Hiking', hike: 'Hiking',
  // Arts
  art: 'ArtWalk', murals: 'ArtWalk', localartists: 'ArtWalk', gallery: 'GalleryOpening', ceramics: 'Pottery',
  movies: 'FilmScreening', film: 'FilmScreening', theatre: 'Theater',
  // Tech
  gis: 'TechMeetup', postgis: 'TechMeetup', kotlin: 'TechMeetup', webdev: 'TechMeetup',
  reactnative: 'TechMeetup', opendata: 'TechMeetup', ai: 'AIandRobotics',
  // Community & family
  volunteering: 'Volunteer', creekcleanup: 'CleanUp', foodbank: 'MutualAid', community: 'Civic',
  kidfriendly: 'FamilyFriendly', family: 'FamilyFriendly', kids: 'FamilyFriendly',
};

const BY_KEY = new Map<string, HashtagEntry>(HASHTAG_LIST.map((entry) => [tagKey(entry.tag), entry]));
const CATEGORY_BY_ID = new Map<HashtagCategoryId, HashtagCategory>(HASHTAG_CATEGORIES.map((c) => [c.id, c]));

/** The listed tag this means (exact, any case, or an old spelling), or null if it isn't allowed. */
export function findHashtag(input: string | null | undefined): HashtagEntry | null {
  const key = tagKey(input ?? '');
  if (!key) return null;
  const direct = BY_KEY.get(key);
  if (direct) return direct;
  const legacy = LEGACY[key];
  return legacy ? BY_KEY.get(tagKey(legacy)) ?? null : null;
}

/** "#LiveMusic" for anything that maps to it, otherwise null. */
export function canonicalTag(input: string | null | undefined): string | null {
  return findHashtag(input)?.tag ?? null;
}

export function isListedTag(input: string | null | undefined): boolean {
  return BY_KEY.has(tagKey(input ?? ''));
}

/** Maps tags onto the list: old spellings become listed tags, unknown ones are dropped, no repeats. */
export function canonicalizeTags(tags: readonly (string | null | undefined)[] | null | undefined): string[] {
  const out: string[] = [];
  for (const tag of tags ?? []) {
    const canonical = canonicalTag(tag);
    if (canonical && !out.includes(canonical)) out.push(canonical);
  }
  return out;
}

export function hashtagCategory(id: HashtagCategoryId): HashtagCategory | null {
  return CATEGORY_BY_ID.get(id) ?? null;
}

/** The category a tag is in (via the list), or null for a tag that isn't listed. */
export function categoryOfTag(tag: string | null | undefined): HashtagCategory | null {
  const entry = findHashtag(tag);
  return entry ? hashtagCategory(entry.category) : null;
}

/**
 * Listed tags matching what's typed, best first: name starts with it, then a word in the name
 * starts with it ("Beer" → #CraftBeer), then the name contains it, then the description or
 * category does, then old spellings ("taco" → #Tacos). Empty query → nothing.
 */
export function searchHashtags(
  query: string,
  { exclude = [], limit = 8 }: { exclude?: readonly string[]; limit?: number } = {},
): HashtagEntry[] {
  const q = tagKey(query);
  if (!q) return [];
  const skip = new Set(exclude.map(tagKey));
  const scored: Array<{ entry: HashtagEntry; score: number; index: number }> = [];
  HASHTAG_LIST.forEach((entry, index) => {
    const key = tagKey(entry.tag);
    if (skip.has(key)) return;
    const words = entry.tag.replace(/^#/, '').split(/(?=[A-Z][a-z])|_/).map((w) => w.toLowerCase());
    const category = hashtagCategory(entry.category)?.label.toLowerCase() ?? '';
    let score = 0;
    if (key.startsWith(q)) score = 5;
    else if (words.some((word) => word.startsWith(q))) score = 4;
    else if (key.includes(q)) score = 3;
    else if (q.length >= 3 && (entry.description.toLowerCase().includes(q) || category.includes(q))) score = 2;
    if (score) scored.push({ entry, score, index });
  });
  // Old spellings: "taco" → #Tacos, "trivia" → #BoardGames.
  Object.entries(LEGACY).forEach(([old, tag]) => {
    if (!old.startsWith(q)) return;
    const entry = BY_KEY.get(tagKey(tag));
    if (!entry || skip.has(tagKey(entry.tag)) || scored.some((s) => s.entry === entry)) return;
    scored.push({ entry, score: 1, index: HASHTAG_LIST.indexOf(entry) });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((s) => s.entry);
}

/** The tag to add when someone presses return after typing: an exact (or old) match, else the best match. */
export function bestHashtagFor(query: string, exclude: readonly string[] = []): string | null {
  const exact = findHashtag(query);
  if (exact && !exclude.some((t) => tagKey(t) === tagKey(exact.tag))) return exact.tag;
  return searchHashtags(query, { exclude, limit: 1 })[0]?.tag ?? null;
}
