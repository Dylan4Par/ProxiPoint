import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { MAP_TILE_MAX_ZOOM, MAP_TILE_URLS } from '../../lib/mapTileUrls';
import { cachedTileUri, forgetTile, loadTile } from '../../lib/tileCache';
import { tileLevelFor, tilesForView, tileUrl, type GridTile, type WorldBox } from '../../lib/tileGrid';

/**
 * Real street map under the Explore Map pins (lib/mapTileUrls: Stadia Maps with a key, else Esri),
 * drawn inside the map's world so pan, pinch-zoom and the pins all stay in step.
 *
 * Like any web map, it draws ONE detail level that suits the current zoom, covering what's on
 * screen plus a margin (lib/tileGrid), and picks them again once the map settles. Until the new
 * tiles have all loaded, the last complete set stays underneath, so zooming never flashes blank.
 */

/** Map world size (same numbers as DiscoveryMapCanvas). */
const WORLD_SIZE = 1400;
/** The tint covers this much of the world around the area, at any zoom. */
const TINT_REACH = 80000;

/** One tile, from its saved file on the phone (lib/tileCache), or the web if it can't be saved. */
const TileImage = memo(
  ({ uri, tile, onReady }: { uri: string; tile: GridTile; onReady?: (key: string) => void }) => {
    const [source, setSource] = useState<{ uri: string; fresh: boolean } | null>(() => {
      const saved = cachedTileUri(uri);
      return saved ? { uri: saved, fresh: false } : null;
    });
    useEffect(() => {
      if (source) return;
      let alive = true;
      void loadTile(uri, true).then((saved) => {
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
        onLoad={() => onReady?.(tile.key)}
        // A saved file that won't draw: drop it and use the web address.
        onError={() => {
          if (source.uri === uri) {
            onReady?.(tile.key); // the web copy failed too: don't hold the zoom change for it
            return;
          }
          forgetTile(uri);
          setSource({ uri, fresh: true });
        }}
        style={[styles.tile, { left: tile.left, top: tile.top, width: tile.width, height: tile.height }]}
      />
    );
  },
);
TileImage.displayName = 'TileImage';

export const MapTiles: React.FC<{
  latitude: number;
  longitude: number;
  mode: 'dark' | 'light';
  /** Laid over the tiles to blend them with the app's colours. */
  tint: string;
  /** The part of the world on screen (world units), from the last time the map settled. */
  view: WorldBox;
  /** The map's zoom then (screen points per world unit). */
  zoom: number;
}> = memo(({ latitude, longitude, mode, tint, view, zoom }) => {
  const urls = MAP_TILE_URLS[mode];
  const level = tileLevelFor(zoom, latitude, 3, MAP_TILE_MAX_ZOOM);
  const want = useMemo(
    () => tilesForView({ latitude, longitude }, view, level),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latitude, longitude, level, view.minX, view.maxX, view.minY, view.maxY],
  );

  // The last set whose tiles had all drawn: kept underneath until `want` has drawn too.
  const [under, setUnder] = useState<GridTile[]>([]);
  const drawn = useRef(new Set<string>());
  const wantRef = useRef(want);
  wantRef.current = want;
  const placeKey = `${latitude},${longitude},${mode}`;
  const lastPlace = useRef(placeKey);
  if (lastPlace.current !== placeKey) {
    // Another area or theme: tile positions change, so nothing old can stay.
    lastPlace.current = placeKey;
    drawn.current = new Set();
  }
  const checkDone = () => {
    if (wantRef.current.every((t) => drawn.current.has(t.key))) setUnder(wantRef.current);
  };
  const onReady = (key: string) => {
    drawn.current.add(key);
    checkDone();
  };
  useEffect(checkDone, [want]);
  useEffect(() => setUnder([]), [placeKey]);

  const wantKeys = new Set(want.map((t) => t.key));
  const keep = under.filter((t) => !wantKeys.has(t.key));
  const tile = (t: GridTile, layer: 'base' | 'labels', prefix: string, ready?: (key: string) => void) => {
    const template = urls[layer];
    return template ? <TileImage key={`${prefix}-${layer}-${t.key}`} uri={tileUrl(template, t)} tile={t} onReady={ready} /> : null;
  };

  return (
    <View style={styles.layer} pointerEvents="none">
      {/* The last complete set, under the new one while it loads (another zoom level, or edges). */}
      {keep.map((t) => tile(t, 'base', 'u'))}
      {want.map((t) => tile(t, 'base', 'w', urls.labels ? undefined : onReady))}
      <View style={[styles.tintLayer, { backgroundColor: tint }]} />
      {/* Esri's street names sit above the tint; Stadia's are already in the base tiles. */}
      {urls.labels ? want.map((t) => tile(t, 'labels', 'w', onReady)) : null}
    </View>
  );
});
MapTiles.displayName = 'MapTiles';

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, width: WORLD_SIZE, height: WORLD_SIZE },
  tile: { position: 'absolute' },
  tintLayer: {
    position: 'absolute',
    left: -TINT_REACH,
    top: -TINT_REACH,
    width: 2 * TINT_REACH,
    height: 2 * TINT_REACH,
  },
});
