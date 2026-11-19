/**
 * Explore Map runs on MapLibre (Stadia's vector map), but its pins, bubbles and card list still
 * work in the app's own "world" units (lib/mapArea: the area's center is (480, 480), one unit is
 * 1 / WORLD_SCALE meters) and a "world zoom" (screen points per world unit). These convert between
 * the two. Pure, so it's tested.
 */

import { WORLD_SCALE } from './mapArea';

/** MapLibre draws the whole world 512 points wide at zoom 0, twice that at zoom 1, and so on. */
const TILE_POINTS = 512;
const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6378137;
const RAD = Math.PI / 180;

/** Meters per screen point at MapLibre zoom 0 at this latitude. */
const metersPerPointAtZero = (latitude: number) => (EARTH_CIRCUMFERENCE * Math.cos(latitude * RAD)) / TILE_POINTS;

/** World zoom (screen points per world unit) for a MapLibre zoom level. */
export function worldZoomFor(mapZoom: number, latitude: number): number {
  return 2 ** mapZoom / (metersPerPointAtZero(latitude) * WORLD_SCALE);
}

/** MapLibre zoom level for a world zoom. */
export function mapZoomFor(worldZoom: number, latitude: number): number {
  return Math.log2(Math.max(worldZoom, 1e-9) * metersPerPointAtZero(latitude) * WORLD_SCALE);
}

/** West, south, east, north (MapLibre's visible bounds). */
export type Bounds = [west: number, south: number, east: number, north: number];

export interface WorldView {
  /** World box of the map part that isn't covered (card list / detail sheet). */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Screen points per world unit. */
  zoom: number;
}

/**
 * The world box the map shows, from MapLibre's bounds. Only the top `visibleShare` of the map
 * counts (the rest is under the card list), so the cards match the pins above them.
 * `toWorld` is the store's toCanvasCoordinates for the current area.
 */
export function worldViewFor(
  bounds: Bounds,
  mapWidth: number,
  visibleShare: number,
  toWorld: (latitude: number, longitude: number) => { x: number; y: number },
): WorldView | null {
  const [west, south, east, north] = bounds;
  const nw = toWorld(north, west);
  const se = toWorld(south, east);
  const width = se.x - nw.x;
  const height = se.y - nw.y;
  if (!(width > 0) || !(height > 0) || !(mapWidth > 0)) return null;
  const share = Math.min(1, Math.max(0.05, visibleShare));
  return { minX: nw.x, maxX: se.x, minY: nw.y, maxY: nw.y + height * share, zoom: mapWidth / width };
}
