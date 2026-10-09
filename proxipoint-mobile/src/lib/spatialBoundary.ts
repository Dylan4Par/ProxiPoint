export type PlaceTier = 'poi' | 'address' | 'neighborhood' | 'locality' | 'city' | 'place';

export interface SpatialBoundary {
  centerLat: number;
  centerLon: number;
  radiusMeters: number;
  sourceTier: PlaceTier;
}

export interface PlaceTypeHints {
  type?: string;
  osm_key?: string;
  osm_value?: string;
}

/** Maps a geocoder label onto the same tiers the Go boundary engine uses. */
export function classifyPlaceTier(hints: PlaceTypeHints | undefined): PlaceTier {
  const raw = `${hints?.osm_value ?? ''} ${hints?.type ?? ''} ${hints?.osm_key ?? ''}`.toLowerCase();
  if (/\b(neighbourhood|neighborhood|suburb|quarter|district)\b/.test(raw)) return 'neighborhood';
  if (/\b(city|town|locality|municipality)\b/.test(raw)) {
    return /\b(city|town)\b/.test(raw) ? 'city' : 'locality';
  }
  if (/\b(house|street|building|address)\b/.test(raw) || /\b(highway|building)\b/.test(hints?.osm_key ?? '')) {
    return 'address';
  }
  if (/\b(poi|amenity|shop|tourism)\b/.test(raw)) return 'poi';
  return 'place';
}

export function radiusForTier(tier: PlaceTier): number {
  switch (tier) {
    case 'poi':
    case 'address':
      return 300;
    case 'neighborhood':
      return 1500;
    case 'locality':
    case 'city':
      return 8000;
    default:
      return 1000;
  }
}

/** A positive custom radius replaces the tier default, matching ResolveBoundary. */
export function resolveBoundary(
  latitude: number,
  longitude: number,
  placeType: string,
  customRadius?: number | null,
): SpatialBoundary {
  const sourceTier = classifyPlaceTier({ type: placeType });
  const radius =
    customRadius != null && Number.isFinite(customRadius) && customRadius > 0
      ? customRadius
      : radiusForTier(sourceTier);
  return { centerLat: latitude, centerLon: longitude, radiusMeters: radius, sourceTier };
}
