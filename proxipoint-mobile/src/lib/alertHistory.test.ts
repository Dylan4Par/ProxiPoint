import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAlertHistoryEntry, prependAlertHistory, type AlertHistoryEntry } from './alertHistory';

function entry(id: string, seenAt: number): AlertHistoryEntry {
  return {
    targetEntityId: id,
    targetName: id,
    distanceMeters: 10,
    latitude: 1,
    longitude: 2,
    seenAt,
  };
}

test('history keeps the newest breach first and drops past the limit', () => {
  const existing = [entry('old', 1), entry('older', 0)];
  const next = prependAlertHistory(existing, entry('new', 2), 2);
  assert.deepEqual(
    next.map((item) => item.targetEntityId),
    ['new', 'old'],
  );
});

test('stored history entries must include a target and a timestamp', () => {
  assert.equal(isAlertHistoryEntry(entry('alpha', 1)), true);
  assert.equal(isAlertHistoryEntry({ targetEntityId: 'alpha' }), false);
  assert.equal(isAlertHistoryEntry(null), false);
});
