import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_REGION_TOLERANCE_METERS, locateRegions, regionLabel } from './regions';

test('a Pearl Street frontage point matches the mall inside the 15 meter buffer', () => {
  const matches = locateRegions(-105.2785, 40.0176, DEFAULT_REGION_TOLERANCE_METERS);
  assert.deepEqual(
    matches.map((match) => match.name),
    ['Pearl Street Mall', 'Downtown Boulder', 'Boulder', 'Boulder County'],
  );
  assert.equal(matches[0].regionType, 'pedestrian_mall');
  assert.equal(matches[0].parentRegionId, matches[1].id);
  assert.equal(regionLabel(matches), 'Pearl Street Mall · Downtown Boulder · Boulder · Boulder County');
});

test('strict containment keeps the frontage point in the enclosing districts only', () => {
  const matches = locateRegions(-105.2785, 40.0176, 0);
  assert.deepEqual(
    matches.map((match) => match.name),
    ['Downtown Boulder', 'Boulder', 'Boulder County'],
  );
});

test('a point inside the mall polygon matches without a buffer', () => {
  const matches = locateRegions(-105.28, 40.0179, 0);
  assert.equal(matches[0]?.name, 'Pearl Street Mall');
  assert.ok(matches.every((match, index) => index === 0 || match.areaSquareMeters >= matches[index - 1].areaSquareMeters));
});

test('a coordinate outside Boulder matches no region', () => {
  assert.deepEqual(locateRegions(-77.6, 39.0), []);
});

test('a city point does not inherit the mall', () => {
  const matches = locateRegions(-105.3, 40.02, 0);
  assert.deepEqual(
    matches.map((match) => match.name),
    ['Boulder', 'Boulder County'],
  );
});
