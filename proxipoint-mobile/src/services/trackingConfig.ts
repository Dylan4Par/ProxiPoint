export interface TrackingConfig {
  userId: string;
  radiusMeters: number;
}

const globalConfig = globalThis as typeof globalThis & {
  __proxipointTracking?: TrackingConfig;
};

const fallback: TrackingConfig = {
  userId: 'dev-device-01',
  radiusMeters: 100,
};

export function setTrackingConfig(next: TrackingConfig) {
  globalConfig.__proxipointTracking = next;
}

export function getTrackingConfig(): TrackingConfig {
  return globalConfig.__proxipointTracking ?? fallback;
}
