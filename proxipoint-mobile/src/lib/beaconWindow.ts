import type { BeaconDuration } from '../types/beacon';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const HOUR_MS = 3_600_000;

export function snapToMinute(date: Date): Date {
  const next = new Date(date.getTime());
  next.setSeconds(0, 0);
  return next;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

/** Live Now opens on the current minute and ends one hour later. */
export function liveBeaconWindow(now = new Date()): { startsAt: Date; endsAt: Date } {
  const startsAt = snapToMinute(now);
  return { startsAt, endsAt: addHours(startsAt, 1) };
}

export function formatBeaconDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function formatBeaconTime(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours %= 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${suffix}`;
}

export function formatBeaconStart(date: Date): string {
  return `${formatBeaconDate(date)}, ${formatBeaconTime(date)}`;
}

export function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function toTimeInputValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function applyDateInput(base: Date, value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const next = new Date(base.getTime());
  next.setFullYear(year, month - 1, day);
  if (next.getFullYear() !== year || next.getMonth() !== month - 1 || next.getDate() !== day) return null;
  return snapToMinute(next);
}

export function applyTimeInput(base: Date, value: string): Date | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const next = new Date(base.getTime());
  next.setHours(hours, minutes, 0, 0);
  return next;
}

export function windowDurationHours(startsAt: Date, endsAt: Date): number {
  const hours = (endsAt.getTime() - startsAt.getTime()) / HOUR_MS;
  if (!Number.isFinite(hours) || hours <= 0) return 1;
  return Math.round(hours * 100) / 100;
}

export function presetForHours(hours: number): BeaconDuration {
  if (hours < 1.5) return '1 hr';
  if (hours < 3) return '2 hrs';
  if (hours <= 12) return '4 hrs';
  return 'All Day';
}

/** Moving the start off the current instant leaves Live Now and keeps a valid end. */
export function changeWindowStart(
  startsAt: Date,
  endsAt: Date,
  nextStart: Date,
): { startsAt: Date; endsAt: Date; switchedToSchedule: boolean } {
  const start = snapToMinute(nextStart);
  const switchedToSchedule = start.getTime() !== snapToMinute(startsAt).getTime();
  let end = endsAt;
  if (end.getTime() <= start.getTime()) {
    const span = endsAt.getTime() - startsAt.getTime();
    end = new Date(start.getTime() + (span > 0 ? span : HOUR_MS));
  }
  return { startsAt: start, endsAt: snapToMinute(end), switchedToSchedule };
}

/**
 * End edits stay on the current mode. A time that lands before the start rolls
 * to the next day; anything still not after the start falls back to one hour.
 */
export function changeWindowEnd(startsAt: Date, nextEnd: Date, edited: 'date' | 'time'): Date {
  let end = snapToMinute(nextEnd);
  if (end.getTime() <= startsAt.getTime() && edited === 'time') {
    end = addHours(end, 24);
  }
  if (end.getTime() <= startsAt.getTime()) {
    end = addHours(startsAt, 1);
  }
  return end;
}
