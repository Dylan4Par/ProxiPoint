import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FOCUS_ZOOM,
  MARKER_TRANSITION_CSS,
  boundsForActivePins,
  clearedFocusParams,
  fitLeafletBounds,
  fitMapLibreBounds,
  focusLeafletOnTarget,
  focusLockKey,
  parseFocusTarget,
  shouldCenterOnFocus,
  shouldReleaseCameraLock,
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

test('route params center the camera on the selected target', () => {
  const target = parseFocusTarget({ focusLat: '37.7752', focusLon: '-122.4194', focusId: 'alpha' });
  assert.deepEqual(target, { id: 'alpha', latitude: 37.7752, longitude: -122.4194 });

  const calls: unknown[] = [];
  focusLeafletOnTarget(
    {
      setView(center, zoom, options) {
        calls.push({ center, zoom, options });
      },
    },
    target!,
  );
  assert.deepEqual(calls, [
    {
      center: [37.7752, -122.4194],
      zoom: FOCUS_ZOOM,
      options: { animate: true },
    },
  ]);
});

test('a focus selection centers once and a later ping does not reapply it', () => {
  const target = parseFocusTarget({
    focusLat: '37.77867',
    focusLon: '-122.4194',
    focusId: 'delta',
    focusNonce: '1',
  });
  assert.equal(shouldCenterOnFocus(null, target), true);
  const key = focusLockKey(target!);
  assert.equal(shouldCenterOnFocus(key, target), false);
  assert.equal(shouldCenterOnFocus(key, { ...target!, nonce: '2' }), true);
  assert.equal(shouldCenterOnFocus(key, null), false);
});

test('drag and zoom release the camera lock unless the move is programmatic', () => {
  assert.equal(shouldReleaseCameraLock('dragstart', false), true);
  assert.equal(shouldReleaseCameraLock('zoomstart', false), true);
  assert.equal(shouldReleaseCameraLock('movestart', false), true);
  assert.equal(shouldReleaseCameraLock('movestart', true), false);
  assert.equal(shouldReleaseCameraLock('zoomstart', true), false);
  assert.equal(shouldReleaseCameraLock('moveend', false), false);
});

test('cleared focus params drop out of the route query', () => {
  assert.deepEqual(clearedFocusParams(), {
    focusId: undefined,
    focusLat: undefined,
    focusLon: undefined,
    focusNonce: undefined,
  });
});

test('incomplete or invalid focus params do not move the camera', () => {
  assert.equal(parseFocusTarget({ focusLat: '37.7' }), null);
  assert.equal(parseFocusTarget({ focusLat: 'nope', focusLon: '1' }), null);
  assert.equal(parseFocusTarget({ focusLat: '91', focusLon: '0' }), null);
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
