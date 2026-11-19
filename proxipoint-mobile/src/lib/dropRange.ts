import { calculateDistanceMeters } from './locationFilter';
import { formatDistanceIn, type DistanceUnits } from './units';

/** How far from you a Point can be dropped: 100 miles. The server should enforce the same limit. */
export const MAX_DROP_DISTANCE_METERS = 100 * 1609.344;

export interface LatLon {
  latitude: number;
  longitude: number;
}

/** Null when `spot` is close enough to drop on; otherwise the message to show. */
export function dropRangeError(you: LatLon, spot: LatLon, units: DistanceUnits): string | null {
  const meters = calculateDistanceMeters(you.latitude, you.longitude, spot.latitude, spot.longitude);
  if (!Number.isFinite(meters) || meters <= MAX_DROP_DISTANCE_METERS) return null;
  return `That spot is ${formatDistanceIn(meters, units)} away. Points can be dropped within ${dropRangeLabel(units)} of you.`;
}

/** "100 mi", or "161 km" in metric. */
export function dropRangeLabel(units: DistanceUnits): string {
  return units === 'imperial' ? '100 mi' : `${Math.round(MAX_DROP_DISTANCE_METERS / 1000)} km`;
}
