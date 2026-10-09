import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  interpretPhotonFeatures,
  isSameVerifiedQuery,
  labelFromPhotonProperties,
  type PhotonFeature,
} from './addressVerify';

const pearl: PhotonFeature = {
  geometry: { coordinates: [-105.278, 40.0176] },
  properties: {
    name: 'Pearl Street Mall',
    street: 'Pearl Street',
    city: 'Boulder',
    state: 'Colorado',
    postcode: '80302',
    country: 'United States',
  },
};

test('a photon hit becomes a verified address label and coordinates', () => {
  const verified = interpretPhotonFeatures('Pearl Street Mall', [pearl]);
  assert.ok(verified);
  assert.equal(verified?.query, 'Pearl Street Mall');
  assert.equal(verified?.latitude, 40.0176);
  assert.equal(verified?.longitude, -105.278);
  assert.match(verified?.label ?? '', /Pearl Street Mall/);
  assert.match(verified?.label ?? '', /Boulder/);
});

test('empty or invalid geocoder hits are not verified', () => {
  assert.equal(interpretPhotonFeatures('nowhere', []), null);
  assert.equal(
    interpretPhotonFeatures('bad', [{ geometry: { coordinates: [400, 10] }, properties: { name: 'Nope' } }]),
    null,
  );
  assert.equal(labelFromPhotonProperties({}), '');
});

test('verification only sticks while the address text is unchanged', () => {
  const verified = interpretPhotonFeatures('Pearl Street Mall', [pearl]);
  assert.equal(isSameVerifiedQuery(verified, 'Pearl Street Mall'), true);
  assert.equal(isSameVerifiedQuery(verified, 'Pearl Street Mall '), true);
  assert.equal(isSameVerifiedQuery(verified, 'Somewhere else'), false);
  assert.equal(isSameVerifiedQuery(null, 'Pearl Street Mall'), false);
});
