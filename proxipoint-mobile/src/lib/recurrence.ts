/**
 * Repeating events: the rule the host picks under Schedule, how it reads in the app,
 * which dates it produces, and what gets sent to the server (an RFC 5545 RRULE).
 *
 * Dates are worked out in the phone's local time so a 7 PM event stays at 7 PM
 * across daylight-saving changes.
 */

export type RepeatFrequency = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface RepeatRule {
  frequency: RepeatFrequency;
  /** 0 = Sun … 6 = Sat. Used by weekly and biweekly; always includes the start's weekday. */
  weekdays: number[];
  /** Last local day ('YYYY-MM-DD') an occurrence may start on, or null for no end date. */
  until: string | null;
}

export interface RepeatPayload {
  /** e.g. "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;UNTIL=20261219T065959Z" */
  rrule: string;
  frequency: Exclude<RepeatFrequency, 'none'>;
  weekdays: number[];
  until: string | null;
  /** IANA zone the times were picked in, so the server can expand the rule correctly. */
  timezone: string | null;
}

export const NO_REPEAT: RepeatRule = { frequency: 'none', weekdays: [], until: null };

export const REPEAT_OPTIONS: { value: RepeatFrequency; label: string }[] = [
  { value: 'none', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
];

/** Longest a series may run, so the server never has to expand an endless rule up front. */
export const MAX_REPEAT_DAYS = 366;

const DAY_MS = 86_400_000;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const RRULE_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export const weekdayLetter = (day: number) => WEEKDAY_LETTER[day];
export const weekdayShort = (day: number) => WEEKDAY_SHORT[day];

const isWeekly = (f: RepeatFrequency) => f === 'weekly' || f === 'biweekly';

function sortedDays(days: number[]): number[] {
  return [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
}

/** Local midnight of the given day. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole local days between two dates (DST-safe). */
function dayDiff(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** Same local time of day, `days` later. */
function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function parseLocalDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getDate() === Number(match[3]) ? date : null;
}

/** The end of the `until` day, as a real instant. */
function untilInstant(until: string | null): Date | null {
  const day = until ? parseLocalDay(until) : null;
  if (!day) return null;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** A fresh rule for the chosen frequency; weekly ones start on the event's weekday. */
export function ruleForFrequency(frequency: RepeatFrequency, startsAt: Date, previous?: RepeatRule): RepeatRule {
  if (frequency === 'none') return { ...NO_REPEAT };
  const keepDays = previous && isWeekly(previous.frequency) ? previous.weekdays : [];
  return {
    frequency,
    weekdays: isWeekly(frequency) ? sortedDays([...keepDays, startsAt.getDay()]) : [],
    until: previous?.until ?? null,
  };
}

/**
 * Tap a weekday on or off. The start's own weekday can't be turned off: the first
 * event is on that day, so the series has to include it.
 */
export function toggleRepeatWeekday(rule: RepeatRule, day: number, startsAt: Date): RepeatRule {
  if (!isWeekly(rule.frequency) || day === startsAt.getDay()) return rule;
  const has = rule.weekdays.includes(day);
  return { ...rule, weekdays: sortedDays(has ? rule.weekdays.filter((d) => d !== day) : [...rule.weekdays, day]) };
}

/**
 * Keep the rule in step when the start moves. A single picked weekday follows the start;
 * with several, the new start's weekday is added. An end date before the new start is dropped.
 */
export function followStart(rule: RepeatRule, previousStart: Date, nextStart: Date): RepeatRule {
  if (rule.frequency === 'none') return rule;
  let weekdays = rule.weekdays;
  if (isWeekly(rule.frequency)) {
    const onlyOldDay = weekdays.length === 1 && weekdays[0] === previousStart.getDay();
    weekdays = sortedDays(onlyOldDay ? [nextStart.getDay()] : [...weekdays, nextStart.getDay()]);
  }
  const until = untilInstant(rule.until);
  return { ...rule, weekdays, until: until && until.getTime() < nextStart.getTime() ? null : rule.until };
}

/**
 * Start times of the series, the first event included, in order.
 * Stops at `limit` events, at the end date, or at MAX_REPEAT_DAYS.
 */
export function occurrenceStarts(rule: RepeatRule, startsAt: Date, limit = 10): Date[] {
  if (rule.frequency === 'none') return [new Date(startsAt.getTime())];
  const until = untilInstant(rule.until);
  const lastDay = addDays(startOfDay(startsAt), MAX_REPEAT_DAYS);
  const stop = until && until.getTime() < lastDay.getTime() ? until : lastDay;
  const out: Date[] = [];
  const push = (d: Date) => {
    if (d.getTime() >= startsAt.getTime() && d.getTime() <= stop.getTime()) out.push(d);
  };

  if (rule.frequency === 'monthly') {
    const dom = startsAt.getDate();
    for (let m = 0; out.length < limit && m <= 13; m += 1) {
      const d = new Date(startsAt.getTime());
      d.setDate(1);
      d.setMonth(startsAt.getMonth() + m);
      if (dom > daysInMonth(d)) continue; // e.g. the 31st skips 30-day months, like RRULE does
      d.setDate(dom);
      if (d.getTime() > stop.getTime()) break;
      push(d);
    }
    return out;
  }

  const days = rule.frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : sortedDays(rule.weekdays);
  const everyWeeks = rule.frequency === 'biweekly' ? 2 : 1;
  // Weeks are counted from the Sunday before the start, matching RRULE's WKST=SU.
  const weekAnchor = addDays(startOfDay(startsAt), -startsAt.getDay());
  for (let i = 0; out.length < limit; i += 1) {
    const d = addDays(startsAt, i);
    if (d.getTime() > stop.getTime()) break;
    const week = Math.floor(dayDiff(weekAnchor, d) / 7);
    if (week % everyWeeks === 0 && days.includes(d.getDay())) push(d);
  }
  return out;
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function shortDay(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "Every Fri", "Every 2 weeks on Mon, Wed", "Monthly on the 23rd", plus "until Dec 18". */
export function describeRepeat(rule: RepeatRule, startsAt: Date): string {
  if (rule.frequency === 'none') return 'Does not repeat';
  let base: string;
  if (rule.frequency === 'daily') base = 'Every day';
  else if (rule.frequency === 'monthly') base = `Monthly on the ${ordinal(startsAt.getDate())}`;
  else {
    const days = sortedDays(rule.weekdays).map((d) => WEEKDAY_SHORT[d]).join(', ');
    base = rule.frequency === 'biweekly' ? `Every 2 weeks on ${days}` : `Every ${days}`;
  }
  const until = rule.until ? parseLocalDay(rule.until) : null;
  return until ? `${base} until ${shortDay(until)}` : base;
}

/** The next few dates after the first, for the preview line: "Oct 30, Nov 6, Nov 13". */
export function previewNextDates(rule: RepeatRule, startsAt: Date, count = 3): string {
  return occurrenceStarts(rule, startsAt, count + 1)
    .slice(1)
    .map(shortDay)
    .join(', ');
}

/** Problems that should stop the drop, or null when the series is fine. */
export function validateRepeat(rule: RepeatRule, startsAt: Date, endsAt: Date): string | null {
  if (rule.frequency === 'none') return null;
  const until = untilInstant(rule.until);
  if (rule.until && !until) return 'Pick a valid end date for the repeat.';
  if (until && until.getTime() < startsAt.getTime()) return 'The repeat ends before the first event. Pick a later end date.';
  const starts = occurrenceStarts(rule, startsAt, 60);
  if (starts.length < 2) return 'This repeat ends before a second event. Pick a later end date, or choose Never.';
  const length = endsAt.getTime() - startsAt.getTime();
  for (let i = 1; i < starts.length; i += 1) {
    if (starts[i].getTime() - starts[i - 1].getTime() < length) {
      return 'Each event has to end before the next one starts. Shorten it or repeat less often.';
    }
  }
  return null;
}

function rruleUntil(until: string | null): string | null {
  const instant = untilInstant(until);
  if (!instant) return null;
  const iso = instant.toISOString(); // UTC, as RFC 5545 requires when the start has a time zone
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

export function toRRule(rule: RepeatRule, startsAt: Date): string | null {
  if (rule.frequency === 'none') return null;
  const parts: string[] = [];
  if (rule.frequency === 'daily') parts.push('FREQ=DAILY');
  else if (rule.frequency === 'monthly') parts.push('FREQ=MONTHLY', `BYMONTHDAY=${startsAt.getDate()}`);
  else {
    parts.push('FREQ=WEEKLY');
    if (rule.frequency === 'biweekly') parts.push('INTERVAL=2');
    parts.push(`BYDAY=${sortedDays(rule.weekdays).map((d) => RRULE_DAY[d]).join(',')}`, 'WKST=SU');
  }
  const until = rruleUntil(rule.until);
  if (until) parts.push(`UNTIL=${until}`);
  return parts.join(';');
}

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** What the create request carries; null for a one-time event. */
export function toRepeatPayload(rule: RepeatRule, startsAt: Date): RepeatPayload | null {
  const rrule = toRRule(rule, startsAt);
  if (!rrule || rule.frequency === 'none') return null;
  return {
    rrule,
    frequency: rule.frequency,
    weekdays: isWeekly(rule.frequency) ? sortedDays(rule.weekdays) : [],
    until: rule.until,
    timezone: deviceTimeZone(),
  };
}
