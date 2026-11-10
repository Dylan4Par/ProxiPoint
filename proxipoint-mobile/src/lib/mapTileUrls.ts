/**
 * Basemap shared by every map in the app (Explore Map, drawn by MapLibre from Stadia's vector
 * styles, and the Leaflet maps in Create Drop, from Stadia's raster tiles of the same styles), so
 * they all look the same.
 *
 * Stadia Maps (Outdoors in light mode, Alidade Smooth Dark in dark) when EXPO_PUBLIC_STADIA_API_KEY is set: put
 * it in proxipoint-mobile/.env.local (never committed), then rebuild. Without a key, Esri's
 * Light / Dark Gray Canvas as before (base plus a separate street-name layer), which is only
 * licensed for development, so a missing key never leaves a blank map.
 */

export type TileProvider = 'stadia' | 'esri';

/**
 * What Explore Map (MapLibre) draws: a Stadia style URL (vector map, with the key; Stadia puts the
 * key into every tile request the style makes), or, without a key, a small raster style of the
 * Esri tiles. Kept as a plain object here so this file has no map library in it.
 */
export type MapStyleSource =
  | string
  | {
      version: 8;
      sources: Record<string, { type: 'raster'; tiles: string[]; tileSize: number; maxzoom: number }>;
      layers: Array<{ id: string; type: 'raster'; source: string }>;
    };

export interface TileSetup {
  provider: TileProvider;
  /** z/x/y URL templates per theme. `labels` is '' when names are already in the base tiles. */
  urls: Record<'dark' | 'light', { base: string; labels: string }>;
  /** The credit line the provider requires, as plain text (on Explore Map). */
  attribution: string;
  /** The same credit for Leaflet, with links. */
  attributionHtml: string;
  /** Explore Map's style per theme (see MapStyleSource). */
  styles: Record<'dark' | 'light', MapStyleSource>;
}

/** A raster-only map style from {z}/{x}/{y} templates (base, plus street names when separate). */
function rasterStyle(urls: { base: string; labels: string }): MapStyleSource {
  const layers = urls.labels ? (['base', 'labels'] as const) : (['base'] as const);
  return {
    version: 8,
    sources: Object.fromEntries(
      layers.map((id) => [id, { type: 'raster' as const, tiles: [urls[id]], tileSize: 256, maxzoom: MAP_TILE_MAX_ZOOM }]),
    ),
    layers: layers.map((id) => ({ id, type: 'raster' as const, source: id })),
  };
}

/** The sharpest zoom the raster maps load; closer in, they scale these tiles up (fewer downloads). */
export const MAP_TILE_MAX_ZOOM = 16;

const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas';

/** The tiles and credit for a Stadia API key ('' = none: Esri). */
export function tileSetup(stadiaKey: string): TileSetup {
  const key = stadiaKey.trim();
  if (key) {
    // @2x: 512 px tiles, sharp on phone screens (Stadia counts them like normal tiles).
    const stadia = (style: string) =>
      `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}@2x.png?api_key=${encodeURIComponent(key)}`;
    // Stadia's own vector styles (the same looks as the tiles above, drawn on the phone).
    const style = (name: string) => `https://tiles.stadiamaps.com/styles/${name}.json?api_key=${encodeURIComponent(key)}`;
    return {
      provider: 'stadia',
      urls: {
        dark: { base: stadia('alidade_smooth_dark'), labels: '' },
        light: { base: stadia('outdoors'), labels: '' }, // colourful, with terrain shading and trails
      },
      attribution: '© Stadia Maps © OpenMapTiles © OpenStreetMap',
      attributionHtml:
        '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      styles: { dark: style('alidade_smooth_dark'), light: style('outdoors') },
    };
  }
  const urls = {
    dark: {
      base: `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
      labels: `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    },
    light: {
      base: `${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
      labels: `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    },
  };
  return {
    provider: 'esri',
    urls,
    attribution: '© Esri',
    attributionHtml: 'Tiles &copy; Esri',
    styles: { dark: rasterStyle(urls.dark), light: rasterStyle(urls.light) },
  };
}

const SETUP = tileSetup(process.env.EXPO_PUBLIC_STADIA_API_KEY ?? '');

export const MAP_TILE_PROVIDER: TileProvider = SETUP.provider;
export const MAP_TILE_URLS = SETUP.urls;
export const MAP_ATTRIBUTION = SETUP.attribution;
export const MAP_ATTRIBUTION_HTML = SETUP.attributionHtml;
export const MAP_STYLES = SETUP.styles;


