/**
 * Finds the named areas (street, neighborhood, city) around a Point's exact spot, so a host
 * can hide their location inside a region people recognize.
 *
 * Calls your backend when EXPO_PUBLIC_REGION_LOOKUP_URL is set, e.g.
 *   EXPO_PUBLIC_REGION_LOOKUP_URL=http://10.0.2.2:8080/api/v1/regions/lookup
 * The endpoint receives ?lat=..&lon=.. and returns { regions: PrivacyRegion[] }
 * (see regions_lookup.sql for the PostGIS side).
 *
 * Without it, or if the request fails, it returns approximate circular areas so the UI and
 * map preview still work during development.
 */

export type PrivacyRegionLevel = 'street' | 'neighborhood' | 'city';

export interface LatLon {
  latitude: number;
  longitude: number;
}

/** GeoJSON Polygon or MultiPolygon, coordinates in [lon, lat] order. */
export interface RegionGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface PrivacyRegion {
  id: string;
  level: PrivacyRegionLevel;
  /** What others see, e.g. "Wonderland Hills". */
  name: string;
  /** Where the public pin goes. Server side: ST_PointOnSurface of the region. */
  center: LatLon;
  /** Real outline when the server knows it. */
  geometry?: RegionGeometry;
  /** Used for the shaded circle when there's no outline (approximate mode). */
  radiusMeters?: number;
}

export interface RegionLookupResult {
  regions: PrivacyRegion[];
  /** 'server' = real named regions; 'approximate' = development fallback circles. */
  source: 'server' | 'approximate';
}

export const REGION_LOOKUP_URL: string = process.env.EXPO_PUBLIC_REGION_LOOKUP_URL ?? '';

const LEVEL_ORDER: PrivacyRegionLevel[] = ['street', 'neighborhood', 'city'];

const APPROXIMATE: Record<PrivacyRegionLevel, { radiusMeters: number; name: string }> = {
  street: { radiusMeters: 150, name: 'Nearby streets' },
  neighborhood: { radiusMeters: 750, name: 'This neighborhood' },
  city: { radiusMeters: 2000, name: 'This part of town' },
};

const EARTH_RADIUS_M = 6371000;

/** Small deterministic hash so the same spot always gets the same approximate offset. */
function hashSpot(latitude: number, longitude: number, salt: string): number {
  const key = `${latitude.toFixed(4)},${longitude.toFixed(4)},${salt}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function offsetPoint(origin: LatLon, distanceMeters: number, bearingRadians: number): LatLon {
  const dLat = (distanceMeters * Math.cos(bearingRadians)) / EARTH_RADIUS_M;
  const dLon =
    (distanceMeters * Math.sin(bearingRadians)) /
    (EARTH_RADIUS_M * Math.cos((origin.latitude * Math.PI) / 180));
  return {
    latitude: origin.latitude + (dLat * 180) / Math.PI,
    longitude: origin.longitude + (dLon * 180) / Math.PI,
  };
}

/**
 * Development fallback: circles whose centers are offset from the real spot (so the middle of
 * the circle never gives it away), always keeping the real spot inside the circle.
 * The real server must do its own offsetting or region lookup; this is only for the preview.
 */
export function approximateRegions(spot: LatLon): PrivacyRegion[] {
  return LEVEL_ORDER.map((level) => {
    const { radiusMeters, name } = APPROXIMATE[level];
    const distance = radiusMeters * (0.25 + 0.4 * hashSpot(spot.latitude, spot.longitude, `${level}-d`));
    const bearing = 2 * Math.PI * hashSpot(spot.latitude, spot.longitude, `${level}-b`);
    return {
      id: `approx-${level}`,
      level,
      name,
      center: offsetPoint(spot, distance, bearing),
      radiusMeters,
    };
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseRegion(raw: unknown): PrivacyRegion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const center = r.center as Record<string, unknown> | undefined;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  if (!LEVEL_ORDER.includes(r.level as PrivacyRegionLevel)) return null;
  if (!center || !isFiniteNumber(center.latitude) || !isFiniteNumber(center.longitude)) return null;
  const geometry = r.geometry as RegionGeometry | undefined;
  return {
    id: r.id,
    level: r.level as PrivacyRegionLevel,
    name: r.name,
    center: { latitude: center.latitude, longitude: center.longitude },
    geometry:
      geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') ? geometry : undefined,
    radiusMeters: isFiniteNumber(r.radiusMeters) ? r.radiusMeters : undefined,
  };
}

export async function lookupPrivacyRegions(spot: LatLon, signal?: AbortSignal): Promise<RegionLookupResult> {
  if (REGION_LOOKUP_URL) {
    try {
      const url = `${REGION_LOOKUP_URL}?lat=${spot.latitude}&lon=${spot.longitude}`;
      const response = await fetch(url, { signal });
      if (response.ok) {
        const body = (await response.json()) as { regions?: unknown[] };
        const regions = (body.regions ?? [])
          .map(parseRegion)
          .filter((region): region is PrivacyRegion => region !== null)
          .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
        if (regions.length > 0) return { regions, source: 'server' };
      }
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') throw error;
      // Fall through to the approximate areas.
    }
  }
  return { regions: approximateRegions(spot), source: 'approximate' };
}
