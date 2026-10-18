import { useEffect, useState } from 'react';

/**
 * Which dates the Discover map and cards show.
 * Default: the next 3 days (today, tomorrow and the day after), so busy places don't fill the
 * map with events weeks away. The Calendar can widen it to any dates ("Show on map"), and the
 * date chip on the map puts it back.
 */

export const DEFAULT_DAYS = 3;

export interface TimeWindow {
  /** ms since epoch */
  start: number;
  end: number;
  /** True when picked in the Calendar (not the default 3 days). */
  custom: boolean;
}

let custom: { start: number; end: number } | null = null;
const listeners = new Set<() => void>();

function endOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function getTimeWindow(now = Date.now()): TimeWindow {
  if (custom) return { ...custom, custom: true };
  const last = new Date(now);
  last.setDate(last.getDate() + DEFAULT_DAYS - 1);
  return { start: now, end: endOfDay(last), custom: false };
}

/** Show these days on the map (whole days, inclusive). Null = back to the next 3 days. */
export function setTimeWindow(range: { start: Date; end: Date } | null) {
  if (!range) custom = null;
  else {
    const start = new Date(range.start);
    start.setHours(0, 0, 0, 0);
    custom = { start: start.getTime(), end: endOfDay(range.end) };
  }
  listeners.forEach((listener) => listener());
}

/** Is the Point on at any time inside the window? Points without times always show. */
export function inTimeWindow(node: unknown, window: TimeWindow = getTimeWindow()): boolean {
  const n = (node ?? {}) as { startsAt?: unknown; endsAt?: unknown };
  if (typeof n.startsAt !== 'string') return true;
  const start = new Date(n.startsAt).getTime();
  const end = typeof n.endsAt === 'string' ? new Date(n.endsAt).getTime() : start + 60 * 60 * 1000;
  if (!Number.isFinite(start)) return true;
  // Overlaps [window.start, window.end]; live Points (already started) count from now.
  return start <= window.end && end >= window.start;
}

/** Re-renders when the window changes, and every minute (the default window moves with time). */
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
