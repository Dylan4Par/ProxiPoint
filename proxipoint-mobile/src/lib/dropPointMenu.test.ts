import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_DURATION_MINUTES } from './beaconSchedule';
import { ALERT_RADIUS_PRESETS, DURATION_PRESETS, clampAlertRadius } from './dropPointMenu';

test('drop point radius and duration chips match the host menu', () => {
  assert.deepEqual(
    ALERT_RADIUS_PRESETS.map((choice) => choice.label),
    ['250m', '500m', '1km'],
  );
  assert.deepEqual(
    DURATION_PRESETS.map((choice) => [choice.label, choice.minutes]),
    [
      ['1 hr', 60],
      ['2 hrs', 120],
      ['4 hrs', 240],
      ['All Day', MAX_DURATION_MINUTES],
    ],
  );
});

test('a custom alert radius stays on 50 meter steps', () => {
  assert.equal(clampAlertRadius(500), 500);
  assert.equal(clampAlertRadius(640), 650);
  assert.equal(clampAlertRadius(10), 50);
  assert.equal(clampAlertRadius(20000), 10000);
  assert.equal(clampAlertRadius(Number.NaN), 500);
});
