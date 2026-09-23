import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldPublishTelemetry } from './trackingPolicy';

test('telemetry publishes only with a callsign and the broadcast switch on', () => {
  assert.equal(shouldPublishTelemetry('Ranger-123E4567', true), true);
  assert.equal(shouldPublishTelemetry('Ranger-123E4567', false), false);
  assert.equal(shouldPublishTelemetry('   ', true), false);
  assert.equal(shouldPublishTelemetry('', true), false);
});
