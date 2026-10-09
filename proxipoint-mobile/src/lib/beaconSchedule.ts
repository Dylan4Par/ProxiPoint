export const DURATION_STEP_MINUTES = 15;
export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 24 * 60;

export type BeaconVisibility = 'public' | 'tag-network' | 'private';
export type ScheduleLimit = 'none' | 'past' | 'month' | 'duration';

export interface ClampedStart {
  start: Date;
  limit: ScheduleLimit;
}

export interface ClampedDuration {
  minutes: number;
  limit: ScheduleLimit;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

export function roundUpToStep(date: Date, stepMinutes = DURATION_STEP_MINUTES): Date {
  const stepMs = stepMinutes * 60 * 1000;
  return new Date(Math.ceil(date.getTime() / stepMs) * stepMs);
}

export function roundDownToStep(date: Date, stepMinutes = DURATION_STEP_MINUTES): Date {
  const stepMs = stepMinutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / stepMs) * stepMs);
}

export function earliestStart(now: Date): Date {
  return roundUpToStep(now);
}

export function latestSchedulableStart(now: Date): Date {
  return roundDownToStep(addMonths(now, 1));
}

export function clampStart(candidate: Date, now: Date): ClampedStart {
  const min = earliestStart(now);
  const max = latestSchedulableStart(now);
  if (candidate.getTime() < min.getTime()) return { start: min, limit: 'past' };
  if (candidate.getTime() > max.getTime()) return { start: max, limit: 'month' };
  return { start: roundUpToStep(candidate), limit: 'none' };
}

export function clampDuration(minutes: number): ClampedDuration {
  if (!Number.isFinite(minutes)) return { minutes: 60, limit: 'duration' };
  const stepped = Math.round(minutes / DURATION_STEP_MINUTES) * DURATION_STEP_MINUTES;
  if (stepped < MIN_DURATION_MINUTES) return { minutes: MIN_DURATION_MINUTES, limit: 'duration' };
  if (stepped > MAX_DURATION_MINUTES) return { minutes: MAX_DURATION_MINUTES, limit: 'duration' };
  return { minutes: stepped, limit: 'none' };
}

export function formatDuration(minutes: number): string {
  const safe = clampDuration(minutes).minutes;
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (hours === 0) return `${remainder} min`;
  if (remainder === 0) return hours === 1 ? '1 hr' : `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

export function formatStartLabel(start: Date, now: Date): string {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let day: string;
  if (startDay.getTime() === today.getTime()) day = 'Today';
  else if (startDay.getTime() === tomorrow.getTime()) day = 'Tomorrow';
  else {
    day = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const time = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time}`;
}

export function visibilityLabel(visibility: BeaconVisibility | undefined): string {
  if (visibility === 'private') return 'Private';
  if (visibility === 'tag-network') return 'Tag Network';
  return 'Public';
}

export function beaconWindowStatus(startsAt: Date, now: Date): { status: string; statusColor: string } {
  if (startsAt.getTime() <= now.getTime() + 60 * 1000) {
    return { status: 'LIVE NOW', statusColor: '#10b981' };
  }
  return { status: formatStartLabel(startsAt, now), statusColor: '#38bdf8' };
}
