import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MARKER_TRANSITION_CSS,
  boundsForActivePins,
  fitLeafletBounds,
  fitMapLibreBounds,
} from './mapCamera';
import type { ProximityAlert } from '../types/telemetry';

const user = { lat: 10, lon: 20 };
const alerts: ProximityAlert[] = [
  { id: 'a', label: 'A', latitude: 11, longitude: 21, distanceMeters: 40 },
];

test('marker icons use a glide transition', () => {
  assert.match(MARKER_TRANSITION_CSS, /\.leaflet-marker-icon/);
  assert.match(MARKER_TRANSITION_CSS, /cubic-bezier\(0\.25, 1, 0\.5, 1\)/);
});

test('no camera fit when there are no targets', () => {
  assert.equal(boundsForActivePins(user, []), null);
});

test('leaflet fitBounds animates a padded frame around the user and targets', () => {
  const calls: unknown[] = [];
  fitLeafletBounds(
    {
      fitBounds(bounds, options) {
        calls.push({ bounds, options });
      },
    },
    boundsForActivePins(user, alerts)!,
  );

  assert.deepEqual(calls, [
    {
      bounds: [
        [9.75, 19.75],
        [11.25, 21.25],
      ],
      options: { animate: true, duration: 0.5 },
    },
  ]);
});

test('maplibre fitBounds uses lng/lat order and a millisecond duration', () => {
  const calls: unknown[] = [];
  fitMapLibreBounds(
    {
      fitBounds(bounds, options) {
        calls.push({ bounds, options });
      },
    },
    boundsForActivePins(user, alerts)!,
  );

  assert.deepEqual(calls, [
    {
      bounds: [
        [19.75, 9.75],
        [21.25, 11.25],
      ],
      options: { animate: true, duration: 500, padding: 24 },
    },
  ]);
});
