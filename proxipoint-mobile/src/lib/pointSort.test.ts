import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPointSort, setPointSort, sortPoints } from './pointSort';

const points = [
  { id: 'far', distanceMeters: 900, startsAt: '2026-10-19T20:00:00Z', attendeeCount: 5 },
  { id: 'live', distanceMeters: 500, status: 'LIVE NOW', attendeeCount: 85 },
  { id: 'near', distanceMeters: 100, startsAt: '2026-10-19T19:00:00Z', attendeeCount: 12 },
  { id: 'notime', distanceMeters: 300, attendeeCount: 12 },
];
const ids = (list: Array<{ id: string }>) => list.map((p) => p.id);

test('closest, soonest (live first) and most going', () => {
  assert.deepEqual(ids(sortPoints(points, 'closest')), ['near', 'notime', 'live', 'far']);
  assert.deepEqual(ids(sortPoints(points, 'soonest')), ['live', 'near', 'far', 'notime']);
  // 'near' and 'notime' tie on 12: original order kept.
  assert.deepEqual(ids(sortPoints(points, 'popular')), ['live', 'near', 'notime', 'far']);
});

test('sorting returns a copy and the store remembers the choice', () => {
  sortPoints(points, 'popular');
  assert.equal(points[0].id, 'far');
  assert.equal(getPointSort(), 'closest');
  setPointSort('soonest');
  assert.equal(getPointSort(), 'soonest');
  setPointSort('closest');
});
