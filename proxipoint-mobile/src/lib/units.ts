import { useEffect, useState } from 'react';

/**
 * Distance units for the whole app (Settings › App settings › Distance units). Everything that
 * shows a distance goes through formatDistanceIn / formatRadiusIn with the current units, so
 * changing the setting updates every screen. In memory here; DiscoverScreen saves it on the phone.
 */

export type DistanceUnits = 'metric' | 'imperial';

const FEET_PER_METER = 3.28084;
const METERS_PER_MILE = 1609.344;

/** Places that use miles: the US, Liberia, Myanmar (and the UK for road distances). */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM', 'GB']);

/** The phone's region decides the default: miles in the US, kilometers elsewhere. */
export function defaultUnits(locale?: string): DistanceUnits {
  let tag = locale;
  if (!tag) {
    try {
      tag = Intl.NumberFormat().resolvedOptions().locale;
    } catch {
      tag = '';
    }
  }
  const region = (tag ?? '').split(/[-_]/).find((part, i) => i > 0 && /^[A-Z]{2}$/.test(part));
  return region && IMPERIAL_REGIONS.has(region) ? 'imperial' : 'metric';
}

const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** A measured distance: "316m" / "1.4 km", or "330 ft" (under 0.1 mi) / "0.2 mi". */
export function formatDistanceIn(meters: number | undefined | null, units: DistanceUnits): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;
  if (units === 'imperial') {
    const feet = meters * FEET_PER_METER;
    if (feet < 528) return `${withCommas(Math.max(10, Math.round(feet / 10) * 10))} ft`;
    const miles = meters / METERS_PER_MILE;
    return `${miles < 10 ? miles.toFixed(1) : withCommas(Math.round(miles))} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

/** A round radius or range: "5 km", "500 m", "3 mi", "0.5 mi". */
export function formatRadiusIn(meters: number, units: DistanceUnits): string {
  if (units === 'imperial') {
    const miles = meters / METERS_PER_MILE;
    if (miles < 0.2) return `${withCommas(Math.round((meters * FEET_PER_METER) / 50) * 50)} ft`;
    return `${miles < 0.95 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

/** Range choices for Discover search in these units (null = any distance). */
export function searchRanges(units: DistanceUnits): Array<{ label: string; meters: number | null }> {
  const meters =
    units === 'imperial'
      ? [1, 3, 5, 15].map((miles) => Math.round(miles * METERS_PER_MILE))
      : [1000, 5000, 10000, 25000];
  return [...meters.map((m) => ({ label: formatRadiusIn(m, units), meters: m as number | null })), { label: 'Any', meters: null }];
}

/** Default Discover range: 10 km, or about 5 miles. */
export function defaultRangeMeters(units: DistanceUnits): number {
  return units === 'imperial' ? Math.round(5 * METERS_PER_MILE) : 10000;
}

// ---- Store ----------------------------------------------------------------------------------

let current: DistanceUnits = defaultUnits();
const listeners = new Set<() => void>();

export function getUnits(): DistanceUnits {
  return current;
}

export function setUnits(units: DistanceUnits): void {
  if (units === current) return;
  current = units;
  listeners.forEach((listener) => listener());
}

/** Re-renders when the setting changes. */
export function useUnits(): DistanceUnits {
  const [units, setState] = useState(current);
  useEffect(() => {
    const listener = () => setState(current);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return units;
}
