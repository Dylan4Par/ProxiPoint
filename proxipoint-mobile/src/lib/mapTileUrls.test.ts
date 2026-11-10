import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tileSetup } from './mapTileUrls';

test('a Stadia key: Outdoors (light) and Alidade Smooth Dark, names built in, Stadia credit', () => {
  const s = tileSetup(' abc-123 ');
  assert.equal(s.provider, 'stadia');
  assert.equal(s.urls.dark.base, 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}@2x.png?api_key=abc-123');
  assert.equal(s.urls.light.base, 'https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}@2x.png?api_key=abc-123');
  assert.equal(s.urls.dark.labels, '');
  assert.match(s.attribution, /Stadia Maps.*OpenMapTiles.*OpenStreetMap/);
  assert.ok(!s.attributionHtml.includes("'"), 'safe inside a quoted Leaflet option');
  // Explore Map: Stadia's vector styles, with the key.
  assert.equal(s.styles.light, 'https://tiles.stadiamaps.com/styles/outdoors.json?api_key=abc-123');
  assert.equal(s.styles.dark, 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=abc-123');
});

test('no key: Esri as before (base plus street names)', () => {
  const s = tileSetup('');
  assert.equal(s.provider, 'esri');
  assert.match(s.urls.dark.base, /World_Dark_Gray_Base/);
  assert.match(s.urls.light.labels, /World_Light_Gray_Reference/);
  assert.equal(s.attribution, '© Esri');
  // Explore Map: a raster style of the same tiles, base under the street names.
  const light = s.styles.light;
  assert.ok(typeof light === 'object');
  assert.deepEqual(light.layers.map((l) => l.source), ['base', 'labels']);
  assert.equal(light.sources.labels.tiles[0], s.urls.light.labels);
});
