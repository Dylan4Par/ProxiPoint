import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOUNDARY_RADII,
  FALLBACK_ANCHOR,
  compactPlaceLabel,
  formatRadiusDisplay,
  getRecommendedTier,
  inferPlaceType,
  resolveAnchor,
  resolveBoundaryTiers,
  zoomForRadius,
} from './boundaryTiers';

test('formats meters and kilometers cleanly', () => {
  assert.equal(formatRadiusDisplay(300), '300m');
  assert.equal(formatRadiusDisplay(1500), '1.5km');
  assert.equal(formatRadiusDisplay(8000), '8km');
  assert.equal(formatRadiusDisplay(1000), '1km');
});

test('resolves the three standardized boundary tiers', () => {
  const tiers = resolveBoundaryTiers({ placeName: 'Pearl Street Mall', placeType: 'poi' });
  assert.equal(tiers.length, 3);
  assert.equal(tiers[0]?.id, 'micro');
  assert.equal(tiers[0]?.radiusMeters, BOUNDARY_RADII.micro);
  assert.equal(tiers[0]?.radiusMeters, 300);
  assert.equal(tiers[0]?.label, 'Pearl Street Mall');
  assert.equal(tiers[0]?.displayRadius, '300m');
  assert.equal(tiers[1]?.id, 'neighborhood');
  assert.equal(tiers[1]?.radiusMeters, 1500);
  assert.equal(tiers[1]?.displayRadius, '1.5km');
  assert.equal(tiers[2]?.id, 'metro');
  assert.equal(tiers[2]?.radiusMeters, 8000);
  assert.equal(tiers[2]?.displayRadius, '8km');
});

test('truncates overly long venue labels for compact chip display', () => {
  const longName = 'The Historic Rayback Collective Beer Garden & Food Hall';
  const tiers = resolveBoundaryTiers({ placeName: longName, placeType: 'poi' });
  assert.ok((tiers[0]?.label.length ?? 0) <= 21);
  assert.match(tiers[0]?.label ?? '', /…/);
  assert.equal(compactPlaceLabel(longName).length, 20);
});

test('recommends a tier from geocoder place_type and semantic context', () => {
  assert.equal(getRecommendedTier('poi'), 'micro');
  assert.equal(getRecommendedTier('address'), 'micro');
  assert.equal(getRecommendedTier('micro'), 'micro');
  assert.equal(getRecommendedTier('neighborhood'), 'neighborhood');
  assert.equal(getRecommendedTier('district'), 'neighborhood');
  assert.equal(getRecommendedTier('city'), 'metro');
  assert.equal(getRecommendedTier('locality'), 'metro');
  assert.equal(getRecommendedTier('metro'), 'metro');
  assert.equal(getRecommendedTier(undefined), 'micro');
  assert.equal(inferPlaceType('Warehouse District'), 'neighborhood');
  assert.equal(inferPlaceType('Boulder city center'), 'city');
  assert.equal(inferPlaceType('Pearl St & Broadway'), 'address');
  assert.equal(inferPlaceType('The Rusty Anchor', 'poi'), 'poi');
});

test('falls back to the discovery baseline when a hit has no anchor', () => {
  assert.deepEqual(resolveAnchor(null), { ...FALLBACK_ANCHOR, source: 'baseline' });
  assert.deepEqual(resolveAnchor({ latitude: null, longitude: 1 }), {
    ...FALLBACK_ANCHOR,
    source: 'baseline',
  });
  assert.deepEqual(resolveAnchor({ latitude: 40.0179, longitude: -105.2789 }), {
    latitude: 40.0179,
    longitude: -105.2789,
    source: 'place',
  });
});

test('camera zoom opens up as the geofence grows', () => {
  assert.equal(zoomForRadius(300), 16);
  assert.equal(zoomForRadius(1500), 14);
  assert.equal(zoomForRadius(8000), 12);
});
