import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inMetroArea, nearestCityLabel } from './mapArea';

const cities = [
  { name: 'Boulder', region: 'CO', latitude: 40.015, longitude: -105.2705 },
  { name: 'Erie', region: 'CO', latitude: 40.0503, longitude: -105.05 },
  { name: 'Fort Collins', region: 'CO', latitude: 40.5853, longitude: -105.0844 },
];

test('card city: closest listed city nearby, else nothing', () => {
  assert.equal(nearestCityLabel({ latitude: 40.02, longitude: -105.26 }, cities), 'Boulder, CO');
  assert.equal(nearestCityLabel({ latitude: 40.05, longitude: -105.06 }, cities), 'Erie, CO');
  assert.equal(nearestCityLabel({ latitude: 35, longitude: -100 }, cities), '');
  assert.equal(nearestCityLabel({}, cities), '');
});

test('metro area: Boulder Points show around Erie, not around Fort Collins', () => {
  const boulder = { latitude: 40.015, longitude: -105.2705 };
  assert.equal(inMetroArea(boulder, cities[1]), true);
  assert.equal(inMetroArea(boulder, cities[2]), false);
  assert.equal(inMetroArea({}, cities[2]), true);
});
