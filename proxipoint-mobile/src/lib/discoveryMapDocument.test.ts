import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDiscoveryMapDocument } from './discoveryMapDocument';

test('the native map document uses the keyless OpenFreeMap style', () => {
  const html = buildDiscoveryMapDocument();
  assert.match(html, /https:\/\/tiles\.openfreemap\.org\/styles\/dark/);
  assert.match(html, /maplibre-gl@5\.6\.1/);
  assert.equal(html.includes('tile.openstreetmap.org'), false);
  assert.equal(html.includes('basemaps.cartocdn.com'), false);
  assert.equal(html.includes('api_key'), false);
  assert.equal(html.includes('access_token'), false);
  assert.match(html, /attributionControl: true/);
  assert.match(html, /window\.__pp/);
});
