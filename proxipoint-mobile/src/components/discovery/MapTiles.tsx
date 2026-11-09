import React, { memo, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { toCanvasCoordinates } from '../../stores/useDiscoveryStore';
import { MAP_TILE_URLS } from '../../lib/mapTileUrls';
import { cachedTileUri, forgetTile, loadTile } from '../../lib/tileCache';
export { wideLayersFor } from '../../lib/mapTileLayers';

/**
 * Real street map under the Discover pins (lib/mapTileUrls: Stadia Maps with a key, else Esri),
 * drawn as tiles inside the map's world so pan, pinch-zoom and the pins all stay in step.
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
  /** Moves the covered square (world units) so it's around the part of the map in view. */
  shift: { x: number; y: number } = { x: 0, y: 0 },
): Tile[] {
  const n = 2 ** zoom;
  const lat0 = center.latitude;
  const lon0 = center.longitude;
  // Lat/lon of the world's corners (inverse of toCanvasCoordinates).
  const lonAt = (x: number) => lon0 + ((x - ORIGIN) / SCALE / (EARTH_RADIUS * Math.cos((lat0 * Math.PI) / 180))) * (180 / Math.PI);
  const latAt = (y: number) => lat0 - ((y - ORIGIN) / SCALE / EARTH_RADIUS) * (180 / Math.PI);

  const xMin = Math.floor(lonToTileX(lonAt(from + shift.x), n));
  const xMax = Math.floor(lonToTileX(lonAt(to + shift.x), n));
  const yMin = Math.floor(latToTileY(latAt(from + shift.y), n));
  const yMax = Math.floor(latToTileY(latAt(to + shift.y), n));
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
        labels: urls.labels ? fill(urls.labels) : '',
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

/**
 * One tile, drawn from its saved file on the phone (lib/tileCache): downloaded once, then reused
 * when you pan back, zoom, or reopen the map. Until it's saved it shows nothing (the layer below
 * shows through); if it can't be saved, the web address is used instead.
 */
const TileImage = memo(({ uri, tile, urgent = false }: { uri: string; tile: Tile; urgent?: boolean }) => {
  const [source, setSource] = useState<{ uri: string; fresh: boolean } | null>(() => {
    const saved = cachedTileUri(uri);
    return saved ? { uri: saved, fresh: false } : null;
  });
  useEffect(() => {
    if (source) return;
    let alive = true;
    void loadTile(uri, urgent).then((saved) => {
      if (alive) setSource({ uri: saved ?? uri, fresh: true });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);
  if (!source) return null;
  return (
    <Image
      source={{ uri: source.uri }}
      // Saved tiles appear at once; only new downloads fade in.
      fadeDuration={source.fresh ? 150 : 0}
      // A saved file that won't draw: drop it and use the web address.
      onError={() => {
        if (source.uri === uri) return;
        forgetTile(uri);
        setSource({ uri, fresh: true });
      }}
      style={[styles.tile, { left: tile.left, top: tile.top, width: tile.width, height: tile.height }]}
    />
  );
});
TileImage.displayName = 'TileImage';

export const MapTiles: React.FC<{
  latitude: number;
  longitude: number;
  mode: 'dark' | 'light';
  /** Laid over the tiles to blend them with the app's colours. */
  tint: string;
  /** How many of the wider layers to draw (wideLayersFor); the streets always show. */
  wideLayers?: number;
  /**
   * The world point the street tiles are loaded around (the middle of the map once it settles),
   * so moving to a far-off Point shows its streets straight away. Default: the area's center.
   */
  focus?: { x: number; y: number };
}> = memo(({ latitude, longitude, mode, tint, wideLayers = 0, focus }) => {
  const sx = focus ? focus.x - ORIGIN : 0;
  const sy = focus ? focus.y - ORIGIN : 0;
  const tiles = useMemo(
    () => tilesFor({ latitude, longitude }, mode, TILE_ZOOM, 0, WORLD_SIZE, { x: sx, y: sy }),
    [latitude, longitude, mode, sx, sy],
  );
  const wide = useMemo(
    () => tilesFor({ latitude, longitude }, mode, WIDE_ZOOM, WIDE_MIN, WIDE_MAX, { x: sx, y: sy }),
    [latitude, longitude, mode, sx, sy],
  );
  // Only worked out (and downloaded) once the view is wide enough to need them.
  const far = useMemo(
    () => (wideLayers >= 1 ? tilesFor({ latitude, longitude }, mode, FAR_ZOOM, FAR_MIN, FAR_MAX) : []),
    [latitude, longitude, mode, wideLayers >= 1],
  );
  const outer = useMemo(
    () => (wideLayers >= 2 ? tilesFor({ latitude, longitude }, mode, OUTER_ZOOM, OUTER_MIN, OUTER_MAX) : []),
    [latitude, longitude, mode, wideLayers >= 2],
  );
  const region = useMemo(
    () => (wideLayers >= 3 ? tilesFor({ latitude, longitude }, mode, REGION_ZOOM, REGION_MIN, REGION_MAX) : []),
    [latitude, longitude, mode, wideLayers >= 3],
  );
  const metro = useMemo(
    () => (wideLayers >= 4 ? tilesFor({ latitude, longitude }, mode, METRO_ZOOM, METRO_MIN, METRO_MAX) : []),
    [latitude, longitude, mode, wideLayers >= 4],
  );
  return (
    <View style={styles.layer} pointerEvents="none">
      {/* Coarsest underneath, sharpest on top: the region (35–70 miles across), then closer in */}
      {metro.map((tile) => <TileImage key={`m-${tile.key}`} uri={tile.base} tile={tile} />)}
      {region.map((tile) => <TileImage key={`r-${tile.key}`} uri={tile.base} tile={tile} />)}
      {outer.map((tile) => <TileImage key={`o-${tile.key}`} uri={tile.base} tile={tile} />)}
      {far.map((tile) => <TileImage key={`f-${tile.key}`} uri={tile.base} tile={tile} />)}
      {wide.map((tile) => <TileImage key={`w-${tile.key}`} uri={tile.base} tile={tile} />)}
      {tiles.map((tile) => <TileImage key={`b-${tile.key}`} uri={tile.base} tile={tile} urgent />)}
      <View style={[styles.tintLayer, { backgroundColor: tint }]} />
      {/* Esri's street names sit above the tint; Stadia's are already in the base tiles. */}
      {tiles.map((tile) => (tile.labels ? <TileImage key={`l-${tile.key}`} uri={tile.labels} tile={tile} urgent /> : null))}
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
