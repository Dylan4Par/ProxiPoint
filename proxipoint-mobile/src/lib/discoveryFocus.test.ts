import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CARD_LIST_MARGIN_METERS,
  DISCOVERY_PIXELS_PER_METER,
  DISCOVERY_WORLD_OFFSET,
  cardListBounds,
  focusOffsetForPoint,
  pointInBounds,
  visibleWorldBounds,
} from './discoveryFocus';

test('a selected card point lands on the map center', () => {
  const point = { x: 180, y: 220 };
  const viewport = { width: 390, height: 420 };
  const offset = focusOffsetForPoint(point.x, point.y, viewport.width, viewport.height);
  assert.ok(offset);

  const screenX = -DISCOVERY_WORLD_OFFSET + offset.x + point.x;
  const screenY = -DISCOVERY_WORLD_OFFSET + offset.y + point.y;
  assert.equal(screenX, viewport.width / 2);
  assert.equal(screenY, viewport.height / 2);
});

test('the operator reticle uses the same centering math', () => {
  const offset = focusOffsetForPoint(480, 480, 400, 300);
  assert.deepEqual(offset, { x: 200 - 280, y: 150 - 280 });
});

test('cards stay listed 300 meters beyond the screen', () => {
  const screen = visibleWorldBounds(10, -20, 400, 300);
  assert.deepEqual(screen, {
    minX: DISCOVERY_WORLD_OFFSET - 10,
    maxX: DISCOVERY_WORLD_OFFSET - 10 + 400,
    minY: DISCOVERY_WORLD_OFFSET - -20,
    maxY: DISCOVERY_WORLD_OFFSET - -20 + 300,
  });

  const listed = cardListBounds(screen);
  const pad = CARD_LIST_MARGIN_METERS * DISCOVERY_PIXELS_PER_METER;
  assert.equal(pad, 135);
  assert.equal(pointInBounds(screen.minX - pad, screen.maxY + pad, listed), true);
  assert.equal(pointInBounds(screen.minX - pad - 1, screen.minY, listed), false);
  assert.equal(pointInBounds(screen.maxX + pad + 1, screen.minY, listed), false);
});

test('a card without a map point does not move the camera', () => {
  assert.equal(focusOffsetForPoint(undefined, 10, 400, 300), null);
  assert.equal(focusOffsetForPoint(Number.NaN, 10, 400, 300), null);
  assert.equal(focusOffsetForPoint(10, 10, 0, 300), null);
});
