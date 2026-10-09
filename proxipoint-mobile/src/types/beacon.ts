export type BeaconVisibility = 'private' | 'tag_network' | 'public';

export const BEACON_DURATIONS = ['1 hr', '2 hrs', '4 hrs', 'All Day'] as const;

export type BeaconDuration = (typeof BEACON_DURATIONS)[number];

export type BoundaryTierLevel = 'micro' | 'neighborhood' | 'metro';

export type PlaceSemanticType =
  | 'poi'
  | 'address'
  | 'micro'
  | 'neighborhood'
  | 'district'
  | 'locality'
  | 'city'
  | 'metro';

export interface BoundaryTier {
  id: BoundaryTierLevel;
  label: string;
  icon: string;
  radiusMeters: number;
  displayRadius: string;
  description: string;
}

export interface PlaceSuggestion {
  id: string;
  label: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  placeType?: PlaceSemanticType | string;
}

export interface PreviewGeofence {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface DropBeaconInput {
  title: string;
  tags: string;
  visibility: BeaconVisibility;
  venue: string;
  latitude: number;
  longitude: number;
  isLiveNow: boolean;
  duration: BeaconDuration;
  scheduledStart: string;
  radiusMeters?: number;
  tierLevel?: BoundaryTierLevel;
}

export interface BeaconDraft extends DropBeaconInput {
  radiusMeters: number;
  tierLevel: BoundaryTierLevel;
}
