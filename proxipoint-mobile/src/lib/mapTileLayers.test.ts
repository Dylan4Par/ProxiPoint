import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wideLayersFor } from './mapTileLayers';

const MILE = 1609.344;

test('wider map layers load only as the view widens', () => {
  assert.equal(wideLayersFor(2300), 0, 'the default neighborhood view: streets only');
  assert.equal(wideLayersFor(3 * MILE), 1);
  assert.equal(wideLayersFor(8 * MILE), 2);
  assert.equal(wideLayersFor(20 * MILE), 3);
  assert.equal(wideLayersFor(35 * MILE), 4);
  assert.equal(wideLayersFor(70 * MILE), 4, 'the furthest zoom has every layer');
});
