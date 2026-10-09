import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ESRI_STREET_TILE_URL,
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

test('map document mounts an Esri street canvas at the anchor', () => {
  const html = buildDiscoveryMapDocument({ latitude: 40.0179, longitude: -105.2789 });
  assert.match(html, /40\.0179/);
  assert.match(html, /-105\.2789/);
  assert.match(html, new RegExp(ESRI_STREET_TILE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /leaflet@1\.9\.4/);
  assert.match(html, /setPreviewGeofence/);
  assert.match(html, /geofencePulse/);
});
