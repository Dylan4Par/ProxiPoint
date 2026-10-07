import assert from 'node:assert/strict';
import { test } from 'node:test';
import { declutterPins, declutterStrength } from './pinDeclutter';
import { worldToScreen } from './mapViewport';

const downtown = [
  { id: 'downtown-1', x: 568, y: 325 },
  { id: 'downtown-2', x: 568, y: 325 },
  { id: 'downtown-3', x: 568, y: 325 },
];

function screenOf(id: string, scale: number) {
  const pin = declutterPins(downtown, scale).find((item) => item.id === id);
  if (!pin) throw new Error(`missing ${id}`);
  return worldToScreen(pin, { panX: 0, panY: 0, scale });
}

function minPairDistance(scale: number): number {
  const screens = downtown.map((pin) => screenOf(pin.id, scale));
  let min = Infinity;
  for (let i = 0; i < screens.length; i += 1) {
    for (let j = i + 1; j < screens.length; j += 1) {
      min = Math.min(min, Math.hypot(screens[i].x - screens[j].x, screens[i].y - screens[j].y));
    }
  }
  return min;
}

test('declutter is fully on at the default zoom and off once zoomed in', () => {
  assert.equal(declutterStrength(0.7), 1);
  assert.equal(declutterStrength(1), 1);
  assert.equal(declutterStrength(1.45), 0);
  assert.ok(declutterStrength(1.2) > 0 && declutterStrength(1.2) < 1);
});

test('identical downtown coordinates fan out when zoomed out and keep their centroid', () => {
  const placed = declutterPins(downtown, 1);
  assert.ok(minPairDistance(1) >= 18);
  const centroid = placed.reduce(
    (acc, pin) => ({ x: acc.x + pin.x / placed.length, y: acc.y + pin.y / placed.length }),
    { x: 0, y: 0 },
  );
  assert.ok(Math.abs(centroid.x - 568) < 1e-6);
  assert.ok(Math.abs(centroid.y - 325) < 1e-6);
  const anchors = new Set(placed.map((pin) => pin.labelAnchor));
  assert.equal(anchors.size, 3);
});

test('exact overlaps stay separable after zooming in', () => {
  assert.ok(minPairDistance(2) >= 12);
});

test('separated pins are left on their true coordinates', () => {
  const pins = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 400, y: 10 },
  ];
  const placed = declutterPins(pins, 1);
  assert.deepEqual(
    placed.find((pin) => pin.id === 'a'),
    { id: 'a', x: 0, y: 0, labelAnchor: 'top' },
  );
  assert.deepEqual(
    placed.find((pin) => pin.id === 'b'),
    { id: 'b', x: 400, y: 10, labelAnchor: 'top' },
  );
});

test('nearby pins stagger while zoomed out and separate naturally once zoomed in', () => {
  const pins = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 30, y: 0 },
  ];
  const zoomedOut = declutterPins(pins, 0.8);
  const moved = zoomedOut.some((pin) => pin.id === 'a' && (pin.x !== 0 || pin.y !== 0));
  assert.equal(moved, true);

  const zoomedIn = declutterPins(pins, 2);
  assert.deepEqual(
    zoomedIn.find((pin) => pin.id === 'a'),
    { id: 'a', x: 0, y: 0, labelAnchor: 'top' },
  );
  assert.deepEqual(
    zoomedIn.find((pin) => pin.id === 'b'),
    { id: 'b', x: 30, y: 0, labelAnchor: 'top' },
  );
});
