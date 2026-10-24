import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_POST_FILTER,
  activePostFilterCount,
  isDefaultPostFilter,
  postMatchesMapFilter,
  toggleKind,
} from './mapFilters';
import { CENTER_WORLD, areaName, fromCanvasCoordinates, shouldOfferAreaSearch, visibleRadiusMeters } from './mapArea';
import { presetWindow } from './timeWindow';

const NOW = new Date(2026, 9, 18, 14, 30).getTime(); // Sunday 18 Oct 2026, 2:30 pm local
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const endOf = (day: number) => new Date(2026, 9, day, 23, 59, 59, 999).getTime();

test('time presets', () => {
  assert.deepEqual(presetWindow('next3h', NOW), { start: NOW, end: NOW + 3 * 3600000 });
  assert.deepEqual(presetWindow('tonight', NOW), { start: at(18, 17), end: at(19, 2) });
  assert.deepEqual(presetWindow('tonight', at(18, 21)), { start: at(18, 21), end: at(19, 2) });
  assert.deepEqual(presetWindow('tonight', at(19, 1)), { start: at(19, 1), end: at(19, 2) });
  assert.deepEqual(presetWindow('tomorrow', NOW), { start: at(19, 0), end: endOf(19) });
  assert.deepEqual(presetWindow('days3', NOW), { start: NOW, end: endOf(20) });
  assert.deepEqual(presetWindow('week', NOW), { start: NOW, end: endOf(24) });
});

test('this weekend: Friday 5 pm to Sunday night, from now once it has started', () => {
  // Wednesday 21 Oct → Fri 23, 5 pm to Sun 25.
  assert.deepEqual(presetWindow('weekend', at(21, 9)), { start: at(23, 17), end: endOf(25) });
  // Saturday 24 Oct, noon → now to Sun 25.
  assert.deepEqual(presetWindow('weekend', at(24, 12)), { start: at(24, 12), end: endOf(25) });
  // Sunday (today) → now to tonight.
  assert.deepEqual(presetWindow('weekend', NOW), { start: NOW, end: endOf(18) });
});

test('post filter: by kind and by age', () => {
  const recent = { kind: 'heads_up' as const, createdAt: new Date(NOW - 30 * 60000).toISOString() };
  const older = { kind: 'tip' as const, createdAt: new Date(NOW - 5 * 3600000).toISOString() };
  const plain = { createdAt: new Date(NOW).toISOString() }; // no kind = chat
  assert.equal(postMatchesMapFilter(older, DEFAULT_POST_FILTER, NOW), true);
  assert.equal(postMatchesMapFilter(older, { ...DEFAULT_POST_FILTER, maxAgeHours: 1 }, NOW), false);
  assert.equal(postMatchesMapFilter(recent, { ...DEFAULT_POST_FILTER, maxAgeHours: 1 }, NOW), true);
  const headsUpOnly = { kinds: ['heads_up' as const], maxAgeHours: null };
  assert.equal(postMatchesMapFilter(recent, headsUpOnly, NOW), true);
  assert.equal(postMatchesMapFilter(plain, headsUpOnly, NOW), false);
  assert.equal(isDefaultPostFilter(DEFAULT_POST_FILTER), true);
  const noTips = toggleKind(DEFAULT_POST_FILTER, 'tip');
  assert.deepEqual(noTips.kinds, ['heads_up', 'question', 'chat']);
  assert.deepEqual(toggleKind(noTips, 'tip').kinds, DEFAULT_POST_FILTER.kinds);
  assert.equal(activePostFilterCount({ ...noTips, maxAgeHours: 6 }), 2);
});

test('map area: world point back to lat/lon', () => {
  const center = { latitude: 40.05, longitude: -105.05 };
  assert.deepEqual(fromCanvasCoordinates(CENTER_WORLD, CENTER_WORLD, center.latitude, center.longitude), center);
  // 450 world units east = 1000 m east.
  const east = fromCanvasCoordinates(CENTER_WORLD + 450, CENTER_WORLD, center.latitude, center.longitude);
  assert.equal(east.latitude, center.latitude);
  assert.ok(Math.abs(east.longitude - (center.longitude + 1000 / (6371000 * Math.cos(center.latitude * Math.PI / 180)) / (Math.PI / 180))) < 1e-9);
});

test('map area: offer a search once you have moved or zoomed out far enough', () => {
  const screen = 400; // world units across (about 890 m at zoom 1)
  assert.equal(shouldOfferAreaSearch({ x: CENTER_WORLD + 50, y: CENTER_WORLD }, screen, 1500), false); // ~110 m
  assert.equal(shouldOfferAreaSearch({ x: CENTER_WORLD + 200, y: CENTER_WORLD }, screen, 1500), true); // ~440 m
  // Zoomed far out (screen ~6.7 km across) over the same spot.
  assert.equal(shouldOfferAreaSearch({ x: CENTER_WORLD, y: CENTER_WORLD }, 3000, 1500), true);
  assert.equal(visibleRadiusMeters(450, 0), 500);
});

test('map area name: closest city within 15 km', () => {
  const cities = [
    { name: 'Erie', latitude: 40.0503, longitude: -105.05 },
    { name: 'Boulder', latitude: 40.015, longitude: -105.2705 },
  ];
  assert.equal(areaName({ latitude: 40.06, longitude: -105.06 }, cities), 'Erie');
  assert.equal(areaName({ latitude: 41, longitude: -106 }, cities), 'Map area');
});
