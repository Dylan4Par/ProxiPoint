import type { LocationPingPayload, ProximityAlert } from '../types/telemetry';

const DEFAULT_PING_URL = 'http://127.0.0.1:8080/api/v1/telemetry/ping';

export function telemetryPingUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL || DEFAULT_PING_URL;
}

export function telemetrySocketUrl(): string {
  if (process.env.EXPO_PUBLIC_WS_URL) return process.env.EXPO_PUBLIC_WS_URL;
  return telemetryPingUrl().replace(/^http/i, 'ws').replace(/\/ping$/, '/ws');
}

export async function postTelemetryPing(payload: LocationPingPayload): Promise<ProximityAlert[]> {
  const response = await fetch(telemetryPingUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Telemetry ping failed: ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) return [];
  return body as ProximityAlert[];
}
