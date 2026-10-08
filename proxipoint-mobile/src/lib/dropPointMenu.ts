import { MAX_DURATION_MINUTES } from './beaconSchedule';

export const ALERT_RADIUS_PRESETS = [
  { meters: 250, label: '250m' },
  { meters: 500, label: '500m' },
  { meters: 1000, label: '1km' },
] as const;

export const DURATION_PRESETS = [
  { minutes: 60, label: '1 hr' },
  { minutes: 120, label: '2 hrs' },
  { minutes: 240, label: '4 hrs' },
  { minutes: MAX_DURATION_MINUTES, label: 'All Day' },
] as const;

const MIN_ALERT_RADIUS_METERS = 50;
const MAX_ALERT_RADIUS_METERS = 10000;

/** Custom alert radius stays on 50 meter steps between 50 meters and 10 kilometers. */
export function clampAlertRadius(meters: number): number {
  if (!Number.isFinite(meters)) return 500;
  const stepped = Math.round(meters / 50) * 50;
  if (stepped < MIN_ALERT_RADIUS_METERS) return MIN_ALERT_RADIUS_METERS;
  if (stepped > MAX_ALERT_RADIUS_METERS) return MAX_ALERT_RADIUS_METERS;
  return stepped;
}
