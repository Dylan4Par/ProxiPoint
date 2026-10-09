import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearestPlace, searchPlaces } from './placeSearch';

test('short queries do not open the suggestion list', () => {
  assert.deepEqual(searchPlaces(''), []);
  assert.deepEqual(searchPlaces('p'), []);
});

test('place search prefers prefix matches over subtitle matches', () => {
  const results = searchPlaces('pearl');
  assert.equal(results[0]?.id, 'pearl-broadway');
  assert.equal(results[0]?.latitude, 40.0179);
  assert.equal(results[0]?.longitude, -105.2789);
});

test('venue and host terms resolve to a single place record', () => {
  const tech = searchPlaces('tech lab');
  assert.equal(tech.length, 1);
  assert.equal(tech[0]?.label, 'Downtown Tech Lab');

  const creek = searchPlaces('creek');
  assert.ok(creek.some((place) => place.id === 'creek-pavilion'));
});

test('nearest place labels a GPS fix that lands on a known venue', () => {
  const place = nearestPlace(40.0632, -105.0365, 50);
  assert.equal(place?.id, 'rusty-anchor');
  assert.equal(nearestPlace(0, 0), null);
});
