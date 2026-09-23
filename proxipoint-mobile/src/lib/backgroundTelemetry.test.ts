import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  flushTelemetryBatch,
  parseTelemetryQueue,
  planBackgroundBatch,
  resolveBackgroundBroadcast,
} from './backgroundTelemetry';
import type { LocationPingPayload } from '../types/telemetry';

const ping = (userId: string, latitude: number): LocationPingPayload => ({
  userId,
  latitude,
  longitude: -122.4194,
  accuracy: 5,
  speed: 0,
  heading: 0,
  radiusMeters: 500,
  timestamp: '2026-09-23T12:00:00.000Z',
});

test('a live session wins over stored prefs so the settings switch applies immediately', () => {
  const decision = resolveBackgroundBroadcast(
    { userId: 'Scout-2', telemetryEnabled: false },
    { callsign: 'Scout-1', trackingEnabled: 'true' },
  );
  assert.deepEqual(decision, { userId: 'Scout-2', telemetryEnabled: false });
});

test('a cold start reads the stored callsign and broadcast switch', () => {
  assert.deepEqual(
    resolveBackgroundBroadcast(null, { callsign: ' Ranger-01 ', trackingEnabled: 'false' }),
    { userId: 'Ranger-01', telemetryEnabled: false },
  );
  assert.deepEqual(resolveBackgroundBroadcast(null, { callsign: 'Ranger-01', trackingEnabled: null }), {
    userId: 'Ranger-01',
    telemetryEnabled: true,
  });
});

test('disabled broadcasting drops the wake batch and keeps it from being sent', () => {
  const queued = [ping('Ranger-01', 37.7)];
  assert.deepEqual(planBackgroundBatch(queued, [ping('Ranger-01', 37.8)], false), []);
});

test('a wake streams queued points ahead of the new locations and caps the buffer', () => {
  const queued = [ping('Ranger-01', 1), ping('Ranger-01', 2)];
  const incoming = [ping('Ranger-01', 3), ping('Ranger-01', 4)];
  assert.deepEqual(
    planBackgroundBatch(queued, incoming, true, 3).map((item) => item.latitude),
    [2, 3, 4],
  );
});

test('a failed post keeps that point and everything after it', async () => {
  const batch = [ping('Ranger-01', 1), ping('Ranger-01', 2), ping('Ranger-01', 3)];
  const sent: number[] = [];
  const remaining = await flushTelemetryBatch(batch, async (payload) => {
    if (payload.latitude === 2) throw new Error('offline');
    sent.push(payload.latitude);
  });
  assert.deepEqual(sent, [1]);
  assert.deepEqual(
    remaining.map((item) => item.latitude),
    [2, 3],
  );
});

test('stored queue ignores corrupt payloads', () => {
  const raw = JSON.stringify([ping('Ranger-01', 37.7), { latitude: 1 }, 'nope']);
  assert.deepEqual(parseTelemetryQueue(raw).map((item) => item.userId), ['Ranger-01']);
  assert.deepEqual(parseTelemetryQueue('not-json'), []);
  assert.deepEqual(parseTelemetryQueue(null), []);
});
