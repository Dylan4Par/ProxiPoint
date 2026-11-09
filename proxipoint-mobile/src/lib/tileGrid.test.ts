import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_TILES, roundView, tileLevelFor, tilesForView, tileUrl } from './tileGrid';

const DENVER = { latitude: 39.74, longitude: -104.99 };
const PHONE = { w: 400, h: 600 }; // screen points

/** The world box a phone screen shows at a map zoom, centered on the area. */
const viewAt = (z: number) => ({
  minX: 480 - PHONE.w / 2 / z,
  maxX: 480 + PHONE.w / 2 / z,
  minY: 480 - PHONE.h / 2 / z,
  maxY: 480 + PHONE.h / 2 / z,
});

test('tile level follows the zoom: street level up close, coarse when zoomed out', () => {
  assert.equal(tileLevelFor(1, DENVER.latitude), 16); // ~1.4 km across the screen
  assert.equal(tileLevelFor(0.25, DENVER.latitude), 14);
  assert.equal(tileLevelFor(0.03, DENVER.latitude), 11); // ~30 km across
  assert.equal(tileLevelFor(0.002, DENVER.latitude), 7); // ~440 km across
  assert.equal(tileLevelFor(50, DENVER.latitude), 16, 'never past the sharpest level');
});

test('one level covers the screen with a modest number of tiles at any zoom', () => {
  for (const z of [2, 1, 0.5, 0.25, 0.1, 0.03, 0.01, 0.004]) {
    const level = tileLevelFor(z, DENVER.latitude);
    const tiles = tilesForView(DENVER, viewAt(z), level);
    assert.ok(tiles.length >= 4 && tiles.length <= 40, `zoom ${z}: ${tiles.length} tiles`);
    assert.ok(tiles.every((t) => t.z === level), 'one level only');
    // Each tile shows at roughly 256 points (between ~180 and ~360), except past the sharpest
    // level, where tiles are drawn larger.
    const shown = tiles[0].width * z;
    if (level < 16) assert.ok(shown > 170 && shown < 370, `zoom ${z}: tile is ${shown.toFixed(0)} pt`);
    // Together they cover the whole screen.
    const v = viewAt(z);
    assert.ok(Math.min(...tiles.map((t) => t.left)) <= v.minX, 'left edge covered');
    assert.ok(Math.max(...tiles.map((t) => t.left + t.width)) >= v.maxX, 'right edge covered');
    assert.ok(Math.min(...tiles.map((t) => t.top)) <= v.minY, 'top covered');
    assert.ok(Math.max(...tiles.map((t) => t.top + t.height)) >= v.maxY, 'bottom covered');
  }
});

test('the middle tile comes first; never more than the cap', () => {
  const tiles = tilesForView(DENVER, viewAt(1), 16);
  const first = tiles[0];
  assert.ok(first.left <= 480 && first.left + first.width >= 480 && first.top <= 480 && first.top + first.height >= 480);
  const huge = tilesForView(DENVER, { minX: -20000, maxX: 20000, minY: -20000, maxY: 20000 }, 16);
  assert.equal(huge.length, MAX_TILES);
});

test('tile URLs and view rounding', () => {
  assert.equal(tileUrl('https://t/{z}/{x}/{y}@2x.png?k=1', { z: 16, x: 13530, y: 24727 }), 'https://t/16/13530/24727@2x.png?k=1');
  assert.deepEqual(roundView({ minX: 13, maxX: 419, minY: -21, maxY: 601 }), { minX: 0, maxX: 400, minY: -40, maxY: 600 });
});
