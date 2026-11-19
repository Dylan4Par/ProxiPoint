import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampZoom, doubleTapZoom, MAX_SCALE, pinchZoom } from './photoZoom';

const VIEW = { width: 400, height: 800 };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('at 1x the photo stays centered; zoomed in it can pan only to its edges', () => {
  assert.deepEqual(clampZoom({ scale: 1, x: 50, y: -30 }, VIEW), { scale: 1, x: 0, y: 0 });
  assert.deepEqual(clampZoom({ scale: 2, x: 500, y: -900 }, VIEW), { scale: 2, x: 200, y: -400 });
  assert.equal(clampZoom({ scale: 9, x: 0, y: 0 }, VIEW).scale, MAX_SCALE);
  assert.equal(clampZoom({ scale: 0.2, x: 0, y: 0 }, VIEW).scale, 1);
});

test('a pinch keeps the spot under the fingers under them', () => {
  const start = { scale: 1, x: 0, y: 0 };
  const fingers = { x: 100, y: -50 };
  const z = pinchZoom(start, fingers, fingers, 2, VIEW);
  assert.equal(z.scale, 2);
  // Photo point (100, -50) at 2x lands at 200 - 100 = 100 → still under the fingers.
  assert.ok(near(100 / 1 * z.scale + z.x, 100) && near(-50 * z.scale + z.y, -50));
  // Fingers moving while pinching pans along with them.
  const moved = pinchZoom(start, fingers, { x: 80, y: -40 }, 2, VIEW);
  assert.ok(near(moved.x, z.x - 20) && near(moved.y, z.y + 10));
});

test('double tap zooms in on the spot, and a second one zooms back out', () => {
  const zoomed = doubleTapZoom({ scale: 1, x: 0, y: 0 }, { x: 60, y: 120 }, VIEW);
  assert.equal(zoomed.scale, 2.5);
  // The tapped spot moves to the middle of the viewer.
  assert.ok(near(60 * 2.5 + zoomed.x, 0) && near(120 * 2.5 + zoomed.y, 0));
  assert.deepEqual(doubleTapZoom(zoomed, { x: 0, y: 0 }, VIEW), { scale: 1, x: 0, y: 0 });
});
