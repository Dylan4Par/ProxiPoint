import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapZoomFor, worldViewFor, worldZoomFor } from './mapZoom';
import { CENTER_WORLD, WORLD_SCALE } from './mapArea';

const DENVER = 39.74;

test('world zoom and MapLibre zoom convert both ways', () => {
  for (const z of [0.005, 0.05, 0.4, 1, 3]) {
    assert.ok(Math.abs(worldZoomFor(mapZoomFor(z, DENVER), DENVER) - z) / z < 1e-9);
  }
});

test('zoom levels match what the map shows', () => {
  // Closest zoom (3 points per world unit, ~0.74 m per point) is about street level, zoom ~16.3.
  assert.ok(Math.abs(mapZoomFor(3, DENVER) - 16.31) < 0.05);
  // 70 miles across a 400-point phone is a regional view, about zoom 7.7.
  const wide = 400 / (70 * 1609.344 * WORLD_SCALE);
  assert.ok(Math.abs(mapZoomFor(wide, DENVER) - 7.75) < 0.1);
  // One zoom level up doubles the world zoom.
  assert.ok(Math.abs(worldZoomFor(13, DENVER) / worldZoomFor(12, DENVER) - 2) < 1e-9);
});

test('world view from map bounds: only the uncovered part counts', () => {
  // A plain linear world for the test: 1 degree = 100 units, area center at (0, 0) degrees.
  const toWorld = (lat: number, lon: number) => ({ x: CENTER_WORLD + lon * 100, y: CENTER_WORLD - lat * 100 });
  const v = worldViewFor([-1, -2, 1, 2], 400, 0.5, toWorld);
  assert.ok(v);
  assert.equal(v.minX, CENTER_WORLD - 100);
  assert.equal(v.maxX, CENTER_WORLD + 100);
  assert.equal(v.minY, CENTER_WORLD - 200);
  assert.equal(v.maxY, CENTER_WORLD); // top half of 400 units
  assert.equal(v.zoom, 2); // 400 points over 200 units
  assert.equal(worldViewFor([1, 0, 1, 0], 400, 1, toWorld), null, 'empty bounds');
});
