/**
 * Which map tiles Explore Map draws: one detail level that matches the current zoom, covering the
 * part of the map on screen plus a margin. (It used to stack up to six levels at once; with Stadia's
 * tiles, which have street names and road badges built in, that showed piles of tiny badges and
 * blurry oversized labels, and downloaded far more tiles.)
 *
 * Coordinates are the map's "world" units: (480, 480) is the area's center, and one unit is
 * 1 / WORLD_SCALE meters (lib/mapArea; the same as each Point's x / y).
 */

export const WORLD_SCALE = 0.45; // world units per meter (same as lib/mapArea)
const ORIGIN = 480;
const EARTH_RADIUS = 6371000;
const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6378137;
/** Each tile should show at about this many screen points across (256 = sharp with @2x tiles). */
const TILE_POINTS = 256;
/** Tiles drawn past each edge of the screen, as a share of the screen, so a short pan is ready. */
const MARGIN = 0.3;
/** Never draw more than this many tiles at once (a safety cap). */
export const MAX_TILES = 64;

export interface WorldBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface GridTile {
  key: string;
  z: number;
  x: number;
  y: number;
  /** Where it sits in the world (with a hair of overlap so no seams show). */
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The tile level for a map zoom (screen points per world unit): the level whose tiles show at about
 * 256 points across, between minZoom and maxZoom.
 */
export function tileLevelFor(mapZoom: number, latitude: number, minZoom = 3, maxZoom = 16): number {
  const metersPerPoint = 1 / (WORLD_SCALE * Math.max(mapZoom, 1e-6));
  const tileMeters = metersPerPoint * TILE_POINTS;
  const level = Math.log2((EARTH_CIRCUMFERENCE * Math.cos((latitude * Math.PI) / 180)) / tileMeters);
  return Math.min(maxZoom, Math.max(minZoom, Math.round(level)));
}

const lonToTileX = (lon: number, n: number) => ((lon + 180) / 360) * n;
const latToTileY = (lat: number, n: number) => {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
};
const tileXToLon = (x: number, n: number) => (x / n) * 360 - 180;
const tileYToLat = (y: number, n: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

/** World position of a lat / lon (the same maths as the store's toCanvasCoordinates). */
function toWorld(lat: number, lon: number, lat0: number, lon0: number) {
  const rad = Math.PI / 180;
  return {
    x: (lon - lon0) * rad * EARTH_RADIUS * Math.cos(lat0 * rad) * WORLD_SCALE + ORIGIN,
    y: -(lat - lat0) * rad * EARTH_RADIUS * WORLD_SCALE + ORIGIN,
  };
}

/** The tiles at `level` that cover `view` plus the margin, nearest the middle first. */
export function tilesForView(center: { latitude: number; longitude: number }, view: WorldBox, level: number): GridTile[] {
  const lat0 = center.latitude;
  const lon0 = center.longitude;
  const padX = (view.maxX - view.minX) * MARGIN;
  const padY = (view.maxY - view.minY) * MARGIN;
  const lonAt = (x: number) => lon0 + ((x - ORIGIN) / WORLD_SCALE / (EARTH_RADIUS * Math.cos((lat0 * Math.PI) / 180))) * (180 / Math.PI);
  const latAt = (y: number) => lat0 - ((y - ORIGIN) / WORLD_SCALE / EARTH_RADIUS) * (180 / Math.PI);
  const n = 2 ** level;
  const clampY = (v: number) => Math.min(n - 1, Math.max(0, v));
  const xMin = Math.floor(lonToTileX(lonAt(view.minX - padX), n));
  const xMax = Math.floor(lonToTileX(lonAt(view.maxX + padX), n));
  const yMin = clampY(Math.floor(latToTileY(latAt(view.minY - padY), n)));
  const yMax = clampY(Math.floor(latToTileY(latAt(view.maxY + padY), n)));

  const midX = lonToTileX(lonAt((view.minX + view.maxX) / 2), n);
  const midY = latToTileY(latAt((view.minY + view.maxY) / 2), n);
  const tiles: GridTile[] = [];
  for (let tx = xMin; tx <= xMax; tx += 1) {
    for (let ty = yMin; ty <= yMax; ty += 1) {
      const wx = ((tx % n) + n) % n; // wrap across the date line
      const nw = toWorld(tileYToLat(ty, n), tileXToLon(tx, n), lat0, lon0);
      const se = toWorld(tileYToLat(ty + 1, n), tileXToLon(tx + 1, n), lat0, lon0);
      tiles.push({
        key: `${level}/${wx}/${ty}`,
        z: level,
        x: wx,
        y: ty,
        left: nw.x - 0.5,
        top: nw.y - 0.5,
        width: se.x - nw.x + 1,
        height: se.y - nw.y + 1,
      });
    }
  }
  // Middle first: those load first and survive the cap.
  tiles.sort((a, b) => Math.hypot(a.x + 0.5 - midX, a.y + 0.5 - midY) - Math.hypot(b.x + 0.5 - midX, b.y + 0.5 - midY));
  return tiles.slice(0, MAX_TILES);
}

/** A tile URL from a {z}/{x}/{y} template. */
export function tileUrl(template: string, tile: { z: number; x: number; y: number }): string {
  return template.replace('{z}', String(tile.z)).replace('{x}', String(tile.x)).replace('{y}', String(tile.y));
}

/**
 * Rounds a view to a coarse grid so tiny moves don't re-plan the tiles; the margin covers the rest.
 */
export function roundView(view: WorldBox, step = 40): WorldBox {
  const r = (v: number) => Math.round(v / step) * step;
  return { minX: r(view.minX), maxX: r(view.maxX), minY: r(view.minY), maxY: r(view.maxY) };
}
