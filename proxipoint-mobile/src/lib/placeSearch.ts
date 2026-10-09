import { calculateDistanceMeters } from './locationFilter';
import type { PlaceSuggestion } from '../types/beacon';

/** Venues around the tactical map baseline, plus Boulder street intersections. */
export const PLACE_INDEX: PlaceSuggestion[] = [
  {
    id: 'pearl-broadway',
    label: 'Pearl St & Broadway',
    subtitle: 'Boulder, CO',
    latitude: 40.0179,
    longitude: -105.2789,
    placeType: 'address',
  },
  {
    id: 'rusty-anchor',
    label: 'The Rusty Anchor',
    subtitle: 'Live music room',
    latitude: 40.0632,
    longitude: -105.0365,
    placeType: 'poi',
  },
  {
    id: 'central-park',
    label: 'Central Park Plaza',
    subtitle: 'Food trucks',
    latitude: 40.0645,
    longitude: -105.041,
    placeType: 'poi',
  },
  {
    id: 'tech-lab',
    label: 'Downtown Tech Lab',
    subtitle: 'Meetups',
    latitude: 40.071,
    longitude: -105.032,
    placeType: 'poi',
  },
  {
    id: 'meadow-courts',
    label: 'Meadow Park Courts',
    subtitle: 'Pickleball',
    latitude: 40.058,
    longitude: -105.045,
    placeType: 'poi',
  },
  {
    id: 'old-town',
    label: 'Old Town Square',
    subtitle: 'Art walk',
    latitude: 40.067,
    longitude: -105.028,
    placeType: 'neighborhood',
  },
  {
    id: 'creek-pavilion',
    label: 'Boulder Creek Pavilion',
    subtitle: 'Creek path',
    latitude: 40.0145,
    longitude: -105.282,
    placeType: 'poi',
  },
];

function scorePlace(place: PlaceSuggestion, query: string): number {
  const label = place.label.toLowerCase();
  const subtitle = place.subtitle.toLowerCase();
  if (label.startsWith(query)) return 0;
  if (label.includes(query)) return 1;
  if (subtitle.includes(query)) return 2;
  return 3;
}

export function searchPlaces(query: string, limit = 5): PlaceSuggestion[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return [];

  return PLACE_INDEX
    .map((place) => ({ place, score: scorePlace(place, trimmed) }))
    .filter((entry) => entry.score < 3)
    .sort((a, b) => a.score - b.score || a.place.label.localeCompare(b.place.label))
    .slice(0, limit)
    .map((entry) => entry.place);
}

export function nearestPlace(latitude: number, longitude: number, maxMeters = 400): PlaceSuggestion | null {
  let best: { place: PlaceSuggestion; distance: number } | null = null;
  for (const place of PLACE_INDEX) {
    const distance = calculateDistanceMeters(latitude, longitude, place.latitude, place.longitude);
    if (distance > maxMeters) continue;
    if (!best || distance < best.distance) {
      best = { place, distance };
    }
  }
  return best?.place ?? null;
}
