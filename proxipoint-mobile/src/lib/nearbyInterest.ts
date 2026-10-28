import { useEffect, useState } from 'react';
import { calculateDistanceMeters } from './locationFilter';
import { formatRadiusIn, getUnits } from './units';

/**
 * "Nearby people without location sharing": how many people near a place are into a #tag,
 * without showing who, or where any of them are.
 *
 * - Opt-in only ("Count me in" on Profile, off by default).
 * - Each person counts from a ~1 km cell around their HOME AREA (home city, or the default area),
 *   never their live GPS, and never a precise spot.
 * - Counts are only shown from MIN_SHOWN up, and rounded down ("20+"), so a small group, or one
 *   person, can't be picked out by moving the search around.
 * - No list of people, no dots on the map, no distances to anyone.
 * Pure rules plus a tiny in-memory store; server side: GET /interest/counts?tags&lat&lon&radius,
 * computed from opted-in users' cells, with the same threshold and rounding applied there.
 */

/** Fewer people than this: no number at all. */
export const MIN_SHOWN = 10;
/** Cells are this many degrees across (about 1.1 km north-south). */
export const INTEREST_CELL_DEG = 0.01;
/** Default "near" for counts. */
export const INTEREST_RADIUS_METERS = 5000;

export interface InterestMember {
  /** Cell center, never a real position. */
  latitude: number;
  longitude: number;
  /** #tags they follow. */
  tags: string[];
}

const tagKey = (tag: string) => tag.replace(/^#+/, '').trim().toLowerCase();

/** The center of the ~1 km cell a spot falls in. */
export function interestCell(latitude: number, longitude: number): { latitude: number; longitude: number } {
  const snap = (value: number) => (Math.floor(value / INTEREST_CELL_DEG) + 0.5) * INTEREST_CELL_DEG;
  return { latitude: Number(snap(latitude).toFixed(4)), longitude: Number(snap(longitude).toFixed(4)) };
}

/** How many members within `radiusMeters` of `center` follow `tag`. */
export function countInterested(
  members: InterestMember[],
  tag: string,
  center: { latitude: number; longitude: number },
  radiusMeters = INTEREST_RADIUS_METERS,
): number {
  const wanted = tagKey(tag);
  if (!wanted) return 0;
  return members.filter(
    (member) =>
      member.tags.some((t) => tagKey(t) === wanted) &&
      calculateDistanceMeters(center.latitude, center.longitude, member.latitude, member.longitude) <= radiusMeters,
  ).length;
}

/**
 * A count as shown: null below MIN_SHOWN, otherwise rounded down to a step that grows with the
 * number (10+, 15+, 20+, 25+ … 50+, 60+ … 100+, 150+ …).
 */
export function roundedCount(count: number): string | null {
  if (count < MIN_SHOWN) return null;
  const step = count < 50 ? 5 : count < 100 ? 10 : count < 1000 ? 50 : 100;
  return `${(Math.floor(count / step) * step).toLocaleString('en-US')}+`;
}

/** "20+ people into #Pickleball within 5 km" (or "3 mi"), or null when too few to show. */
export function interestLine(count: number, tag: string, radiusMeters = INTEREST_RADIUS_METERS): string | null {
  const shown = roundedCount(count);
  if (!shown) return null;
  return `${shown} people into #${tag.replace(/^#+/, '')} within ${formatRadiusIn(radiusMeters, getUnits())}`;
}

/** The busiest of several #tags (a channel's), with its count. */
export function topInterest(
  members: InterestMember[],
  tags: string[],
  center: { latitude: number; longitude: number },
  radiusMeters = INTEREST_RADIUS_METERS,
): { tag: string; count: number } | null {
  let best: { tag: string; count: number } | null = null;
  for (const tag of tags) {
    const count = countInterested(members, tag, center, radiusMeters);
    if (!best || count > best.count) best = { tag, count };
  }
  return best;
}

// ---- "I'm here" at a live Point -----------------------------------------------------------------

/**
 * People who said "I'm here" at a Point: only while it's live (it switches itself off when the
 * Point ends), shown as a number on that Point only, never as names or dots.
 */
export function hereCountNow(othersHere: number | null | undefined, imHere: boolean, live: boolean): number {
  if (!live) return 0;
  return Math.max(0, othersHere ?? 0) + (imHere ? 1 : 0);
}

export function hereLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? '1 person here now' : `${count} here now`;
}

// ---- Sample people (until the server has real, opted-in counts) ------------------------------

const SAMPLE_TAGS: Array<[string, number]> = [
  ['#LiveMusic', 0.38],
  ['#Pickleball', 0.22],
  ['#FoodTrucks', 0.3],
  ['#Hiking', 0.34],
  ['#Jazz', 0.14],
  ['#Yoga', 0.12],
  ['#BoardGames', 0.11],
  ['#HappyHour', 0.09],
  ['#Volunteer', 0.08],
  ['#ArtWalk', 0.07],
  ['#TechMeetup', 0.03],
];

/**
 * A fixed, made-up crowd of opted-in people around a spot (same every launch): cells within
 * ~8 km, each following a few #tags. Some tags stay under MIN_SHOWN on purpose.
 */
export function samplePeople(origin: { latitude: number; longitude: number }, count = 160): InterestMember[] {
  let seed = 20261018;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const meters = 8000 * Math.sqrt(random());
    const angle = random() * Math.PI * 2;
    const lat = origin.latitude + (meters * Math.sin(angle)) / 111320;
    const lon = origin.longitude + (meters * Math.cos(angle)) / (111320 * Math.cos((origin.latitude * Math.PI) / 180));
    const tags = SAMPLE_TAGS.filter(([, share]) => random() < share).map(([tag]) => tag);
    return { ...interestCell(lat, lon), tags };
  }).filter((member) => member.tags.length > 0);
}

const SAMPLE_ORIGIN = { latitude: 40.061708, longitude: -105.038292 };
const SAMPLE = samplePeople(SAMPLE_ORIGIN);

// You, when you've opted in (from your home area, never GPS).
let me: InterestMember | null = null;
const listeners = new Set<() => void>();

/** Count me in (or not). Server side: PATCH /me { countInInterests }, using your home cell. */
export function setMyInterestMembership(next: InterestMember | null) {
  const same =
    (me == null && next == null) ||
    (me != null && next != null && me.latitude === next.latitude && me.longitude === next.longitude && me.tags.join() === next.tags.join());
  if (same) return;
  me = next;
  listeners.forEach((listener) => listener());
}

export function getInterestMembers(): InterestMember[] {
  return me ? [...SAMPLE, me] : SAMPLE;
}

/** Everyone counted (sample crowd, plus you if opted in); re-renders when that changes. */
export function useInterestMembers(): InterestMember[] {
  const [members, setMembers] = useState(getInterestMembers);
  useEffect(() => {
    const listener = () => setMembers(getInterestMembers());
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return members;
}
