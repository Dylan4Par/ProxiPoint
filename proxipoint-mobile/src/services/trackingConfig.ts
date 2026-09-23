export interface TrackingConfig {
  userId: string;
  radiusMeters: number;
  telemetryEnabled: boolean;
}

const globalConfig = globalThis as typeof globalThis & {
  __proxipointTracking?: TrackingConfig;
};

const fallback: TrackingConfig = {
  userId: '',
  radiusMeters: 100,
  telemetryEnabled: false,
};

export function setTrackingConfig(next: TrackingConfig) {
  globalConfig.__proxipointTracking = next;
}

export function hasTrackingConfig(): boolean {
  return globalConfig.__proxipointTracking != null;
}

export function getTrackingConfig(): TrackingConfig {
  return globalConfig.__proxipointTracking ?? fallback;
}
