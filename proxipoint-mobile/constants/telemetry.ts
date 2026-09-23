export const ERIE_LATITUDE = 40.0503;
export const ERIE_LONGITUDE = -105.0497;

export const DEFAULT_WS_ENDPOINT = 'ws://127.0.0.1:8080/ws/telemetry';

export type TelemetryPing = {
  kind: 'ping';
  latitude: number;
  longitude: number;
  label: string;
};

export const ERIE_MOCK_PING: TelemetryPing = {
  kind: 'ping',
  latitude: ERIE_LATITUDE,
  longitude: ERIE_LONGITUDE,
  label: 'Erie',
};

export function telemetryEndpoint(): string {
  const configured = process.env.EXPO_PUBLIC_WS_ENDPOINT;
  if (configured && configured.length > 0) {
    return configured;
  }
  return DEFAULT_WS_ENDPOINT;
}
