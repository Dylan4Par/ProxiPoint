import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateCallsign } from './deviceProfile';

test('generated callsign uses a short id from the uuid', () => {
  assert.equal(generateCallsign(() => '123e4567-e89b-12d3-a456-426614174000'), 'Ranger-123E4567');
});

test('generated callsigns stay readable when the uuid has no dashes', () => {
  assert.equal(generateCallsign(() => 'abcdef1234567890'), 'Ranger-ABCDEF12');
});
