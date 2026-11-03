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

const YARDS_PER_METER = 1.0936133;

/**
 * A measured distance in words, for Discover's cards: "12 miles", "1.4 miles", "1 mile",
 * "350 yards" (under a quarter mile); "800 meters", "1.4 kilometers", "1 kilometer".
 */
export function formatDistanceWordsIn(meters: number | undefined | null, units: DistanceUnits): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;
  const plural = (n: string, one: string, many: string) => `${n} ${n === '1' ? one : many}`;
  if (units === 'imperial') {
    const miles = meters / METERS_PER_MILE;
    if (miles < 0.25) return plural(withCommas(Math.max(10, Math.round((meters * YARDS_PER_METER) / 10) * 10)), 'yard', 'yards');
    return plural(miles < 10 ? String(Number(miles.toFixed(1))) : withCommas(Math.round(miles)), 'mile', 'miles');
  }
  if (meters < 1000) return plural(withCommas(Math.max(10, Math.round(meters / 10) * 10)), 'meter', 'meters');
  const km = meters / 1000;
  return plural(km < 10 ? String(Number(km.toFixed(1))) : withCommas(Math.round(km)), 'kilometer', 'kilometers');
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

/** A range in words, for menus: "1 mile", "15 miles", "0.5 miles", "10 km" (null: "Any distance"). */
export function formatRangeWords(meters: number | null, units: DistanceUnits): string {
  if (meters == null) return 'Any distance';
  const short = formatRadiusIn(meters, units);
  if (!short.endsWith(' mi')) return short;
  const n = short.slice(0, -3);
  return `${n} ${n === '1' ? 'mile' : 'miles'}`;
}

/** Range choices for Discover search in these units (null = any distance). */
export function searchRanges(units: DistanceUnits): Array<{ label: string; meters: number | null }> {
  const meters =
    units === 'imperial'
      ? [1, 3, 5, 15].map((miles) => Math.round(miles * METERS_PER_MILE))
      : [1000, 5000, 10000, 25000];
  return [...meters.map((m) => ({ label: formatRadiusIn(m, units), meters: m as number | null })), { label: 'Any', meters: null }];
}

/** The searchRanges choice closest to `meters` in these units (null = any distance stays null). */
export function nearestReach(meters: number | null, units: DistanceUnits): number | null {
  if (meters == null) return null;
  const choices = searchRanges(units)
    .map((option) => option.meters)
    .filter((m): m is number => m != null);
  return choices.reduce((best, m) => (Math.abs(m - meters) < Math.abs(best - meters) ? m : best), choices[0]);
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
