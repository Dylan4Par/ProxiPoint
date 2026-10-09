export type BeaconVisibility = 'private' | 'tag_network' | 'public';

export const BEACON_DURATIONS = ['1 hr', '2 hrs', '4 hrs', 'All Day'] as const;

export type BeaconDuration = (typeof BEACON_DURATIONS)[number];

export interface PlaceSuggestion {
  id: string;
  label: string;
  subtitle: string;
  latitude: number;
  longitude: number;
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
}
