import { useEffect, useState } from 'react';

/**
 * Which times the Explore Map and cards show.
 * Default: the next 3 days (today, tomorrow and the day after), so busy places don't fill the
 * map with events weeks away. The map's When filter offers quick presets (next 3 hours, tonight,
 * tomorrow, this weekend, next 7 days), and the Calendar can pick any dates ("Show on map").
 */

export const DEFAULT_DAYS = 3;

export type TimePreset = 'next3h' | 'tonight' | 'tomorrow' | 'weekend' | 'days3' | 'week';

export const TIME_PRESETS: Array<{ id: TimePreset; label: string }> = [
  { id: 'next3h', label: 'Next 3 hours' },
  { id: 'tonight', label: 'Tonight' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'weekend', label: 'This weekend' },
  { id: 'days3', label: 'Next 3 days' },
  { id: 'week', label: 'Next 7 days' },
];

export interface TimeWindow {
  /** ms since epoch */
  start: number;
  end: number;
  /** True when it's anything but the default next 3 days (a preset or Calendar dates). */
  custom: boolean;
  /** The preset in use, or null for Calendar dates. */
  preset: TimePreset | null;
}

let custom: { start: number; end: number } | null = null;
let preset: TimePreset = 'days3';
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

const HOUR = 3600000;

function endOfDay(date: Date | number): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function startOfDay(date: Date | number): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function atHour(date: Date | number, hour: number, dayOffset = 0): number {
  const d = new Date(date);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

/**
 * The window a preset covers, at `now` (local time):
 * - next 3 hours: now → now + 3h
 * - tonight: from 5 pm (or now, if later) until 2 am
 * - tomorrow: all of tomorrow
 * - this weekend: Friday 5 pm → Sunday night (from now once it's started)
 * - next 3 / 7 days: now → the end of the 3rd / 7th day (today counts)
 */
export function presetWindow(id: TimePreset, now = Date.now()): { start: number; end: number } {
  const today = new Date(now);
  switch (id) {
    case 'next3h':
      return { start: now, end: now + 3 * HOUR };
    case 'tonight': {
      // Just after midnight still counts as tonight (until 2 am).
      if (today.getHours() < 2) return { start: now, end: atHour(now, 2) };
      return { start: Math.max(now, atHour(now, 17)), end: atHour(now, 2, 1) };
    }
    case 'tomorrow':
      return { start: startOfDay(atHour(now, 12, 1)), end: endOfDay(atHour(now, 12, 1)) };
    case 'weekend': {
      const day = today.getDay(); // 0 Sun … 6 Sat
      const toFriday = day === 0 ? -2 : 5 - day; // Sunday: this weekend started Friday
      const fridayEvening = atHour(now, 17, toFriday);
      const sundayNight = endOfDay(atHour(now, 12, toFriday + 2));
      return { start: Math.max(now, fridayEvening), end: sundayNight };
    }
    case 'week':
      return { start: now, end: endOfDay(atHour(now, 12, 6)) };
    case 'days3':
    default:
      return { start: now, end: endOfDay(atHour(now, 12, DEFAULT_DAYS - 1)) };
  }
}

export function getTimeWindow(now = Date.now()): TimeWindow {
  if (custom) return { ...custom, custom: true, preset: null };
  return { ...presetWindow(preset, now), custom: preset !== 'days3', preset };
}

/** "Tonight", "Next 3 days", or null for Calendar dates (show the dates instead). */
export function timeWindowLabel(window: TimeWindow): string | null {
  return window.preset ? TIME_PRESETS.find((item) => item.id === window.preset)?.label ?? null : null;
}

/** Show these days on the map (whole days, inclusive). Null = back to the next 3 days. */
export function setTimeWindow(range: { start: Date; end: Date } | null) {
  if (!range) {
    custom = null;
    preset = 'days3';
  } else {
    custom = { start: startOfDay(range.start), end: endOfDay(range.end) };
  }
  changed();
}

/** Use a preset (clears Calendar dates). */
export function setTimePreset(next: TimePreset) {
  custom = null;
  preset = next;
  changed();
}

/** Is the Point on at any time inside the window? Points without times always show. */
export function inTimeWindow(node: unknown, window: TimeWindow = getTimeWindow()): boolean {
  const n = (node ?? {}) as { startsAt?: unknown; endsAt?: unknown };
  if (typeof n.startsAt !== 'string') return true;
  const start = new Date(n.startsAt).getTime();
  const end = typeof n.endsAt === 'string' ? new Date(n.endsAt).getTime() : start + HOUR;
  if (!Number.isFinite(start)) return true;
  // Overlaps [window.start, window.end]; live Points (already started) count from now.
  return start <= window.end && end >= window.start;
}

/** Re-renders when the window changes, and every minute (the windows move with time). */
export function useTimeWindow(): TimeWindow {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    const timer = setInterval(listener, 60 * 1000);
    return () => {
      listeners.delete(listener);
      clearInterval(timer);
    };
  }, []);
  return getTimeWindow();
}
