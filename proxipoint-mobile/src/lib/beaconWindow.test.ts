import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyDateInput,
  applyTimeInput,
  changeWindowEnd,
  changeWindowStart,
  formatBeaconDate,
  formatBeaconTime,
  liveBeaconWindow,
  presetForHours,
  windowDurationHours,
} from './beaconWindow';

const fridayAtTwo = new Date(2026, 9, 9, 14, 0, 30);

test('live window starts on the current minute and ends one hour later', () => {
  const window = liveBeaconWindow(fridayAtTwo);
  assert.equal(formatBeaconDate(window.startsAt), 'Fri, Oct 9');
  assert.equal(formatBeaconTime(window.startsAt), '2:00 PM');
  assert.equal(formatBeaconDate(window.endsAt), 'Fri, Oct 9');
  assert.equal(formatBeaconTime(window.endsAt), '3:00 PM');
  assert.equal(windowDurationHours(window.startsAt, window.endsAt), 1);
  assert.equal(window.startsAt.getSeconds(), 0);
});

test('changing the start leaves Live Now and keeps the end after it', () => {
  const start = new Date(2026, 9, 9, 14, 0);
  const end = new Date(2026, 9, 9, 15, 0);
  const same = changeWindowStart(start, end, applyTimeInput(start, '14:00')!);
  assert.equal(same.switchedToSchedule, false);

  const moved = changeWindowStart(start, end, applyTimeInput(start, '16:30')!);
  assert.equal(moved.switchedToSchedule, true);
  assert.equal(formatBeaconTime(moved.startsAt), '4:30 PM');
  assert.equal(formatBeaconTime(moved.endsAt), '5:30 PM');
  assert.equal(windowDurationHours(moved.startsAt, moved.endsAt), 1);

  const laterDay = changeWindowStart(start, end, applyDateInput(start, '2026-10-10')!);
  assert.equal(laterDay.switchedToSchedule, true);
  assert.equal(formatBeaconDate(laterDay.startsAt), 'Sat, Oct 10');
  assert.equal(formatBeaconTime(laterDay.endsAt), '3:00 PM');
});

test('end time can move, including across midnight, without touching the mode', () => {
  const start = new Date(2026, 9, 9, 14, 0);
  const extended = changeWindowEnd(start, applyTimeInput(new Date(2026, 9, 9, 15, 0), '17:30')!, 'time');
  assert.equal(formatBeaconTime(extended), '5:30 PM');
  assert.equal(windowDurationHours(start, extended), 3.5);
  assert.equal(presetForHours(3.5), '4 hrs');

  const overnight = changeWindowEnd(new Date(2026, 9, 9, 23, 0), applyTimeInput(new Date(2026, 9, 9, 23, 0), '01:00')!, 'time');
  assert.equal(formatBeaconDate(overnight), 'Sat, Oct 10');
  assert.equal(formatBeaconTime(overnight), '1:00 AM');

  const pastDate = changeWindowEnd(start, applyDateInput(start, '2026-10-08')!, 'date');
  assert.equal(formatBeaconDate(pastDate), 'Fri, Oct 9');
  assert.equal(formatBeaconTime(pastDate), '3:00 PM');
});

test('clock labels use a 12-hour clock', () => {
  assert.equal(formatBeaconTime(new Date(2026, 9, 9, 0, 5)), '12:05 AM');
  assert.equal(formatBeaconTime(new Date(2026, 9, 9, 12, 0)), '12:00 PM');
  assert.equal(presetForHours(1), '1 hr');
  assert.equal(presetForHours(2), '2 hrs');
  assert.equal(presetForHours(24), 'All Day');
});
