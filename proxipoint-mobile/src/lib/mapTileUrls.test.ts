import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tileSetup } from './mapTileUrls';

test('a Stadia key: OSM Bright (light) and Alidade Smooth Dark, names built in, Stadia credit', () => {
  const s = tileSetup(' abc-123 ');
  assert.equal(s.provider, 'stadia');
  assert.equal(s.urls.dark.base, 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}@2x.png?api_key=abc-123');
  assert.equal(s.urls.light.base, 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}@2x.png?api_key=abc-123');
  assert.equal(s.urls.dark.labels, '');
  assert.match(s.attribution, /Stadia Maps.*OpenMapTiles.*OpenStreetMap/);
  assert.ok(!s.attributionHtml.includes("'"), 'safe inside a quoted Leaflet option');
});

test('no key: Esri as before (base plus street names)', () => {
  const s = tileSetup('');
  assert.equal(s.provider, 'esri');
  assert.match(s.urls.dark.base, /World_Dark_Gray_Base/);
  assert.match(s.urls.light.labels, /World_Light_Gray_Reference/);
  assert.equal(s.attribution, '© Esri');
});
