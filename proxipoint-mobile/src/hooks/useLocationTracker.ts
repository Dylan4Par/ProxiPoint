import { useCallback, useRef } from 'react';
import { evaluateEmission, type EmissionState } from '../lib/locationFilter';

export { calculateDistanceMeters } from '../lib/locationFilter';

export function useLocationJitterFilter(minDistanceMeters = 3, heartbeatIntervalMs = 10000) {
  const emission = useRef<EmissionState>({ lastCoords: null, lastTime: 0 });

  const shouldEmitPing = useCallback(
    (newLat: number, newLon: number): boolean => {
      const decision = evaluateEmission(
        emission.current,
        newLat,
        newLon,
        Date.now(),
        minDistanceMeters,
        heartbeatIntervalMs,
      );
      emission.current = decision.state;
      return decision.emit;
    },
    [minDistanceMeters, heartbeatIntervalMs],
  );

  return { shouldEmitPing };
}
