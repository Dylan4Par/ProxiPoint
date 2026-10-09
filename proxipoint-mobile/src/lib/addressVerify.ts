import { classifyPlaceTier, type PlaceTier } from './spatialBoundary';

export interface VerifiedAddress {
  query: string;
  label: string;
  latitude: number;
  longitude: number;
  placeType: PlaceTier;
}

export interface PhotonProperties {
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  state?: string;
  county?: string;
  country?: string;
  postcode?: string;
  type?: string;
  osm_key?: string;
  osm_value?: string;
}

export interface PhotonFeature {
  geometry?: { coordinates?: number[] };
  properties?: PhotonProperties;
}

export function labelFromPhotonProperties(props: PhotonProperties): string {
  const streetLine = [props.housenumber, props.street].filter(Boolean).join(' ').trim();
  const named = props.name?.trim();
  const place = named && named !== props.street?.trim() ? named : '';
  const locality = [props.city || props.county, props.state, props.postcode].filter(Boolean).join(', ');
  return [place, streetLine, locality, props.country].filter(Boolean).join(', ');
}

export function interpretPhotonFeatures(query: string, features: PhotonFeature[]): VerifiedAddress | null {
  const feature = features.find((item) => Array.isArray(item.geometry?.coordinates));
  const coordinates = feature?.geometry?.coordinates;
  if (!feature || !coordinates || coordinates.length < 2) return null;

  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const label = labelFromPhotonProperties(feature.properties ?? {});
  if (!label) return null;

  return {
    query: query.trim(),
    label,
    latitude,
    longitude,
    placeType: classifyPlaceTier(feature.properties),
  };
}

export function isSameVerifiedQuery(verified: VerifiedAddress | null, address: string): boolean {
  return Boolean(verified && verified.query === address.trim() && address.trim().length > 0);
}
