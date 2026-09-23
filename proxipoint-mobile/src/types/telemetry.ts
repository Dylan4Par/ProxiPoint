export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface LocationPingPayload {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: string;
}

export interface ProximityAlertEvent {
  alertId: string;
  targetEntityId: string;
  targetName?: string;
  distanceMeters: number;
  thresholdMeters: number;
  latitude: number;
  longitude: number;
  triggeredAt: string;
  message?: string;
}

export interface ServerMessage<T = unknown> {
  type: 'ack' | 'proximity_alert' | 'error' | 'heartbeat';
  payload: T;
}
