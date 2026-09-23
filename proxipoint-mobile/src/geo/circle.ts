import type { Feature, Polygon } from 'geojson';

const EARTH_RADIUS_METERS = 6378137;

/** Approximate a geodesic circle as a GeoJSON polygon for native MapLibre fill layers. */
export function circlePolygon(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  steps = 64,
): Feature<Polygon> {
  const coordinates: [number, number][] = [];
  const lat1 = (latitude * Math.PI) / 180;
  const lon1 = (longitude * Math.PI) / 180;
  const angular = radiusMeters / EARTH_RADIUS_METERS;

  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      );
    coordinates.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  };
}
