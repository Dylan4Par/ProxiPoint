import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatRelativeTime,
  mergeActiveAlerts,
  sortAlertsByDistance,
  toProximityAlertEvent,
} from './alertFeed';
import type { ActiveContact, ProximityAlert } from '../types/telemetry';

const far: ProximityAlert = {
  id: 'delta',
  label: 'Delta',
  latitude: 11,
  longitude: 21,
  distanceMeters: 420,
};
const near: ProximityAlert = {
  id: 'alpha',
  label: 'Alpha',
  latitude: 10.1,
  longitude: 20.1,
  distanceMeters: 30,
};

test('active alerts sort nearest first', () => {
  assert.deepEqual(
    sortAlertsByDistance([far, near]).map((alert) => alert.id),
    ['alpha', 'delta'],
  );
});

test('relative time stays coarse enough for a live feed', () => {
  assert.equal(formatRelativeTime(1_000, 5_000), 'just now');
  assert.equal(formatRelativeTime(1_000, 16_000), '15s ago');
  assert.equal(formatRelativeTime(0, 120_000), '2m ago');
  assert.equal(formatRelativeTime(0, 2 * 60 * 60 * 1000), '2h ago');
});

test('new targets are marked entered and repeat pings keep the original time', () => {
  const first = mergeActiveAlerts([], [near], 5_000);
  assert.equal(first.entered.length, 1);
  assert.equal(first.alerts[0]?.observedAt, 5_000);

  const moved: ProximityAlert = { ...near, distanceMeters: 22, latitude: 10.2 };
  const second = mergeActiveAlerts(first.alerts, [moved, far], 9_000);
  assert.deepEqual(
    second.entered.map((alert) => alert.id),
    ['delta'],
  );
  const alpha = second.alerts.find((alert) => alert.id === 'alpha') as ActiveContact;
  assert.equal(alpha.observedAt, 5_000);
  assert.equal(alpha.distanceMeters, 22);
});

test('alert events use the target id and label', () => {
  assert.deepEqual(toProximityAlertEvent(near), {
    targetEntityId: 'alpha',
    targetName: 'Alpha',
    distanceMeters: 30,
    latitude: 10.1,
    longitude: 20.1,
    message: 'Target detected within radius',
  });
});
