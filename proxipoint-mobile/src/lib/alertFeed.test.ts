import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contactsEnteringRadius,
  formatRelativeTime,
  mergeActiveAlerts,
  partitionContactsByRadius,
  sortAlertsByDistance,
  toProximityAlertEvent,
} from './alertFeed';
import { DISCOVERY_RADIUS_METERS, RADIUS_PRESETS, type ActiveContact, type ProximityAlert } from '../types/telemetry';

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

test('100m keeps alpha and bravo active and parks charlie and delta', () => {
  const contacts = [
    { ...far, id: 'charlie', label: 'Charlie', distanceMeters: 199.8 },
    { ...near, distanceMeters: 30 },
    { ...far, distanceMeters: 419.5 },
    { ...near, id: 'bravo', label: 'Bravo', distanceMeters: 79.9 },
  ];
  const split = partitionContactsByRadius(contacts, 100);
  assert.deepEqual(
    split.inRange.map((contact) => contact.id),
    ['alpha', 'bravo'],
  );
  assert.deepEqual(
    split.outOfRange.map((contact) => contact.id),
    ['charlie', 'delta'],
  );
});

test('widening the shared radius pulls the next contact back into range', () => {
  const contacts = [
    { ...near, distanceMeters: 30 },
    { ...near, id: 'bravo', label: 'Bravo', distanceMeters: 79.9 },
    { ...far, id: 'charlie', label: 'Charlie', distanceMeters: 199.8 },
    { ...far, distanceMeters: 419.5 },
  ];
  assert.deepEqual(
    partitionContactsByRadius(contacts, 250).inRange.map((contact) => contact.id),
    ['alpha', 'bravo', 'charlie'],
  );
  assert.deepEqual(
    partitionContactsByRadius(contacts, 50).inRange.map((contact) => contact.id),
    ['alpha'],
  );
});

test('notifications fire only when a contact crosses into the active radius', () => {
  const discovered = [
    { ...near, distanceMeters: 30 },
    { ...near, id: 'bravo', label: 'Bravo', distanceMeters: 79.9 },
    { ...far, id: 'charlie', label: 'Charlie', distanceMeters: 199.8 },
  ];
  assert.deepEqual(
    contactsEnteringRadius([], discovered, 100).map((contact) => contact.id),
    ['alpha', 'bravo'],
  );
  const inside = discovered.filter((contact) => contact.distanceMeters <= 100);
  const closer = discovered.map((contact) =>
    contact.id === 'charlie' ? { ...contact, distanceMeters: 90 } : contact,
  );
  assert.deepEqual(
    contactsEnteringRadius(inside, closer, 100).map((contact) => contact.id),
    ['charlie'],
  );
});

test('discovery radius is the widest geofence preset', () => {
  assert.equal(DISCOVERY_RADIUS_METERS, Math.max(...RADIUS_PRESETS));
  assert.equal(DISCOVERY_RADIUS_METERS, 500);
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
