import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAP_TILE_URLS } from './mapTileUrls';
import {
  buildDiscoveryMapDocument,
  buildPreviewGeofenceScript,
} from './discoveryMapDocument';
import { zoomForRadius } from './boundaryTiers';

test('preview script draws a glowing cyan radial perimeter and flies to the anchor', () => {
  const script = buildPreviewGeofenceScript();
  assert.match(script, /window\.setPreviewGeofence/);
  assert.match(script, /window\.clearPreviewGeofence/);
  assert.match(script, /L\.circle/);
  assert.match(script, /fillOpacity: 0\.12/);
  assert.match(script, /geofence-glow/);
  assert.match(script, /map\.flyTo/);
  assert.match(script, /duration: 0\.6/);
  assert.match(script, /map\.on\('click'/);
  assert.match(script, /proxipoint-map-pick/);
  assert.equal(zoomForRadius(300), 16);
  assert.equal(zoomForRadius(8000), 12);
});

test('map document uses the same Esri canvas tiles as Explore Map, per theme', () => {
  const html = buildDiscoveryMapDocument({ latitude: 40.0179, longitude: -105.2789 });
  assert.match(html, /40\.0179/);
  assert.match(html, /-105\.2789/);
  // Dark by default: base and labels.
  assert.ok(html.includes(MAP_TILE_URLS.dark.base));
  assert.ok(html.includes(MAP_TILE_URLS.dark.labels));
  assert.ok(!html.includes('protomaps'), 'no vector tiles unless asked for');
  const light = buildDiscoveryMapDocument({ latitude: 40, longitude: -105 }, { theme: 'light' });
  assert.ok(light.includes(MAP_TILE_URLS.light.base) && light.includes(MAP_TILE_URLS.light.labels));
  assert.match(html, /leaflet@1\.9\.4/);
  assert.match(html, /setPreviewGeofence/);
  assert.match(html, /geofencePulse/);
});
