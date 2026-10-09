import { resolveBeaconCreateUrl } from '../lib/beaconDraft';
import type { BeaconCreatePayload, PersistedBeacon } from '../types/beacon';

export function beaconCreateUrl(): string {
  return resolveBeaconCreateUrl({
    beaconUrl: process.env.EXPO_PUBLIC_BEACON_URL,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  });
}

export class BeaconApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'BeaconApiError';
    this.status = status;
  }
}

interface CreateBeaconResponse {
  beacon?: PersistedBeacon;
  notified_user_ids?: string[];
}

export async function postBeacon(payload: BeaconCreatePayload): Promise<PersistedBeacon> {
  let response: Response;
  try {
    response = await fetch(beaconCreateUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Beacon create failed';
    throw new BeaconApiError(0, message);
  }

  if (!response.ok) {
    throw new BeaconApiError(response.status, `Beacon create failed: ${response.status}`);
  }

  const body = (await response.json()) as CreateBeaconResponse | PersistedBeacon;
  const beacon = 'beacon' in body && body.beacon ? body.beacon : (body as PersistedBeacon);
  if (!beacon?.id) {
    throw new BeaconApiError(response.status, 'Beacon response missing id');
  }
  return beacon;
}
