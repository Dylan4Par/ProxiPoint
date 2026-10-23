import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAP_TOUR, centerSpot, maskPath, padRect, placeCard, unionRect, visibleArea } from './tour';

const screen = { width: 400, height: 800 };

test('the tour runs map, filters, channels, profile, create', () => {
  assert.deepEqual(
    MAP_TOUR.map((s) => s.id),
    ['map', 'filters', 'channels', 'profile', 'create'],
  );
  assert.deepEqual(
    MAP_TOUR.map((s) => s.label),
    ['MAP RADAR', 'DISCOVER & TAGS', 'COMMUNITY CHANNELS', 'YOUR ACTIVITY', 'HOSTING & DROPS'],
  );
  assert.equal(MAP_TOUR[MAP_TOUR.length - 1].cta, 'Start Exploring');
  assert.ok(MAP_TOUR.every((s) => s.targets.length > 0 && s.body.length > 40));
});

test('the map spotlight is a circle centered on the map above the cards', () => {
  const map = { x: 0, y: 100, width: 400, height: 700 };
  const cards = { x: 0, y: 500, width: 400, height: 300 };
  const spot = centerSpot(map, cards, 170);
  assert.deepEqual(spot, { x: 115, y: 215, width: 170, height: 170, radius: 85 });
  // A short visible map shrinks the circle to fit.
  const tight = centerSpot(map, { ...cards, y: 220 }, 170);
  assert.equal(tight.width, 96);
  assert.equal(tight.y, 112);
  // Cards not over the map: the whole area counts.
  assert.equal(centerSpot(map, null, 170).y, 100 + (700 - 170) / 2);
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

test('step 1 spotlights the whole map above the event cards', () => {
  assert.equal(MAP_TOUR[0].centerSpot?.size, undefined);
  const map = { x: 0, y: 100, width: 400, height: 700 };
  assert.deepEqual(visibleArea(map, { x: 0, y: 500, width: 400, height: 300 }), { x: 0, y: 100, width: 400, height: 400 });
  assert.deepEqual(visibleArea(map, null), map);
});
