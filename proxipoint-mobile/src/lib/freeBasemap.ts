import { declutterPins, type LabelAnchor } from './pinDeclutter';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// OpenFreeMap's dark style. It is free, needs no API key, and is built from
// OpenStreetMap. MapLibre's attribution control has to stay visible.
export const FREE_DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
export const MAPLIBRE_JS_URL = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.1/dist/maplibre-gl.js';
export const MAPLIBRE_CSS_URL = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.1/dist/maplibre-gl.css';

export const DISCOVERY_MAP_ZOOM = 15;

export function metersPerPixel(latitude: number, zoom: number): number {
  const lat = Number.isFinite(latitude) ? latitude : 0;
  const z = Number.isFinite(zoom) ? zoom : 0;
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

// Map a screen-pixel nudge back onto the globe. Positive eastPx moves east.
// Positive southPx moves south. Used to fan pins that share a downtown geocode.
export function offsetGeographicPoint(
  point: GeoPoint,
  eastPx: number,
  southPx: number,
  zoom: number,
): GeoPoint {
  const meters = metersPerPixel(point.latitude, zoom);
  const cos = Math.cos((point.latitude * Math.PI) / 180) || 1e-6;
  return {
    latitude: point.latitude - (southPx * meters) / 110540,
    longitude: point.longitude + (eastPx * meters) / (111320 * cos),
  };
}

export function localPixel(point: GeoPoint, origin: GeoPoint, zoom: number): { x: number; y: number } {
  const meters = metersPerPixel(origin.latitude, zoom);
  const cos = Math.cos((origin.latitude * Math.PI) / 180) || 1e-6;
  const east = ((point.longitude - origin.longitude) * 111320 * cos) / meters;
  const north = ((point.latitude - origin.latitude) * 110540) / meters;
  return { x: east, y: -north };
}

// Bridges Leaflet zoom to the tactical declutter scale: wide zoom fans pins,
// and zoom 16 or closer lets non-identical pins sit on their real coordinate.
export function declutterScaleForZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return 0.55 + (zoom - 13) * 0.3;
}

export interface FannedPin extends GeoPoint {
  id: string;
  labelAnchor: LabelAnchor;
}

// Project nodes into the pixel space the declutter math expects, then convert
// the screen-pixel fan back into coordinates the basemap can plot.
export function fanPins(
  nodes: Array<GeoPoint & { id: string }>,
  origin: GeoPoint,
  zoom: number,
): FannedPin[] {
  const scale = declutterScaleForZoom(zoom);
  const safeScale = scale > 0 ? scale : 1;
  const projected = nodes.map((node) => {
    const pixel = localPixel(node, origin, zoom);
    return { id: node.id, x: pixel.x / safeScale, y: pixel.y / safeScale, node };
  });
  const placed = declutterPins(
    projected.map((pin) => ({ id: pin.id, x: pin.x, y: pin.y })),
    safeScale,
  );
  const byId = new Map(projected.map((pin) => [pin.id, pin]));
  return placed.map((pin) => {
    const base = byId.get(pin.id);
    const eastPx = base ? (pin.x - base.x) * safeScale : 0;
    const southPx = base ? (pin.y - base.y) * safeScale : 0;
    const moved = offsetGeographicPoint(base?.node ?? origin, eastPx, southPx, zoom);
    return {
      id: pin.id,
      latitude: moved.latitude,
      longitude: moved.longitude,
      labelAnchor: pin.labelAnchor,
    };
  });
}

export interface MapMarkerPayload {
  id: string;
  title: string;
  label: string;
  latitude: number;
  longitude: number;
  trueLatitude: number;
  trueLongitude: number;
  labelAnchor: LabelAnchor;
  selected: boolean;
}

export function buildMarkerPayload(
  nodes: Array<GeoPoint & { id: string; title: string; tag: string }>,
  origin: GeoPoint,
  zoom: number,
  selectedId: string | null,
): MapMarkerPayload[] {
  const fanned = new Map(fanPins(nodes, origin, zoom).map((pin) => [pin.id, pin]));
  return nodes.map((node) => {
    const pin = fanned.get(node.id);
    return {
      id: node.id,
      title: node.title,
      label: node.tag.replace(/^#/, ''),
      latitude: pin?.latitude ?? node.latitude,
      longitude: pin?.longitude ?? node.longitude,
      trueLatitude: node.latitude,
      trueLongitude: node.longitude,
      labelAnchor: pin?.labelAnchor ?? 'top',
      selected: node.id === selectedId,
    };
  });
}

export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function circlePolygon(center: GeoPoint, radiusMeters: number, steps = 64): GeoPoint[] {
  const count = Math.max(8, steps);
  const cos = Math.cos((center.latitude * Math.PI) / 180) || 1e-6;
  const ring: GeoPoint[] = [];
  for (let index = 0; index <= count; index += 1) {
    const angle = (2 * Math.PI * index) / count;
    ring.push({
      latitude: center.latitude + (Math.sin(angle) * radiusMeters) / 110540,
      longitude: center.longitude + (Math.cos(angle) * radiusMeters) / (111320 * cos),
    });
  }
  return ring;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
