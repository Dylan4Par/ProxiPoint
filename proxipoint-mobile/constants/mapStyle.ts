/**
 * OpenStreetMap standard raster tiles for the Leaflet web map.
 * CARTO `dark_all` and `rastertiles/voyager` both paint an
 * "API KEY REQUIRED" watermark. These tiles do not. Attribution is required.
 */
export const TILE_LAYER_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Keyless dark vector style for the native MapLibre map. */
export const NATIVE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
