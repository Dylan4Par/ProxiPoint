import seed from './regionSeed.json';

export const DEFAULT_REGION_TOLERANCE_METERS = 15;

export interface RegionMatch {
  id: number;
  name: string;
  regionType: string;
  parentRegionId: number | null;
  areaSquareMeters: number;
}

interface SeedFeature {
  properties: {
    name: string;
    region_type: string;
    parent_name?: string;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

type Ring = Array<[number, number]>;
type Polygon = Ring[];
type MultiPolygon = Polygon[];

interface LoadedRegion {
  id: number;
  name: string;
  regionType: string;
  parentRegionId: number | null;
  areaSquareMeters: number;
  geom: MultiPolygon;
}

const EARTH_RADIUS_METERS = 6371000;

function asMultiPolygon(feature: SeedFeature): MultiPolygon {
  if (feature.geometry.type === 'Polygon') {
    return [feature.geometry.coordinates as number[][][]].map(toPolygon);
  }
  return (feature.geometry.coordinates as number[][][][]).map(toPolygon);
}

function toPolygon(rings: number[][][]): Polygon {
  return rings.map((ring) => ring.map((point) => [point[0], point[1]] as [number, number]));
}

function pointInRing(longitude: number, latitude: number, ring: Ring): boolean {
  let inside = false;
  let j = ring.length - 1;
  for (let i = 0; i < ring.length; i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > latitude !== yj > latitude && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

function polygonContains(longitude: number, latitude: number, rings: Polygon): boolean {
  if (rings.length === 0 || !pointInRing(longitude, latitude, rings[0])) return false;
  for (let hole = 1; hole < rings.length; hole += 1) {
    if (pointInRing(longitude, latitude, rings[hole])) return false;
  }
  return true;
}

function contains(geom: MultiPolygon, longitude: number, latitude: number): boolean {
  return geom.some((polygon) => polygonContains(longitude, latitude, polygon));
}

function projectMeters(longitude: number, latitude: number, originLon: number, originLat: number): [number, number] {
  const cosLat = Math.cos((originLat * Math.PI) / 180);
  const x = ((longitude - originLon) * Math.PI) / 180 * cosLat * EARTH_RADIUS_METERS;
  const y = ((latitude - originLat) * Math.PI) / 180 * EARTH_RADIUS_METERS;
  return [x, y];
}

function ringAreaSquareMeters(ring: Ring): number {
  if (ring.length < 3) return 0;
  const [lon0, lat0] = ring[0];
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const next = ring[(i + 1) % ring.length];
    const [x1, y1] = projectMeters(ring[i][0], ring[i][1], lon0, lat0);
    const [x2, y2] = projectMeters(next[0], next[1], lon0, lat0);
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function areaSquareMeters(geom: MultiPolygon): number {
  return geom.reduce((total, polygon) => {
    if (polygon.length === 0) return total;
    let area = ringAreaSquareMeters(polygon[0]);
    for (let hole = 1; hole < polygon.length; hole += 1) {
      area -= ringAreaSquareMeters(polygon[hole]);
    }
    return area > 0 ? total + area : total;
  }, 0);
}

function distancePointToSegment(longitude: number, latitude: number, a: [number, number], b: [number, number]): number {
  const [ax, ay] = projectMeters(a[0], a[1], longitude, latitude);
  const [bx, by] = projectMeters(b[0], b[1], longitude, latitude);
  const dx = bx - ax;
  const dy = by - ay;
  const denom = dx * dx + dy * dy;
  let t = 0;
  if (denom > 0) {
    t = Math.min(1, Math.max(0, (-ax * dx - ay * dy) / denom));
  }
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function distanceMeters(geom: MultiPolygon, longitude: number, latitude: number): number {
  if (contains(geom, longitude, latitude)) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (const polygon of geom) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length; i += 1) {
        const next = ring[(i + 1) % ring.length];
        const distance = distancePointToSegment(longitude, latitude, ring[i], next);
        if (distance < best) best = distance;
      }
    }
  }
  return best;
}

function loadRegions(): LoadedRegion[] {
  const features = (seed as { features: SeedFeature[] }).features;
  const loaded: LoadedRegion[] = features.map((feature, index) => {
    const geom = asMultiPolygon(feature);
    return {
      id: index + 1,
      name: feature.properties.name,
      regionType: feature.properties.region_type,
      parentRegionId: null,
      areaSquareMeters: areaSquareMeters(geom),
      geom,
    };
  });
  const byName = new Map(loaded.map((region) => [region.name, region]));
  for (let i = 0; i < features.length; i += 1) {
    const parentName = features[i].properties.parent_name;
    if (!parentName) continue;
    const parent = byName.get(parentName);
    loaded[i].parentRegionId = parent ? parent.id : null;
  }
  return loaded;
}

const REGIONS = loadRegions();

export function locateRegions(
  longitude: number,
  latitude: number,
  toleranceMeters = DEFAULT_REGION_TOLERANCE_METERS,
): RegionMatch[] {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
  const matched = REGIONS.filter((region) => {
    if (contains(region.geom, longitude, latitude)) return true;
    if (toleranceMeters <= 0) return false;
    return distanceMeters(region.geom, longitude, latitude) <= toleranceMeters;
  }).sort((a, b) => a.areaSquareMeters - b.areaSquareMeters || a.name.localeCompare(b.name));

  const seen = new Set<number>();
  const hits: RegionMatch[] = [];
  const push = (region: LoadedRegion) => {
    if (seen.has(region.id)) return;
    seen.add(region.id);
    hits.push({
      id: region.id,
      name: region.name,
      regionType: region.regionType,
      parentRegionId: region.parentRegionId,
      areaSquareMeters: region.areaSquareMeters,
    });
  };
  matched.forEach(push);
  for (const region of matched) {
    let parentId = region.parentRegionId;
    while (parentId != null) {
      const parent = REGIONS.find((item) => item.id === parentId);
      if (!parent || seen.has(parent.id)) break;
      push(parent);
      parentId = parent.parentRegionId;
    }
  }
  return hits;
}

export function regionLabel(matches: RegionMatch[]): string {
  return matches.map((match) => match.name).join(' · ');
}
