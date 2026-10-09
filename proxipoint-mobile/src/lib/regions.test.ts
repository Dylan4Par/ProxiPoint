import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_REGION_TOLERANCE_METERS, isInOperatorDistrict, locateRegions, regionLabel } from './regions';

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

test('the default card list includes every event inside the operator district', () => {
  const operator = { longitude: -105.278189, latitude: 40.017042 };
  const downtownEvents = [
    { longitude: -105.283779, latitude: 40.017458 },
    { longitude: -105.273221, latitude: 40.017874 },
    { longitude: -105.278189, latitude: 40.020368 },
  ];
  for (const event of downtownEvents) {
    assert.equal(isInOperatorDistrict(event.longitude, event.latitude, operator.longitude, operator.latitude), true);
  }
  assert.equal(isInOperatorDistrict(-105.3, 40.02, operator.longitude, operator.latitude), false);
});

test('standing on the mall frontage still lists the enclosing commercial district', () => {
  assert.equal(isInOperatorDistrict(-105.283779, 40.017458, -105.2785, 40.0176), true);
  assert.equal(isInOperatorDistrict(-105.278189, 40.017042, -105.28, 40.0179), true);
});

test('city or county membership does not list the whole city', () => {
  assert.equal(isInOperatorDistrict(-105.278189, 40.017042, -105.3, 40.02), false);
  assert.equal(isInOperatorDistrict(-105.278189, 40.017042, -77.6, 39.0), false);
});
