import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  addMonths,
  clampDuration,
  clampStart,
  earliestStart,
  formatDuration,
  latestSchedulableStart,
} from './beaconSchedule';

test('a month from January 31 lands on the last day of February', () => {
  const start = new Date(2026, 0, 31, 15, 45, 0);
  const next = addMonths(start, 1);
  assert.equal(next.getFullYear(), 2026);
  assert.equal(next.getMonth(), 1);
  assert.equal(next.getDate(), 28);
  assert.equal(next.getHours(), 15);
  assert.equal(next.getMinutes(), 45);
});

test('start time stays between now and one month ahead, on 15 minute steps', () => {
  const now = new Date(2026, 9, 7, 18, 7, 30);
  const earliest = earliestStart(now);
  assert.equal(earliest.getMinutes() % 15, 0);
  assert.ok(earliest.getTime() >= now.getTime());

  const tooEarly = clampStart(new Date(now.getTime() - 60 * 60 * 1000), now);
  assert.equal(tooEarly.limit, 'past');
  assert.equal(tooEarly.start.getTime(), earliest.getTime());

  const tooLate = clampStart(addMonths(now, 2), now);
  assert.equal(tooLate.limit, 'month');
  assert.ok(tooLate.start.getTime() <= addMonths(now, 1).getTime());
  assert.equal(tooLate.start.getTime(), latestSchedulableStart(now).getTime());
});

test('duration moves in 15 minute portions from 15 minutes to 24 hours', () => {
  assert.equal(clampDuration(15).minutes, MIN_DURATION_MINUTES);
  assert.equal(clampDuration(20).minutes, 15);
  assert.equal(clampDuration(23).minutes, 30);
  assert.equal(clampDuration(90).minutes, 90);
  assert.equal(clampDuration(24 * 60).minutes, MAX_DURATION_MINUTES);
  assert.equal(clampDuration(24 * 60 + 30).limit, 'duration');
  assert.equal(clampDuration(24 * 60 + 30).minutes, MAX_DURATION_MINUTES);
  assert.equal(clampDuration(0).minutes, 15);
  assert.equal(formatDuration(15), '15 min');
  assert.equal(formatDuration(60), '1 hr');
  assert.equal(formatDuration(90), '1 hr 30 min');
  assert.equal(formatDuration(24 * 60), '24 hr');
});
