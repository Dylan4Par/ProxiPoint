import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placePhoto } from './photoFit';

const covers = (p: { left: number; top: number; width: number; height: number }, box: { width: number; height: number }) =>
  p.left <= 1e-9 && p.top <= 1e-9 && p.left + p.width >= box.width - 1e-9 && p.top + p.height >= box.height - 1e-9;

test('the photo middle sits at the focus point, and the box is always filled', () => {
  const box = { width: 100, height: 110 };
  for (const photo of [
    { width: 1000, height: 1000 }, // square poster
    { width: 1600, height: 900 }, // wide
    { width: 600, height: 1200 }, // tall
  ]) {
    const p = placePhoto(box, photo, 0.35);
    assert.ok(p);
    assert.ok(Math.abs(p.left + p.width / 2 - 35) < 1e-9, 'middle at 35% of the box');
    assert.ok(covers(p, box), `no gaps for ${photo.width}x${photo.height}`);
    assert.ok(Math.abs(p.width / p.height - photo.width / photo.height) < 1e-9, 'not stretched');
  }
});

test('zooms in only as much as needed', () => {
  const box = { width: 100, height: 110 };
  // Centered: same as cover.
  assert.equal(placePhoto(box, { width: 1000, height: 1000 }, 0.5)?.width, 110);
  // Square poster centered at 35%: half its width must reach the right edge (65 points).
  assert.equal(placePhoto(box, { width: 1000, height: 1000 }, 0.35)?.width, 130);
  // A wide photo already reaches: no extra zoom.
  assert.ok(Math.abs((placePhoto(box, { width: 2000, height: 1000 }, 0.35)?.width ?? 0) - 220) < 1e-9);
});

test('nothing to place before sizes are known', () => {
  assert.equal(placePhoto({ width: 0, height: 110 }, { width: 10, height: 10 }, 0.35), null);
  assert.equal(placePhoto({ width: 100, height: 110 }, { width: 0, height: 0 }, 0.35), null);
});
