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
/**
 * Tiles are laid out at this size and their level's container is scaled up to real size.
 * Laid out at real size, a zoomed-out tile is tens of thousands of pixels before the map's zoom
 * shrinks it, past Android's largest drawable size (~16k px), so it came out blank.
 */
const TILE_LAYOUT = 256;
const TINT_LAYOUT = 1000;

/** One tile, from its saved file on the phone (lib/tileCache), or the web if it can't be saved. */
const TileImage = memo(
  ({
    uri,
    tile,
    unit,
    origin,
    onReady,
  }: {
    uri: string;
    tile: GridTile;
    /** World units per layout unit in this tile's level container. */
    unit: number;
    /** The container's top-left, in layout units. */
    origin: { x: number; y: number };
    onReady?: (key: string) => void;
  }) => {
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
        // No fade: a new level's tiles fading in over the old level showed both at once (a blurry
        // double image at each zoom step). The old level stays underneath until these have drawn.
        fadeDuration={0}
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
        // In its level's container units (world units / unit), so it's laid out at about 256 px.
        style={[
          styles.tile,
          { left: tile.left / unit - origin.x, top: tile.top / unit - origin.y, width: tile.width / unit, height: tile.height / unit },
        ]}
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
  // A low-detail backdrop, always underneath: three levels coarser (each tile covers 64 of the
  // current ones) and three times the view each way. A fast pinch-out then shows a softer map
  // around the detailed tiles instead of a blank screen while the next level downloads.
  const backdropLevel = Math.max(3, level - 3);
  const backdrop = useMemo(() => {
    if (backdropLevel >= level) return [];
    const w = view.maxX - view.minX;
    const h = view.maxY - view.minY;
    const wide = { minX: view.minX - w, maxX: view.maxX + w, minY: view.minY - h, maxY: view.maxY + h };
    return tilesForView({ latitude, longitude }, wide, backdropLevel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, level, backdropLevel, view.minX, view.maxX, view.minY, view.maxY]);

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

  /**
   * Tiles of one level inside a container scaled up by `unit` (world units per layout unit), so each
   * tile is laid out at ~256 px and the scale does the rest.
   */
  const group = (tiles: GridTile[], layer: 'base' | 'labels', ready?: (key: string) => void, keyName: string = layer) => {
    const template = urls[layer];
    if (!template || !tiles.length) return null;
    const unit = Math.max(1e-6, tiles[0].width / TILE_LAYOUT);
    // The container wraps its tiles (in layout units), placed at their world top-left.
    const x0 = Math.min(...tiles.map((t) => t.left)) / unit;
    const y0 = Math.min(...tiles.map((t) => t.top)) / unit;
    const x1 = Math.max(...tiles.map((t) => t.left + t.width)) / unit;
    const y1 = Math.max(...tiles.map((t) => t.top + t.height)) / unit;
    const origin = { x: x0, y: y0 };
    return (
      // One container per level, and one key per tile, so a tile already on screen is never
      // unmounted and re-read when the tiles are picked again (that was the flicker on zoom).
      <View
        key={`${keyName}-${tiles[0].z}`}
        style={[styles.group, { left: x0 * unit, top: y0 * unit, width: x1 - x0, height: y1 - y0, transform: [{ scale: unit }] }]}
      >
        {tiles.map((t) => (
          <TileImage key={`${keyName}-${t.key}`} uri={tileUrl(template, t)} tile={t} unit={unit} origin={origin} onReady={ready} />
        ))}
      </View>
    );
  };
  // Every level on screen: the previous complete set's levels underneath, the current level on top.
  // The current level also keeps its old tiles at the edges until the new ones have drawn.
  const levels = [...new Set(keep.map((t) => t.z).filter((z) => z !== level)), level];
  const tilesAt = (z: number) => (z === level ? [...want, ...keep.filter((t) => t.z === z)] : keep.filter((t) => t.z === z));

  return (
    <View style={styles.layer} pointerEvents="none">
      {/* The backdrop first, so everything else draws over it. */}
      {group(backdrop, 'base', undefined, 'backdrop')}
      {levels.map((z) => group(tilesAt(z), 'base', urls.labels ? undefined : onReady))}
      {/* The tint, also laid out small and scaled up (one huge view can fail to draw too). */}
      <View style={[styles.tintLayer, { backgroundColor: tint, transform: [{ scale: (2 * TINT_REACH) / TINT_LAYOUT }] }]} />
      {/* Esri's street names sit above the tint; Stadia's are already in the base tiles. */}
      {urls.labels ? group(want, 'labels', onReady) : null}
    </View>
  );
});
MapTiles.displayName = 'MapTiles';

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, width: WORLD_SIZE, height: WORLD_SIZE },
  tile: { position: 'absolute' },
  // A level's tiles: positioned in layout units, scaled up from the world's top-left corner.
  group: { position: 'absolute', transformOrigin: [0, 0, 0] },
  tintLayer: {
    position: 'absolute',
    left: -TINT_REACH,
    top: -TINT_REACH,
    width: TINT_LAYOUT,
    height: TINT_LAYOUT,
    transformOrigin: [0, 0, 0],
  },
});
