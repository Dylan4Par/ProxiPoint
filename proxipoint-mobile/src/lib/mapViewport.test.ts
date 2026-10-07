import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  opticalCenter,
  panToCenter,
  screenToWorld,
  shiftPanForOpticalCenter,
  viewportBounds,
  worldToScreen,
  zoomAboutFocal,
} from './mapViewport';

test('zoom keeps the world point under the focal anchor fixed', () => {
  const camera = { panX: 10, panY: -20, scale: 1 };
  const focal = { x: 100, y: 80 };
  const world = screenToWorld(focal, camera);
  const zoomed = zoomAboutFocal(camera, 2, focal);
  const screen = worldToScreen(world, zoomed);
  assert.ok(Math.abs(screen.x - focal.x) < 1e-6);
  assert.ok(Math.abs(screen.y - focal.y) < 1e-6);
  assert.equal(zoomed.scale, 2);
});

test('zoom clamps at the max scale without leaving the focal point', () => {
  const camera = { panX: 0, panY: 0, scale: 2 };
  const focal = { x: 40, y: 50 };
  const world = screenToWorld(focal, camera);
  const zoomed = zoomAboutFocal(camera, 9, focal);
  const screen = worldToScreen(world, zoomed);
  assert.equal(zoomed.scale, 2.6);
  assert.ok(Math.abs(screen.x - focal.x) < 1e-6);
  assert.ok(Math.abs(screen.y - focal.y) < 1e-6);
});

test('panToCenter places a world point on the optical center', () => {
  const camera = panToCenter({ x: 480, y: 480 }, { x: 200, y: 300 }, 1.5);
  const screen = worldToScreen({ x: 480, y: 480 }, camera);
  assert.ok(Math.abs(screen.x - 200) < 1e-6);
  assert.ok(Math.abs(screen.y - 300) < 1e-6);
});

test('optical center sits in the opening above the drawer and dock', () => {
  const center = opticalCenter({
    canvasWidth: 400,
    canvasHeight: 800,
    headerHeight: 100,
    drawerHeight: 215,
    navHeight: 72,
  });
  assert.equal(center.x, 200);
  assert.equal(center.y, 100 + (800 - 100 - 215 - 72) / 2);
});

test('shifting pan with the optical center keeps the same world point in frame', () => {
  const previous = { x: 200, y: 300 };
  const next = { x: 200, y: 250 };
  const camera = shiftPanForOpticalCenter({ panX: 10, panY: 40, scale: 1 }, previous, next);
  const world = screenToWorld(previous, { panX: 10, panY: 40, scale: 1 });
  const screen = worldToScreen(world, camera);
  assert.equal(screen.x, next.x);
  assert.equal(screen.y, next.y);
});

test('viewport bounds invert the camera into world space', () => {
  const bounds = viewportBounds({ panX: -100, panY: -50, scale: 2 }, 200, 100, 0);
  assert.equal(bounds.minX, 50);
  assert.equal(bounds.minY, 25);
  assert.equal(bounds.maxX, 150);
  assert.equal(bounds.maxY, 75);
});
