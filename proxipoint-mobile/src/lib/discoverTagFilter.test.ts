import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_DISCOVER_TAGS,
  addDiscoverTag,
  clearDiscoverTags,
  getDiscoverTags,
  getTagMatchMode,
  matchesTagFilter,
  rankByTagMatches,
  removeDiscoverTag,
  setTagMatchMode,
  showEventsLabel,
  tagMatchCount,
} from './discoverTagFilter';

const gamingHappy = { id: 'a', tags: ['#Gaming', '#HappyHour'] };
const artWalk = { id: 'b', tag: '#ArtWalk' };
const all3 = { id: 'c', tags: ['#Gaming', '#HappyHour', '#ArtWalk'] };
const none = { id: 'd', tags: ['#Yoga'] };
const picked = ['#Gaming', '#HappyHour', '#ArtWalk'];

test('match any vs all', () => {
  assert.equal(tagMatchCount(all3, picked), 3);
  assert.deepEqual([gamingHappy, artWalk, all3, none].filter((n) => matchesTagFilter(n, picked, 'any')).map((n) => n.id), ['a', 'b', 'c']);
  assert.deepEqual([gamingHappy, artWalk, all3, none].filter((n) => matchesTagFilter(n, picked, 'all')).map((n) => n.id), ['c']);
  assert.ok(matchesTagFilter(none, [], 'all'), 'no tags: everything');
});

test('"any" ranks more matches first, keeping order otherwise', () => {
  assert.deepEqual(rankByTagMatches([artWalk, gamingHappy, all3], picked, 'any').map((n) => n.id), ['c', 'a', 'b']);
  assert.deepEqual(rankByTagMatches([artWalk, gamingHappy, all3], picked, 'all').map((n) => n.id), ['b', 'a', 'c']);
});

test('the shelf: add, limit, remove, clear', () => {
  clearDiscoverTags();
  for (const t of ['#Gaming', '#NewYearsEve', '#HappyHour', '#ArtWalk', '#Volunteer']) assert.ok(addDiscoverTag(t));
  assert.equal(getDiscoverTags().length, MAX_DISCOVER_TAGS);
  assert.equal(addDiscoverTag('#Pickleball'), false, 'full');
  assert.ok(addDiscoverTag('#gaming'), 'already there is fine');
  assert.equal(addDiscoverTag('#NotARealTagXyz'), false);
  removeDiscoverTag('#gaming');
  assert.equal(getDiscoverTags().length, 4);
  setTagMatchMode('all');
  clearDiscoverTags();
  assert.deepEqual(getDiscoverTags(), []);
  assert.equal(getTagMatchMode(), 'any');
});

test('Done button label', () => {
  assert.equal(showEventsLabel(18), 'Show 18 Events');
  assert.equal(showEventsLabel(1), 'Show 1 Event');
  assert.equal(showEventsLabel(0), 'No Events Found');
});
