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

export interface FocusTarget {
  id: string;
  latitude: number;
  longitude: number;
}

export interface FocusMap {
  setView(center: [number, number], zoom: number, options?: { animate?: boolean }): void;
}

export const FOCUS_ZOOM = 17;

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

export function parseFocusTarget(params: {
  focusLat?: string | string[];
  focusLon?: string | string[];
  focusId?: string | string[];
}): FocusTarget | null {
  const lat = Number(firstParam(params.focusLat));
  const lon = Number(firstParam(params.focusLon));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {
    id: firstParam(params.focusId) ?? '',
    latitude: lat,
    longitude: lon,
  };
}

export function focusLeafletOnTarget(map: FocusMap, target: FocusTarget, zoom = FOCUS_ZOOM) {
  map.setView([target.latitude, target.longitude], zoom, { animate: true });
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
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
