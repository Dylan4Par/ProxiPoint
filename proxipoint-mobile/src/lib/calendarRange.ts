/**
 * Date helpers for the Discover calendar: day math, ranges, and which Points fall in a range.
 * Days are local-time midnights.
 */

export interface DayRange {
  start: Date;
  /** Inclusive (same as start for a single day). */
  end: Date;
}

const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return startOfDay(d);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** Weeks for a month grid (Sunday first), padded with nulls. */
export function monthGrid(year: number, month: number): Array<Array<Date | null>> {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type QuickRange = 'today' | 'tomorrow' | 'weekend' | 'week';

export function quickRange(kind: QuickRange, now = new Date()): DayRange {
  const today = startOfDay(now);
  switch (kind) {
    case 'today':
      return { start: today, end: today };
    case 'tomorrow': {
      const t = addDays(today, 1);
      return { start: t, end: t };
    }
    case 'weekend': {
      // Fri–Sun; if it's already the weekend, from today to Sunday.
      const dow = today.getDay();
      if (dow === 0) return { start: today, end: today };
      if (dow >= 5) return { start: today, end: addDays(today, 7 - dow) };
      return { start: addDays(today, 5 - dow), end: addDays(today, 7 - dow) };
    }
    case 'week':
    default:
      return { start: today, end: addDays(today, 6) };
  }
}

export function inRange(day: Date, range: DayRange): boolean {
  const t = startOfDay(day).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

export function rangeDays(range: DayRange): Date[] {
  const days: Date[] = [];
  for (let d = range.start; d.getTime() <= range.end.getTime(); d = addDays(d, 1)) days.push(d);
  return days;
}

interface TimedNode {
  startsAt?: string;
  endsAt?: string;
}

/** True if the Point is on during any part of this day. */
export function occursOn(node: TimedNode, day: Date): boolean {
  if (!node.startsAt) return false;
  const start = new Date(node.startsAt).getTime();
  const end = node.endsAt ? new Date(node.endsAt).getTime() : start + 60 * 60 * 1000;
  const dayStart = startOfDay(day).getTime();
  return start < dayStart + DAY && end > dayStart;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "Wed, Oct 14" */
export function formatDay(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "Today", "Tomorrow", or "Wed, Oct 14" */
export function friendlyDay(date: Date, now = new Date()): string {
  if (sameDay(date, now)) return 'Today';
  if (sameDay(date, addDays(now, 1))) return 'Tomorrow';
  return formatDay(date);
}

/** "Oct 14" or "Oct 14 – Oct 20" */
export function formatRange(range: DayRange): string {
  const label = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return sameDay(range.start, range.end) ? formatDay(range.start) : `${label(range.start)} – ${label(range.end)}`;
}

/** "7:30 PM" */
export function formatClock(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
