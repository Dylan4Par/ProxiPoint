import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PREFS, activePrefsCount, overlapsTimesOfDay, prefsAllow, type DiscoverPrefs, type PrefsNode } from './discoverPrefs';

// Local times, so the tests pass in any time zone.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();
const p = (over: Partial<DiscoverPrefs>): DiscoverPrefs => ({ ...DEFAULT_PREFS, ...over });

test('no filters: everything passes', () => {
  assert.equal(prefsAllow({}, DEFAULT_PREFS, []), true);
  assert.equal(activePrefsCount(DEFAULT_PREFS), 0);
});

test('only my followed tags', () => {
  const node: PrefsNode = { tags: ['#LiveMusic'] };
  assert.equal(prefsAllow(node, p({ followedOnly: true }), ['livemusic']), true);
  assert.equal(prefsAllow(node, p({ followedOnly: true }), ['#Comedy']), false);
  assert.equal(prefsAllow({}, p({ followedOnly: true }), ['#Comedy']), false);
});

test('price: free and under $20 only match Points that list a price', () => {
  const free: PrefsNode = { facts: { free: true } };
  const ten: PrefsNode = { facts: { priceMin: 10 } };
  const thirty: PrefsNode = { facts: { priceMin: 30 } };
  const unknown: PrefsNode = { facts: null };
  assert.deepEqual([free, ten, thirty, unknown].map((n) => prefsAllow(n, p({ price: 'free' }), [])), [true, false, false, false]);
  assert.deepEqual([free, ten, thirty, unknown].map((n) => prefsAllow(n, p({ price: 'under20' }), [])), [true, true, false, false]);
});

test('time of day', () => {
  const brunch = { start: at(14, 10), end: at(14, 13) }; // overlaps morning and afternoon
  const show = { start: at(14, 20), end: at(14, 23) };
  const lateNight = { start: at(15, 1), end: at(15, 3) }; // after midnight: evening / night
  assert.equal(overlapsTimesOfDay(brunch.start, brunch.end, ['morning']), true);
  assert.equal(overlapsTimesOfDay(brunch.start, brunch.end, ['afternoon']), true);
  assert.equal(overlapsTimesOfDay(brunch.start, brunch.end, ['evening']), false);
  assert.equal(overlapsTimesOfDay(show.start, show.end, ['evening']), true);
  assert.equal(overlapsTimesOfDay(show.start, show.end, ['morning', 'afternoon']), false);
  assert.equal(overlapsTimesOfDay(lateNight.start, lateNight.end, ['evening']), true);
  assert.equal(overlapsTimesOfDay(lateNight.start, lateNight.end, ['morning']), false);
  assert.equal(overlapsTimesOfDay(undefined, undefined, ['morning']), true, 'no time: not filtered out');
});

test('age & access', () => {
  const bar: PrefsNode = { facts: { minAge: 21 } };
  const family: PrefsNode = { facts: { allAges: true } };
  const kidsTag: PrefsNode = { tags: ['#FamilyFriendly'] };
  const plain: PrefsNode = {};
  assert.deepEqual([bar, family, kidsTag, plain].map((n) => prefsAllow(n, p({ over21: true }), [])), [true, false, false, false]);
  assert.deepEqual([bar, family, kidsTag, plain].map((n) => prefsAllow(n, p({ allAges: true }), [])), [false, true, true, false]);
  assert.deepEqual([bar, family, kidsTag, plain].map((n) => prefsAllow(n, p({ over21: true, allAges: true }), [])), [true, true, true, false]);
  assert.equal(activePrefsCount(p({ over21: true, allAges: true, price: 'free', times: ['morning'], followedOnly: true })), 4);
});
