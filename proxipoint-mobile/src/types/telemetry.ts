export interface LocationPingPayload {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  radiusMeters: number;
  timestamp: string;
}

export interface LocationPingPacket {
  type: 'location_ping';
  payload: LocationPingPayload;
}

export interface ProximityAlert {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
}

export interface ActiveContact extends ProximityAlert {
  observedAt: number;
}

export interface ProximityAlertEvent {
  targetEntityId: string;
  targetName?: string;
  distanceMeters: number;
  latitude: number;
  longitude: number;
  message?: string;
}

export interface ProximityAlertPacket {
  type: 'proximity_alerts';
  alerts: ProximityAlert[];
}

export const RADIUS_PRESETS = [50, 100, 250, 500] as const;
export type RadiusPreset = (typeof RADIUS_PRESETS)[number];

export const DEFAULT_RADIUS_METERS: RadiusPreset = 100;
