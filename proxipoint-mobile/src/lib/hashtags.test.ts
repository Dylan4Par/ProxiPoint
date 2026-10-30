import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HASHTAG_CATEGORIES,
  HASHTAG_LIST,
  LEGACY_TAGS,
  bestHashtagFor,
  canonicalTag,
  canonicalizeTags,
  categoryOfTag,
  isListedTag,
  searchHashtags,
} from './hashtags';

test('the list: unique tags, each in a known category', () => {
  assert.ok(HASHTAG_LIST.length >= 395);
  const keys = new Set(HASHTAG_LIST.map((e) => e.tag.toLowerCase()));
  assert.equal(keys.size, HASHTAG_LIST.length);
  const categories = new Set(HASHTAG_CATEGORIES.map((c) => c.id));
  HASHTAG_LIST.forEach((e) => {
    assert.match(e.tag, /^#[A-Za-z0-9_]+$/);
    assert.ok(categories.has(e.category), e.tag);
  });
});

test('canonicalTag: any case, with or without #, and old spellings', () => {
  assert.equal(canonicalTag('#livemusic'), '#LiveMusic');
  assert.equal(canonicalTag('LiveMusic'), '#LiveMusic');
  assert.equal(canonicalTag('#TacoTuesday'), '#Tacos');
  assert.equal(canonicalTag('#MadeUpTag'), null);
  assert.equal(canonicalTag(''), null);
});

test('isListedTag is true only for tags on the list (not old spellings)', () => {
  assert.equal(isListedTag('#Jazz'), true);
  assert.equal(isListedTag('#TacoTuesday'), false);
});

test('canonicalizeTags maps, drops unknown ones and removes repeats, keeping order', () => {
  assert.deepEqual(canonicalizeTags(['#Jazz', '#Soul', '#nope', '#LiveMusic', 'jazz']), ['#Jazz', '#LiveMusic']);
  assert.deepEqual(canonicalizeTags(undefined), []);
});

test('categoryOfTag', () => {
  assert.equal(categoryOfTag('#Pickleball')?.label, 'Sports & Fitness');
  assert.equal(categoryOfTag('#Nope'), null);
});

test('search: name prefix first, then a word in the name, then descriptions', () => {
  assert.equal(searchHashtags('jaz')[0].tag, '#Jazz');
  assert.ok(searchHashtags('beer').some((e) => e.tag === '#CraftBeer'));
  assert.ok(searchHashtags('taco').some((e) => e.tag === '#Tacos'));
  assert.ok(searchHashtags('trivia').some((e) => e.tag === '#TriviaTournament'));
  assert.deepEqual(searchHashtags(''), []);
  assert.ok(!searchHashtags('jazz', { exclude: ['#Jazz'] }).some((e) => e.tag === '#Jazz'));
});

test('bestHashtagFor: exact match, else the top search result, else null', () => {
  assert.equal(bestHashtagFor('yoga'), '#Yoga');
  assert.equal(bestHashtagFor('hik'), '#Hiking');
  assert.equal(bestHashtagFor('zzzz'), null);
});

test('every old spelling points at a tag that is on the list', () => {
  Object.entries(LEGACY_TAGS).forEach(([old, tag]) => assert.ok(isListedTag(tag), `${old} -> ${tag}`));
});

test('the newer tags: holidays, milestones and their old spellings', () => {
  assert.equal(categoryOfTag('#Christmas')?.label, 'Holidays & Seasonal');
  assert.equal(categoryOfTag('#Wedding')?.label, 'Celebrations & Milestones');
  assert.equal(canonicalTag('#TriviaNight'), '#TriviaTournament');
  assert.equal(canonicalTag('#VinylNight'), '#VinylNight');
  assert.ok(searchHashtags('halloween').some((e) => e.tag === '#PumpkinPatch'), 'description search');
});
