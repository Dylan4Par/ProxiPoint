import React, { memo, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { toCanvasCoordinates } from '../../stores/useDiscoveryStore';
import { MAP_TILE_URLS } from '../../lib/mapTileUrls';

/**
 * Real street map under the Discover pins: Esri's grey "Canvas" basemap plus its street-name
 * layer, drawn as tiles inside the map's world so pan, pinch-zoom and the pins all stay in step.
 *
 * Esri's terms allow this for development and testing. Before release, either sign up for an
 * ArcGIS Location Platform key (append `?token=KEY` below) or swap TILE_URLS for another
 * provider you're licensed to use (Stadia, MapTiler, Mapbox raster tiles…).
 */
const TILE_URLS = MAP_TILE_URLS;

/** Zoom 16 is the sharpest these basemaps go (~1.8 m per pixel around Denver). */
const TILE_ZOOM = 16;
/** Wider, softer layer underneath so zooming far out still shows the surrounding area. */
const WIDE_ZOOM = 14;
const WIDE_MIN = -1400;
const WIDE_MAX = 2800;
/** Even wider, softer still: about 28 km across, for the furthest-out zoom. */
const FAR_ZOOM = 12;
const FAR_MIN = -5600;
const FAR_MAX = 7000;
/** About 60 km across: fills a view around 15–20 miles wide. */
const OUTER_ZOOM = 11;
const OUTER_MIN = -13000;
const OUTER_MAX = 14000;
/** About 180 km across: the 35-mile views (web zoom 10). */
const REGION_ZOOM = 10;
const REGION_MIN = -40000;
const REGION_MAX = 41000;
/**
 * About 340 km across: the furthest zoom, 70 miles wide (web zoom 9), is about twice as tall on
 * a phone, so this keeps it covered even after panning a bit.
 */
const METRO_ZOOM = 9;
const METRO_MIN = -76000;
const METRO_MAX = 77000;
/** Map world (same numbers as DiscoveryMapCanvas): 1400 × 1400, you / the city at (480, 480). */
const WORLD_SIZE = 1400;
const ORIGIN = 480;
/** Pixels per meter on the map world (same as the store's toCanvasCoordinates). */
const SCALE = 0.45;
const EARTH_RADIUS = 6371000;

const lonToTileX = (lon: number, n: number) => ((lon + 180) / 360) * n;
const latToTileY = (lat: number, n: number) => {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
};
const tileXToLon = (x: number, n: number) => (x / n) * 360 - 180;
const tileYToLat = (y: number, n: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

interface Tile {
  key: string;
  base: string;
  labels: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

function tilesFor(
  center: { latitude: number; longitude: number },
  mode: 'dark' | 'light',
  zoom = TILE_ZOOM,
  from = 0,
  to = WORLD_SIZE,
): Tile[] {
  const n = 2 ** zoom;
  const lat0 = center.latitude;
  const lon0 = center.longitude;
  // Lat/lon of the world's corners (inverse of toCanvasCoordinates).
  const lonAt = (x: number) => lon0 + ((x - ORIGIN) / SCALE / (EARTH_RADIUS * Math.cos((lat0 * Math.PI) / 180))) * (180 / Math.PI);
  const latAt = (y: number) => lat0 - ((y - ORIGIN) / SCALE / EARTH_RADIUS) * (180 / Math.PI);

  const xMin = Math.floor(lonToTileX(lonAt(from), n));
  const xMax = Math.floor(lonToTileX(lonAt(to), n));
  const yMin = Math.floor(latToTileY(latAt(from), n));
  const yMax = Math.floor(latToTileY(latAt(to), n));
  const urls = TILE_URLS[mode];

  const tiles: Tile[] = [];
  for (let tx = xMin; tx <= xMax; tx += 1) {
    for (let ty = yMin; ty <= yMax; ty += 1) {
      const nw = toCanvasCoordinates(tileYToLat(ty, n), tileXToLon(tx, n), lat0, lon0);
      const se = toCanvasCoordinates(tileYToLat(ty + 1, n), tileXToLon(tx + 1, n), lat0, lon0);
      const fill = (url: string) => url.replace('{z}', String(zoom)).replace('{x}', String(tx)).replace('{y}', String(ty));
      tiles.push({
        key: `${mode}-${zoom}-${tx}-${ty}`,
        base: fill(urls.base),
        labels: fill(urls.labels),
        // A hair of overlap so no seams show between tiles.
        left: nw.x - 0.5,
        top: nw.y - 0.5,
        width: se.x - nw.x + 1,
        height: se.y - nw.y + 1,
      });
    }
  }
  return tiles;
}

export const MapTiles: React.FC<{
  latitude: number;
  longitude: number;
  mode: 'dark' | 'light';
  /** Laid over the tiles to blend them with the app's colours. */
  tint: string;
}> = memo(({ latitude, longitude, mode, tint }) => {
  const tiles = useMemo(() => tilesFor({ latitude, longitude }, mode), [latitude, longitude, mode]);
  const wide = useMemo(
    () => tilesFor({ latitude, longitude }, mode, WIDE_ZOOM, WIDE_MIN, WIDE_MAX),
    [latitude, longitude, mode],
  );
  const far = useMemo(
    () => tilesFor({ latitude, longitude }, mode, FAR_ZOOM, FAR_MIN, FAR_MAX),
    [latitude, longitude, mode],
  );
  const outer = useMemo(
    () => tilesFor({ latitude, longitude }, mode, OUTER_ZOOM, OUTER_MIN, OUTER_MAX),
    [latitude, longitude, mode],
  );
  const region = useMemo(
    () => tilesFor({ latitude, longitude }, mode, REGION_ZOOM, REGION_MIN, REGION_MAX),
    [latitude, longitude, mode],
  );
  const metro = useMemo(
    () => tilesFor({ latitude, longitude }, mode, METRO_ZOOM, METRO_MIN, METRO_MAX),
    [latitude, longitude, mode],
  );
  return (
    <View style={styles.layer} pointerEvents="none">
      {/* The region, for the furthest zooms (35–70 miles across), coarsest underneath */}
      {metro.map((tile) => (
        <Image
          key={`m-${tile.key}`}
          source={{ uri: tile.base }}
          style={[styles.tile, { left: tile.left, top: tile.top, width: tile.width, height: tile.height }]}
          fadeDuration={150}
        />
      ))}
      {region.map((tile) => (
        <Image
          key={`r-${tile.key}`}
          source={{ uri: tile.base }}
          style={[styles.tile, { left: tile.left, top: tile.top, width: tile.width, height: tile.height }]}
          fadeDuration={150}
        />
      ))}
      {/* Outer surroundings */}
      {outer.map((tile) => (
        <Image
          key={`o-${tile.key}`}
          source={{ uri: tile.base }}
          style={[styles.tile, { left: tile.left, top: tile.top, width: tile.width, height: tile.height }]}
          fadeDuration={150}
        />
      ))}
      {/* Far surroundings (only seen at the furthest zoom) */}
      {far.map((tile) => (
        <Image
          key={`f-${tile.key}`}
          source={{ uri: tile.base }}
          style={[styles.tile, { left: tile.left, top: tile.top, width: tile.width, height: tile.height }]}
          fadeDuration={150}
        />
      ))}
      {/* Wide, softer surroundings (seen when zoomed far out) */}
      {wide.map((tile) => (
        <Image
          key={`w-${tile.key}`}
          source={{ uri: tile.base }}
          style={[styles.tile, { left: tile.left, top: tile.top, width: tile.width, height: tile.height }]}
          fadeDuration={150}
        />
      ))}
      {tiles.map((tile) => (
        <Image
          key={`b-${tile.key}`}
          source={{ uri: tile.base }}
          style={[styles.tile, { left: tile.left, top: tile.top, width: tile.width, height: tile.height }]}
          fadeDuration={150}
        />
      ))}
      <View style={[styles.tintLayer, { backgroundColor: tint }]} />
      {tiles.map((tile) => (
        <Image
          key={`l-${tile.key}`}
          source={{ uri: tile.labels }}
          style={[styles.tile, { left: tile.left, top: tile.top, width: tile.width, height: tile.height }]}
          fadeDuration={150}
        />
      ))}
    </View>
  );
});
MapTiles.displayName = 'MapTiles';

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, width: WORLD_SIZE, height: WORLD_SIZE },
  tile: { position: 'absolute' },
  tintLayer: {
    position: 'absolute',
    // Over every layer, so the colour is the same at any zoom.
    left: METRO_MIN,
    top: METRO_MIN,
    width: METRO_MAX - METRO_MIN,
    height: METRO_MAX - METRO_MIN,
  },
});
