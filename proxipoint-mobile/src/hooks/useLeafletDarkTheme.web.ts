import { useEffect } from 'react';
import { Platform } from 'react-native';

const STYLE_ID = 'leaflet-dark-mode-override';

/**
 * Dark inversion for OpenStreetMap raster tiles.
 * Scoped to `.leaflet-tile-pane` so marker, popup, and overlay panes stay sharp.
 * Tile images in this project inherit `filter` from the pane (Leaflet's
 * `.leaflet-tile { filter: inherit }`), which would invert each tile and then
 * invert the pane again. Resetting the tile filter keeps a single pass.
 */
const DARK_TILE_CSS = `
      /* Dark mode inversion filter applied strictly to raster tile images */
      .leaflet-tile-pane {
        filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3);
      }
      .leaflet-tile-pane .leaflet-tile {
        filter: none;
      }
      /* Prevent markers, popups, and HUD overlays from inheriting the color inversion */
      .leaflet-marker-pane,
      .leaflet-popup-pane,
      .leaflet-overlay-pane {
        filter: none !important;
      }
    `;

export function useLeafletDarkTheme() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.innerHTML = DARK_TILE_CSS;
    document.head.appendChild(style);

    return () => {
      const existing = document.getElementById(STYLE_ID);
      if (existing) existing.remove();
    };
  }, []);
}
