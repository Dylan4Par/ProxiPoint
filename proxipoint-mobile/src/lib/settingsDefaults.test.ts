import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearestReach, searchRanges } from './units';
import { isMapStyle, resolveMapMode } from './mapStyle';

test('default reach moves to the nearest choice when units change', () => {
  assert.equal(nearestReach(null, 'metric'), null, 'any distance stays any');
  const fiveMiles = searchRanges('imperial')[2].meters!;
  assert.equal(nearestReach(fiveMiles, 'metric'), 10000);
  assert.equal(nearestReach(10000, 'imperial'), fiveMiles);
  assert.equal(nearestReach(1000, 'metric'), 1000);
});

test('map style: Match app follows the theme, Light / Dark stay put', () => {
  assert.equal(resolveMapMode('auto', 'dark'), 'dark');
  assert.equal(resolveMapMode('auto', 'light'), 'light');
  assert.equal(resolveMapMode('light', 'dark'), 'light');
  assert.equal(resolveMapMode('dark', 'light'), 'dark');
  assert.ok(isMapStyle('auto') && !isMapStyle('satellite') && !isMapStyle(null));
});
