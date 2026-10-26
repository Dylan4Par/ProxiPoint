import { calculateDistanceMeters } from './locationFilter';

/**
 * Explore Map's "Search this area": the map is drawn around one place (Discover's area), with
 * Points loaded around it. Once you've panned (or zoomed out) well away from it, the map offers
 * to make what's on screen the new area. Pure (no React), so it's testable.
 *
 * World units match toCanvasCoordinates in useDiscoveryStore: the area's center is at
 * (CENTER_WORLD, CENTER_WORLD) and 1 meter = WORLD_SCALE units.
 */

export const CENTER_WORLD = 480;
export const WORLD_SCALE = 0.45;
const EARTH_RADIUS = 6371000;
const RAD = Math.PI / 180;

/** The lat/lon at a world point (the inverse of toCanvasCoordinates). */
export function fromCanvasCoordinates(
  x: number,
  y: number,
  centerLat: number,
  centerLon: number,
  scale = WORLD_SCALE,
): { latitude: number; longitude: number } {
  const xMeters = (x - CENTER_WORLD) / scale;
  const yMeters = (y - CENTER_WORLD) / scale;
  return {
    latitude: centerLat - yMeters / EARTH_RADIUS / RAD,
    longitude: centerLon + xMeters / (EARTH_RADIUS * Math.cos(centerLat * RAD)) / RAD,
  };
}

/** Moved at least this far (or a quarter of the screen's width, if more) before offering. */
export const MIN_AREA_SHIFT_METERS = 300;
/** Zoomed out so far that the screen is this many times wider than the area's range. */
export const ZOOM_OUT_FACTOR = 2;

/**
 * Should the map offer "Search this area"? When the middle of the screen is far from the area's
 * center (relative to how much is on screen), or you've zoomed out well past the area's range.
 */
export function shouldOfferAreaSearch(
  center: { x: number; y: number },
  visibleWidthWorld: number,
  areaRangeMeters: number,
): boolean {
  const shiftMeters = Math.hypot(center.x - CENTER_WORLD, center.y - CENTER_WORLD) / WORLD_SCALE;
  const widthMeters = visibleWidthWorld / WORLD_SCALE;
  if (shiftMeters > Math.max(MIN_AREA_SHIFT_METERS, widthMeters / 4)) return true;
  return widthMeters > areaRangeMeters * 2 * ZOOM_OUT_FACTOR;
}

/** Half the screen's diagonal, in meters: the radius to load Points for when searching an area. */
export function visibleRadiusMeters(visibleWidthWorld: number, visibleHeightWorld: number): number {
  return Math.round(Math.hypot(visibleWidthWorld, visibleHeightWorld) / 2 / WORLD_SCALE);
}

/** "Erie" (closest city within 15 km), otherwise "Map area". Shown on the location pill. */
export function areaName(
  spot: { latitude: number; longitude: number },
  cities: Array<{ name: string; latitude: number; longitude: number }>,
  maxMeters = 15000,
): string {
  let best: { name: string; meters: number } | null = null;
  for (const city of cities) {
    const meters = calculateDistanceMeters(spot.latitude, spot.longitude, city.latitude, city.longitude);
    if (meters <= maxMeters && (!best || meters < best.meters)) best = { name: city.name, meters };
  }
  return best ? best.name : 'Map area';
}

/** "Boulder, CO" for the closest listed city within maxMeters, or '' (shown on Point cards). */
export function nearestCityLabel(
  spot: { latitude?: number; longitude?: number },
  cities: Array<{ name: string; region?: string; latitude: number; longitude: number }>,
  maxMeters = 25000,
): string {
  if (!Number.isFinite(spot.latitude) || !Number.isFinite(spot.longitude)) return '';
  let best: { label: string; meters: number } | null = null;
  for (const city of cities) {
    const meters = calculateDistanceMeters(spot.latitude as number, spot.longitude as number, city.latitude, city.longitude);
    if (meters <= maxMeters && (!best || meters < best.meters)) {
      best = { label: city.region ? `${city.name}, ${city.region}` : city.name, meters };
    }
  }
  return best ? best.label : '';
}

/** How far around the area being explored (its city and metro) the Point list reaches. */
export const METRO_RADIUS_METERS = 40000; // about 25 mi

/** Inside the explored city / metro area. Points with no coordinates are kept. */
export function inMetroArea(
  spot: { latitude?: number; longitude?: number },
  center: { latitude: number; longitude: number },
  radiusMeters = METRO_RADIUS_METERS,
): boolean {
  if (!Number.isFinite(spot.latitude) || !Number.isFinite(spot.longitude)) return true;
  return (
    calculateDistanceMeters(spot.latitude as number, spot.longitude as number, center.latitude, center.longitude) <=
    radiusMeters
  );
}
