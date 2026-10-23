import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAP_TOUR, maskPath, padRect, placeCard, unionRect } from './tour';

const screen = { width: 400, height: 800 };

test('the tour runs create, tags, explore, profile', () => {
  assert.deepEqual(
    MAP_TOUR.map((s) => s.label),
    ['STEP 1', 'STEP 1.1', 'STEP 2', 'STEP 3'],
  );
  assert.equal(MAP_TOUR.filter((s) => s.needsCreateSheet).length, 1);
  assert.ok(MAP_TOUR.every((s) => s.targets.length > 0 && s.body.length > 40));
});

test('union and padding of spotlight rects', () => {
  const u = unionRect([
    { x: 10, y: 100, width: 380, height: 40 },
    { x: 0, y: 150, width: 400, height: 400 },
  ]);
  assert.deepEqual(u, { x: 0, y: 100, width: 400, height: 450 });
  assert.equal(unionRect([]), null);
  assert.deepEqual(padRect({ x: 2, y: 10, width: 50, height: 20 }, 6, screen), { x: 0, y: 4, width: 58, height: 32 });
});

test('card goes below, then above, then pinned to the bottom', () => {
  assert.deepEqual(placeCard({ x: 0, y: 50, width: 100, height: 40 }, 200, 800), { top: 104 });
  assert.deepEqual(placeCard({ x: 0, y: 720, width: 100, height: 60 }, 200, 800), { top: 506 });
  assert.deepEqual(placeCard({ x: 0, y: 60, width: 400, height: 700 }, 200, 800), { top: 584 });
  assert.deepEqual(placeCard(null, 200, 800), { top: 300 });
});

test('mask path has the screen plus one closed shape per hole', () => {
  const path = maskPath(screen, [
    { x: 10, y: 10, width: 100, height: 40 },
    { x: 0, y: 0, width: 0, height: 10 },
  ]);
  assert.equal((path.match(/Z/g) ?? []).length, 2);
  assert.ok(path.startsWith('M0 0H400V800H0Z'));
});
