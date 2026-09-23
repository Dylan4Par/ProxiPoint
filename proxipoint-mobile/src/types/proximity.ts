export interface ProximityAlertItem {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
}
export interface ProximityAlertPacket {
  type: 'proximity_alerts';
  alerts: ProximityAlertItem[];
}
export interface ClientLocationPing {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  radiusMeters: number;
  timestamp: string;
}
