import { calculateDistanceMeters } from './locationFilter';
import type { ChannelPost, PostPlace } from './channels';

/**
 * Places: the parks, venues, trails, intersections and buildings people post about. Every post
 * with a place stays tied to it for good (its map pin is what expires), so each Place gathers a
 * history of conversations: its tips, answered questions and heads-ups.
 * Pure (no React) so it's testable and the server can run the same rules.
 *
 * Sample places for now; server side later they come from OpenStreetMap features stored in
 * PostGIS (GET /places?lat&lon&q), plus Point venues.
 */

export type PlaceKind = 'venue' | 'park' | 'trail' | 'intersection' | 'building' | 'plaza' | 'block';

export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  venue: 'Venue',
  park: 'Park',
  trail: 'Trail',
  intersection: 'Intersection',
  building: 'Building',
  plaza: 'Plaza',
  block: 'Block',
};

export interface LocalPlace {
  id: string;
  name: string;
  kind: PlaceKind;
  latitude: number;
  longitude: number;
  /** e.g. "Erie, CO" */
  area?: string;
}

/** Two places closer than this with the same name are one place. */
export const SAME_PLACE_METERS = 75;
/** Points within this distance of a place are "at" it. */
export const POINTS_AT_PLACE_METERS = 120;
/** How far back "Best tips" looks. */
export const TIPS_WINDOW_DAYS = 365;

// Placed the same way as the sample Points and posts (meters east/north of the default spot).
const ORIGIN = { latitude: 40.061708, longitude: -105.038292 };
function at(east: number, north: number) {
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos((ORIGIN.latitude * Math.PI) / 180);
  return { latitude: ORIGIN.latitude + north / metersPerDegLat, longitude: ORIGIN.longitude + east / metersPerDegLon };
}

export const SAMPLE_PLACES: LocalPlace[] = [
  { id: 'pl-rusty-anchor', name: 'The Rusty Anchor', kind: 'venue', ...at(-260, 180), area: 'Erie, CO' },
  { id: 'pl-meadow-park', name: 'Meadow Park Courts', kind: 'park', ...at(-700, -350), area: 'Erie, CO' },
  { id: 'pl-central-plaza', name: 'Central Park Plaza', kind: 'plaza', ...at(340, 420), area: 'Erie, CO' },
  { id: 'pl-mesa-trailhead', name: 'Mesa Trailhead', kind: 'trail', ...at(-900, 900), area: 'Erie, CO' },
  { id: 'pl-briggs-main', name: 'Briggs St & Main St', kind: 'intersection', ...at(120, -60), area: 'Erie, CO' },
  { id: 'pl-erie-library', name: 'Erie Community Library', kind: 'building', ...at(-150, -520), area: 'Erie, CO' },
  { id: 'pl-coal-creek', name: 'Coal Creek Trail', kind: 'trail', ...at(1100, -260), area: 'Erie, CO' },
  { id: 'pl-community-park', name: 'Erie Community Park', kind: 'park', ...at(620, -820), area: 'Erie, CO' },
  { id: 'pl-brickhouse', name: 'The Brickhouse', kind: 'venue', ...at(210, 260), area: 'Erie, CO' },
];

/** A post's place, pointing at a LocalPlace. */
export function placeRef(place: LocalPlace, pointId?: string): PostPlace {
  return { latitude: place.latitude, longitude: place.longitude, label: place.name, placeId: place.id, placeKind: place.kind, pointId };
}

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const distance = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) =>
  calculateDistanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);

export interface VenueNode {
  id: string;
  venue?: string;
  latitude?: number;
  longitude?: number;
  /** Set when the host hid the exact spot: never becomes a place. */
  locationPrivacy?: unknown;
}

/**
 * Every place the app knows: the sample (later: server) places, Point venues that aren't one of
 * them yet, and places that only exist on posts (a block someone posted from). One entry per place.
 */
export function buildPlaceIndex(
  places: LocalPlace[],
  nodes: VenueNode[] | Record<string, VenueNode> | null | undefined,
  posts: Array<Pick<ChannelPost, 'place'>> = [],
): LocalPlace[] {
  const index = [...places];
  const known = (name: string, spot: { latitude: number; longitude: number }) =>
    index.some((place) => norm(place.name) === norm(name) && distance(place, spot) <= SAME_PLACE_METERS);
  for (const node of Array.isArray(nodes) ? nodes : Object.values(nodes ?? {})) {
    if (!node?.venue || node.locationPrivacy || typeof node.latitude !== 'number' || typeof node.longitude !== 'number') continue;
    const spot = { latitude: node.latitude, longitude: node.longitude };
    if (known(node.venue, spot)) continue;
    index.push({ id: `venue-${node.id}`, name: node.venue, kind: 'venue', ...spot });
  }
  for (const post of posts) {
    const place = post.place;
    if (!place?.placeId || index.some((known) => known.id === place.placeId)) continue;
    index.push({
      id: place.placeId,
      name: place.label,
      kind: place.placeKind ?? 'block',
      latitude: place.latitude,
      longitude: place.longitude,
    });
  }
  return index;
}

/** Places matching a search, best first: name starts with it, then contains it, then its kind. */
export function searchLocalPlaces(
  places: LocalPlace[],
  query: string,
  center?: { latitude: number; longitude: number } | null,
  limit = 6,
): LocalPlace[] {
  const q = norm(query.replace(/^[#@]|^c\//i, ''));
  if (q.length < 2) return [];
  return places
    .filter((place) => place.kind !== 'block')
    .map((place) => {
      const name = norm(place.name);
      const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : norm(PLACE_KIND_LABEL[place.kind]).startsWith(q) ? 2 : 9;
      return { place, score, meters: center ? distance(center, place) : 0 };
    })
    .filter((entry) => entry.score < 9)
    .sort((a, b) => a.score - b.score || a.meters - b.meters || a.place.name.localeCompare(b.place.name))
    .slice(0, limit)
    .map((entry) => entry.place);
}

/** Closest places first (blocks left out). */
export function placesNear(places: LocalPlace[], center: { latitude: number; longitude: number }, limit = 8): LocalPlace[] {
  return places
    .filter((place) => place.kind !== 'block')
    .map((place) => ({ place, meters: distance(center, place) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit)
    .map((entry) => entry.place);
}

/**
 * The block you're on as a place (about 100 m, never your exact spot), named after the closest
 * known place: "Near Briggs St & Main St". Someone reading the post sees where, not "near you".
 */
export function blockPlace(
  places: LocalPlace[],
  snapped: { latitude: number; longitude: number },
  maxMeters = 400,
): LocalPlace {
  const [closest] = placesNear(places, snapped, 1);
  const name = closest && distance(closest, snapped) <= maxMeters ? `Near ${closest.name}` : 'Nearby block';
  return {
    id: `block-${snapped.latitude.toFixed(3)}_${snapped.longitude.toFixed(3)}`,
    name,
    kind: 'block',
    latitude: snapped.latitude,
    longitude: snapped.longitude,
  };
}

/** Posts about a place: tied to it by id (or, for older posts, by its name close by). */
export function postsAtPlace<T extends Pick<ChannelPost, 'place'>>(posts: T[], place: LocalPlace): T[] {
  return posts.filter((post) => {
    const p = post.place;
    if (!p) return false;
    if (p.placeId) return p.placeId === place.id;
    return norm(p.label) === norm(place.name) && distance(p, place) <= SAME_PLACE_METERS;
  });
}

/** Points happening at (or right by) a place. */
export function pointsAtPlace<T extends VenueNode>(nodes: T[], place: LocalPlace): T[] {
  return nodes.filter((node) => {
    if (typeof node.latitude !== 'number' || typeof node.longitude !== 'number') return false;
    if (node.venue && norm(node.venue) === norm(place.name)) return true;
    return distance({ latitude: node.latitude, longitude: node.longitude }, place) <= POINTS_AT_PLACE_METERS;
  });
}

/**
 * "Best tips" for a place: tips and questions from the last year, most upvoted first (an answered
 * question is as useful as a tip). These are what make a place worth opening months later.
 */
export function bestTips<T extends Pick<ChannelPost, 'kind' | 'upvotes' | 'createdAt'>>(posts: T[], now = Date.now(), limit = 5): T[] {
  const since = now - TIPS_WINDOW_DAYS * 24 * 3600000;
  return posts
    .filter((post) => (post.kind === 'tip' || post.kind === 'question') && new Date(post.createdAt).getTime() >= since)
    .sort((a, b) => b.upvotes - a.upvotes || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
