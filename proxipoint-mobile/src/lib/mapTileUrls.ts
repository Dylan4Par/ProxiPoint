/**
 * Basemap tiles shared by every map in the app (Explore Map and the Leaflet maps in Create Drop),
 * so they all look the same: Esri's Light / Dark Gray Canvas, base plus street-name labels.
 * For production, use an ArcGIS Location Platform key (append `?token=KEY`) or swap these for
 * another provider you're licensed to use.
 */
export const MAP_TILE_URLS = {
  dark: {
    base: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labels: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  },
  light: {
    base: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labels: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  },
} as const;

/** The sharpest zoom these basemaps have; closer in, maps scale these tiles up. */
export const MAP_TILE_MAX_ZOOM = 16;
