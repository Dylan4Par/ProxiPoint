import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyPlaceTier, resolveBoundary } from './spatialBoundary';

test('a venue, district, and city resolve to the broadcast tiers', () => {
  assert.equal(classifyPlaceTier({ osm_key: 'amenity', osm_value: 'marketplace', type: 'other' }), 'poi');
  assert.equal(classifyPlaceTier({ osm_key: 'place', osm_value: 'suburb', type: 'district' }), 'neighborhood');
  assert.equal(classifyPlaceTier({ osm_key: 'place', osm_value: 'city', type: 'city' }), 'city');
  assert.equal(classifyPlaceTier({ type: 'house', osm_key: 'building' }), 'address');

  const mall = resolveBoundary(40.017, -105.279, 'poi', null);
  assert.equal(mall.radiusMeters, 300);
  assert.equal(mall.sourceTier, 'poi');

  const district = resolveBoundary(40.017, -105.279, 'neighborhood', null);
  assert.equal(district.radiusMeters, 1500);

  const city = resolveBoundary(40.017, -105.279, 'city', 500);
  assert.equal(city.radiusMeters, 500);
  assert.equal(city.sourceTier, 'city');
  assert.equal(city.centerLon, -105.279);
});
