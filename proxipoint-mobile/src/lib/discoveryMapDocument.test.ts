import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDiscoveryMapDocument } from './discoveryMapDocument';

test('the native map document uses the keyless Esri dark canvas', () => {
  const html = buildDiscoveryMapDocument();
  assert.match(html, /World_Dark_Gray_Base\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/);
  assert.match(html, /World_Dark_Gray_Reference/);
  assert.match(html, /leaflet@1\.9\.4/);
  assert.equal(html.includes('tile.openstreetmap.org'), false);
  assert.equal(html.includes('basemaps.cartocdn.com'), false);
  assert.equal(html.includes('api_key'), false);
  assert.equal(html.includes('access_token'), false);
  assert.match(html, /Esri/);
  assert.match(html, /OpenStreetMap/);
  assert.match(html, /window\.__pp/);
});
