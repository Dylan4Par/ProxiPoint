import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceLabel, goingLabel, pointTiming, startsInLabel } from './pointCard';
import { setUnits } from './units';

// These tests read metric labels; the app's default follows the phone's region.
setUnits('metric');

const NOW = Date.UTC(2026, 9, 19, 18, 0);
const inMinutes = (m: number) => new Date(NOW + m * 60000).toISOString();

test('live wins, then starting soon, then the start time', () => {
  assert.deepEqual(pointTiming({ status: 'LIVE NOW', startsAt: inMinutes(-30) }, NOW), { kind: 'live', label: 'LIVE NOW' });
  assert.deepEqual(pointTiming({ isLiveNow: true }, NOW), { kind: 'live', label: 'LIVE NOW' });
  assert.deepEqual(pointTiming({ startsAt: inMinutes(15) }, NOW), { kind: 'soon', label: 'Starts in 15 min' });
  assert.deepEqual(pointTiming({ startsAt: inMinutes(80) }, NOW), { kind: 'soon', label: 'Starts in 1h 20m' });
  assert.equal(pointTiming({ startsAt: inMinutes(300) }, NOW)?.kind, 'later');
  assert.deepEqual(pointTiming({ status: 'Tomorrow' }, NOW), { kind: 'later', label: 'Tomorrow' });
  assert.equal(pointTiming({}, NOW), null);
});

test('starts-in wording', () => {
  assert.equal(startsInLabel(0.2), 'Starts in 1 min');
  assert.equal(startsInLabel(60), 'Starts in 1h');
  assert.equal(startsInLabel(125), 'Starts in 2h 5m');
});

test('distance pill and going count', () => {
  assert.equal(distanceLabel(540, '7 min walk'), '540m • 7 min walk');
  assert.equal(distanceLabel(1400, '4 min drive'), '1.4 km • 4 min drive');
  assert.equal(distanceLabel(540, ''), '540m');
  assert.equal(distanceLabel(undefined, null), null);
  assert.equal(goingLabel(12), '12+');
  assert.equal(goingLabel(1200), '1.2k+');
  assert.equal(goingLabel(0), null);
});
