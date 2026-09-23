import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateDistanceMeters, evaluateEmission, type EmissionState } from './locationFilter';

const origin: EmissionState = { lastCoords: null, lastTime: 0 };

function northOf(lat: number, lon: number, meters: number) {
  return { lat: lat + meters / 111320, lon };
}

test('haversine distance is zero for the same point', () => {
  assert.ok(calculateDistanceMeters(37.77, -122.42, 37.77, -122.42) < 0.001);
});

test('first fix is always emitted', () => {
  const result = evaluateEmission(origin, 37.77, -122.42, 1_000);
  assert.equal(result.emit, true);
  assert.deepEqual(result.state.lastCoords, { lat: 37.77, lon: -122.42 });
  assert.equal(result.state.lastTime, 1_000);
});

test('movement under 3 meters inside the heartbeat window is dropped', () => {
  const first = evaluateEmission(origin, 37.77, -122.42, 1_000);
  const jitter = northOf(37.77, -122.42, 1);
  const result = evaluateEmission(first.state, jitter.lat, jitter.lon, 2_000);
  assert.equal(result.emit, false);
  assert.equal(result.state.lastTime, 1_000);
});

test('movement of at least 3 meters is emitted', () => {
  const first = evaluateEmission(origin, 37.77, -122.42, 1_000);
  const moved = northOf(37.77, -122.42, 4);
  const result = evaluateEmission(first.state, moved.lat, moved.lon, 2_000);
  assert.equal(result.emit, true);
  assert.ok(calculateDistanceMeters(37.77, -122.42, moved.lat, moved.lon) >= 3);
});

test('a stationary device emits a heartbeat after 10 seconds', () => {
  const first = evaluateEmission(origin, 37.77, -122.42, 1_000);
  const early = evaluateEmission(first.state, 37.77, -122.42, 10_999);
  assert.equal(early.emit, false);

  const heartbeat = evaluateEmission(first.state, 37.77, -122.42, 11_000);
  assert.equal(heartbeat.emit, true);
  assert.equal(heartbeat.state.lastTime, 11_000);
});
