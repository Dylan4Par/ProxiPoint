import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultUnits, formatDistanceIn, formatDistanceWordsIn, formatRadiusIn, formatRangeWords, getUnits, searchRanges, setUnits } from './units';
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

test('ranges in words for the distance menu', () => {
  assert.deepEqual(searchRanges('imperial').map((r) => formatRangeWords(r.meters, 'imperial')), ['1 mile', '3 miles', '5 miles', '15 miles', 'Any distance']);
  assert.deepEqual(searchRanges('metric').map((r) => formatRangeWords(r.meters, 'metric')), ['1 km', '5 km', '10 km', '25 km', 'Any distance']);
});

test('distances in words for Discover cards', () => {
  const mi = 1609.344;
  assert.equal(formatDistanceWordsIn(12 * mi, 'imperial'), '12 miles');
  assert.equal(formatDistanceWordsIn(1.4 * mi, 'imperial'), '1.4 miles');
  assert.equal(formatDistanceWordsIn(1.02 * mi, 'imperial'), '1 mile');
  assert.equal(formatDistanceWordsIn(320, 'imperial'), '350 yards');
  assert.equal(formatDistanceWordsIn(3, 'imperial'), '10 yards');
  assert.equal(formatDistanceWordsIn(800, 'metric'), '800 meters');
  assert.equal(formatDistanceWordsIn(1000, 'metric'), '1 kilometer');
  assert.equal(formatDistanceWordsIn(1400, 'metric'), '1.4 kilometers');
  assert.equal(formatDistanceWordsIn(25300, 'metric'), '25 kilometers');
  assert.equal(formatDistanceWordsIn(undefined, 'metric'), null);
});
