export interface EmissionState {
  lastCoords: { lat: number; lon: number } | null;
  lastTime: number;
}

export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadius = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

export function evaluateEmission(
  state: EmissionState,
  lat: number,
  lon: number,
  now: number,
  minDistanceMeters = 3,
  heartbeatIntervalMs = 10000,
): { emit: boolean; state: EmissionState } {
  if (!state.lastCoords) {
    return {
      emit: true,
      state: { lastCoords: { lat, lon }, lastTime: now },
    };
  }

  const distance = calculateDistanceMeters(state.lastCoords.lat, state.lastCoords.lon, lat, lon);
  const elapsed = now - state.lastTime;

  if (distance >= minDistanceMeters || elapsed >= heartbeatIntervalMs) {
    return {
      emit: true,
      state: { lastCoords: { lat, lon }, lastTime: now },
    };
  }

  return { emit: false, state };
}
