import type { BoundaryTier, BoundaryTierLevel } from '../types/beacon';

export const BOUNDARY_RADII: Record<BoundaryTierLevel, number> = {
  micro: 300,
  neighborhood: 1500,
  metro: 8000,
};

/** Discovery baseline used when a geocoder hit has no coordinates. */
export const FALLBACK_ANCHOR = { latitude: 40.061708, longitude: -105.038292 };

export interface ResolveTierParams {
  placeName?: string;
  placeType?: string;
}

export interface GeoAnchor {
  latitude: number;
  longitude: number;
  source: 'place' | 'baseline';
}

const NEIGHBORHOOD_TYPES = new Set(['neighborhood', 'district']);
const METRO_TYPES = new Set(['locality', 'city', 'metro']);

export function formatRadiusDisplay(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)}km`;
  }
  return `${meters}m`;
}

export function inferPlaceType(placeName = '', placeType?: string): string {
  const explicit = placeType?.trim().toLowerCase();
  if (explicit) return explicit;
  const name = placeName.toLowerCase();
  if (/\b(city|metro|municipal)\b/.test(name)) return 'city';
  if (/\b(neighborhood|district|quarter)\b/.test(name)) return 'neighborhood';
  if (/\b(street|st\b|ave|avenue|address|broadway)\b/.test(name)) return 'address';
  return 'poi';
}

export function getRecommendedTier(placeType?: string): BoundaryTierLevel {
  const normalized = placeType?.trim().toLowerCase() ?? '';
  if (NEIGHBORHOOD_TYPES.has(normalized)) return 'neighborhood';
  if (METRO_TYPES.has(normalized)) return 'metro';
  return 'micro';
}

export function compactPlaceLabel(placeName: string): string {
  const clean = placeName.trim();
  if (!clean) return '';
  if (clean.length > 20) return `${clean.slice(0, 19)}…`;
  return clean;
}

export function resolveAnchor(
  place?: { latitude?: number | null; longitude?: number | null } | null,
  fallback: { latitude: number; longitude: number } = FALLBACK_ANCHOR,
): GeoAnchor {
  const latitude = place?.latitude;
  const longitude = place?.longitude;
  if (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude)
  ) {
    return { latitude, longitude, source: 'place' };
  }
  return { latitude: fallback.latitude, longitude: fallback.longitude, source: 'baseline' };
}

export function resolveBoundaryTiers(params: ResolveTierParams = {}): BoundaryTier[] {
  const placeName = params.placeName ?? '';
  const semantic = inferPlaceType(placeName, params.placeType);
  const recommended = getRecommendedTier(semantic);
  const compact = compactPlaceLabel(placeName);
  // A street address stays on the generic tier names. Named venues can retitle the matching chip.
  const nameTheChip = semantic !== 'address';

  const labels: Record<BoundaryTierLevel, string> = {
    micro: recommended === 'micro' && compact && nameTheChip ? compact : 'Venue / Micro',
    neighborhood: recommended === 'neighborhood' && compact && nameTheChip ? compact : 'Neighborhood',
    metro: recommended === 'metro' && compact && nameTheChip ? compact : 'City Limits',
  };

  const icons: Record<BoundaryTierLevel, string> = {
    micro: '📍',
    neighborhood: '🏙️',
    metro: '🏛️',
  };

  const descriptions: Record<BoundaryTierLevel, string> = {
    micro: 'Immediate venue and block perimeter (300m)',
    neighborhood: 'Adjacent district and pedestrian corridor (1.5km)',
    metro: 'Municipal and regional commute reach (8km)',
  };

  return (['micro', 'neighborhood', 'metro'] as const).map((id) => ({
    id,
    label: labels[id],
    icon: icons[id],
    radiusMeters: BOUNDARY_RADII[id],
    displayRadius: formatRadiusDisplay(BOUNDARY_RADII[id]),
    description: descriptions[id],
  }));
}

export function zoomForRadius(radiusMeters: number): number {
  if (radiusMeters > 3000) return 12;
  if (radiusMeters > 1000) return 14;
  return 16;
}
