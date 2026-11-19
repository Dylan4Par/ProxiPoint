import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_DROP_DISTANCE_METERS, dropRangeError } from './dropRange';

const erie = { latitude: 40.0503, longitude: -105.0499 };

test('spots within 100 miles are fine', () => {
  assert.equal(dropRangeError(erie, erie, 'imperial'), null);
  // Colorado Springs, about 85 mi away.
  assert.equal(dropRangeError(erie, { latitude: 38.8339, longitude: -104.8214 }, 'imperial'), null);
});

test('spots past 100 miles are refused, in the user’s units', () => {
  // Pueblo, about 125 mi away.
  const pueblo = { latitude: 38.2544, longitude: -104.6091 };
  assert.match(dropRangeError(erie, pueblo, 'imperial') ?? '', /^That spot is 12\d mi away\. Points can be dropped within 100 mi of you\.$/);
  assert.match(dropRangeError(erie, pueblo, 'metric') ?? '', /within 161 km of you\.$/);
  assert.equal(Math.round(MAX_DROP_DISTANCE_METERS), 160934);
});
