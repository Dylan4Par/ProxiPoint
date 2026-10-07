import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDiscoveryMapDocument } from './discoveryMapDocument';

test('the native map document uses the keyless CARTO basemap', () => {
  const html = buildDiscoveryMapDocument();
  assert.match(html, /basemaps\.cartocdn\.com\/dark_all/);
  assert.equal(html.includes('tile.openstreetmap.org'), false);
  assert.equal(html.includes('api_key'), false);
  assert.equal(html.includes('access_token'), false);
  assert.match(html, /OpenStreetMap/);
  assert.match(html, /CARTO/);
  assert.match(html, /window\.__pp/);
});
