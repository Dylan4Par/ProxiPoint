import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultUnits, formatDistanceIn, formatRadiusIn, getUnits, searchRanges, setUnits } from './units';
import { formatDistance } from './discoverFeed';

test('metric distances', () => {
  assert.equal(formatDistanceIn(316, 'metric'), '316m');
  assert.equal(formatDistanceIn(1400, 'metric'), '1.4 km');
  assert.equal(formatDistanceIn(25000, 'metric'), '25 km');
  assert.equal(formatDistanceIn(undefined, 'metric'), null);
});

test('imperial distances: feet up close, miles after', () => {
  assert.equal(formatDistanceIn(316, 'imperial'), '0.2 mi');
  assert.equal(formatDistanceIn(100, 'imperial'), '330 ft');
  assert.equal(formatDistanceIn(1400, 'imperial'), '0.9 mi');
  assert.equal(formatDistanceIn(25000, 'imperial'), '16 mi');
});

test('radius labels and search ranges', () => {
  assert.equal(formatRadiusIn(5000, 'metric'), '5 km');
  assert.equal(formatRadiusIn(500, 'metric'), '500 m');
  assert.equal(formatRadiusIn(5000, 'imperial'), '3 mi');
  assert.equal(formatRadiusIn(800, 'imperial'), '0.5 mi');
  assert.deepEqual(searchRanges('imperial').map((r) => r.label), ['1 mi', '3 mi', '5 mi', '15 mi', 'Any']);
  assert.deepEqual(searchRanges('metric').map((r) => r.label), ['1 km', '5 km', '10 km', '25 km', 'Any']);
});

test('default from the phone region', () => {
  assert.equal(defaultUnits('en-US'), 'imperial');
  assert.equal(defaultUnits('en-CA'), 'metric');
  assert.equal(defaultUnits('fr'), 'metric');
});

test('formatDistance follows the setting', () => {
  const before = getUnits();
  setUnits('imperial');
  assert.equal(formatDistance(316), '0.2 mi');
  setUnits('metric');
  assert.equal(formatDistance(316), '316m');
  setUnits(before);
});
