import type { ProximityAlert } from '../types/telemetry';

export interface MapPoint {
  lat: number;
  lon: number;
}

export interface LatLngBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface FitBoundsOptions {
  animate?: boolean;
  duration?: number;
  padding?: number;
}

export interface BoundsMap {
  fitBounds(bounds: [[number, number], [number, number]], options?: FitBoundsOptions): void;
}

export const MARKER_TRANSITION_CSS = `
  .leaflet-marker-icon {
    transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
  }
`;

export function installMarkerTransitionStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('proxipoint-marker-transition')) return;
  const style = document.createElement('style');
  style.id = 'proxipoint-marker-transition';
  style.innerHTML = MARKER_TRANSITION_CSS;
  document.head.appendChild(style);
}

export function boundsForActivePins(user: MapPoint, targets: ProximityAlert[]): LatLngBounds | null {
  if (targets.length === 0) return null;

  const lats = [user.lat, ...targets.map((target) => target.latitude)];
  const lngs = [user.lon, ...targets.map((target) => target.longitude)];
  return {
    south: Math.min(...lats),
    north: Math.max(...lats),
    west: Math.min(...lngs),
    east: Math.max(...lngs),
  };
}

export function padBounds(bounds: LatLngBounds, ratio: number): LatLngBounds {
  const latPad = Math.abs(bounds.north - bounds.south) * ratio;
  const lngPad = Math.abs(bounds.east - bounds.west) * ratio;
  return {
    south: bounds.south - latPad,
    north: bounds.north + latPad,
    west: bounds.west - lngPad,
    east: bounds.east + lngPad,
  };
}

// Leaflet fitBounds keeps every active pin inside a 25% padded frame.
export function fitLeafletBounds(map: BoundsMap, bounds: LatLngBounds) {
  const padded = padBounds(bounds, 0.25);
  map.fitBounds(
    [
      [padded.south, padded.west],
      [padded.north, padded.east],
    ],
    { animate: true, duration: 0.5 },
  );
}

// MapLibre's LngLat order is longitude, latitude and duration is milliseconds.
export function fitMapLibreBounds(map: BoundsMap, bounds: LatLngBounds) {
  const padded = padBounds(bounds, 0.25);
  map.fitBounds(
    [
      [padded.west, padded.south],
      [padded.east, padded.north],
    ],
    { animate: true, duration: 500, padding: 24 },
  );
}
