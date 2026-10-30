import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  NO_REPEAT,
  describeRepeat,
  followStart,
  occurrenceStarts,
  previewNextDates,
  ruleForFrequency,
  toRRule,
  toRepeatPayload,
  toggleRepeatWeekday,
  validateRepeat,
} from './recurrence';

// Fri Oct 23 2026, 7:00 PM local
const friEvening = new Date(2026, 9, 23, 19, 0);
const twoHoursLater = new Date(2026, 9, 23, 21, 0);
const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

test('no repeat is one event and sends nothing', () => {
  assert.equal(describeRepeat(NO_REPEAT, friEvening), 'Does not repeat');
  assert.equal(occurrenceStarts(NO_REPEAT, friEvening).length, 1);
  assert.equal(toRepeatPayload(NO_REPEAT, friEvening), null);
  assert.equal(validateRepeat(NO_REPEAT, friEvening, twoHoursLater), null);
});

test('weekly starts on the event weekday and keeps the time of day', () => {
  const rule = ruleForFrequency('weekly', friEvening);
  assert.deepEqual(rule.weekdays, [5]);
  assert.equal(describeRepeat(rule, friEvening), 'Every Fri');
  const starts = occurrenceStarts(rule, friEvening, 3);
  assert.deepEqual(starts.map(ymd), ['2026-10-23', '2026-10-30', '2026-11-6']);
  // Crosses the Nov 1 DST change and stays at 7 PM local.
  assert.ok(starts.every((d) => d.getHours() === 19 && d.getMinutes() === 0));
  assert.equal(previewNextDates(rule, friEvening), 'Oct 30, Nov 6, Nov 13');
  assert.equal(toRRule(rule, friEvening), 'FREQ=WEEKLY;BYDAY=FR;WKST=SU');
});

test('extra weekdays can be added; the start weekday cannot be removed', () => {
  let rule = ruleForFrequency('weekly', friEvening);
  rule = toggleRepeatWeekday(rule, 2, friEvening);
  rule = toggleRepeatWeekday(rule, 5, friEvening);
  assert.deepEqual(rule.weekdays, [2, 5]);
  assert.equal(describeRepeat(rule, friEvening), 'Every Tue, Fri');
  assert.deepEqual(occurrenceStarts(rule, friEvening, 3).map(ymd), ['2026-10-23', '2026-10-27', '2026-10-30']);
});

test('every 2 weeks skips the off weeks', () => {
  const rule = ruleForFrequency('biweekly', friEvening);
  assert.equal(describeRepeat(rule, friEvening), 'Every 2 weeks on Fri');
  assert.deepEqual(occurrenceStarts(rule, friEvening, 3).map(ymd), ['2026-10-23', '2026-11-6', '2026-11-20']);
  assert.equal(toRRule(rule, friEvening), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;WKST=SU');
});

test('monthly uses the day of month and skips months without it', () => {
  const rule = ruleForFrequency('monthly', friEvening);
  assert.equal(describeRepeat(rule, friEvening), 'Monthly on the 23rd');
  assert.deepEqual(occurrenceStarts(rule, friEvening, 3).map(ymd), ['2026-10-23', '2026-11-23', '2026-12-23']);
  const jan31 = new Date(2027, 0, 31, 18, 0);
  assert.deepEqual(occurrenceStarts(ruleForFrequency('monthly', jan31), jan31, 3).map(ymd), [
    '2027-1-31',
    '2027-3-31',
    '2027-5-31',
  ]);
  assert.equal(toRRule(rule, friEvening), 'FREQ=MONTHLY;BYMONTHDAY=23');
});

test('an end date limits the series and is sent as UTC', () => {
  const rule = { ...ruleForFrequency('weekly', friEvening), until: '2026-11-13' };
  assert.equal(describeRepeat(rule, friEvening), 'Every Fri until Nov 13');
  assert.equal(occurrenceStarts(rule, friEvening, 50).length, 4);
  assert.match(toRRule(rule, friEvening) ?? '', /;UNTIL=2026111\dT\d{6}Z$/);
  const payload = toRepeatPayload(rule, friEvening);
  assert.equal(payload?.frequency, 'weekly');
  assert.deepEqual(payload?.weekdays, [5]);
  assert.equal(payload?.until, '2026-11-13');
});

test('a series without an end date stops after a year', () => {
  const starts = occurrenceStarts(ruleForFrequency('daily', friEvening), friEvening, 1000);
  assert.ok(starts.length >= 366 && starts.length <= 367);
});

test('validation catches overlaps and bad end dates', () => {
  const daily = ruleForFrequency('daily', friEvening);
  assert.equal(validateRepeat(daily, friEvening, twoHoursLater), null);
  const longOne = new Date(2026, 9, 25, 19, 0); // two days long
  assert.match(validateRepeat(daily, friEvening, longOne) ?? '', /end before the next one/);
  assert.match(
    validateRepeat({ ...daily, until: '2026-10-20' }, friEvening, twoHoursLater) ?? '',
    /ends before the first event/,
  );
  assert.match(
    validateRepeat({ ...ruleForFrequency('weekly', friEvening), until: '2026-10-25' }, friEvening, twoHoursLater) ?? '',
    /before a second event/,
  );
});

test('moving the start carries a single weekday along and drops a stale end date', () => {
  const rule = { ...ruleForFrequency('weekly', friEvening), until: '2026-10-30' };
  const nextSat = new Date(2026, 9, 31, 19, 0);
  const moved = followStart(rule, friEvening, nextSat);
  assert.deepEqual(moved.weekdays, [6]);
  assert.equal(moved.until, null);
  const multi = toggleRepeatWeekday(ruleForFrequency('weekly', friEvening), 2, friEvening);
  assert.deepEqual(followStart(multi, friEvening, nextSat).weekdays, [2, 5, 6]);
});
