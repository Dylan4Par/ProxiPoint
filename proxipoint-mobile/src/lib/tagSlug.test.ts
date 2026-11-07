import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  displayForSlug,
  finishSlug,
  isUsableCustomSlug,
  isValidSlug,
  localTagSuggestions,
  matchRange,
  normalizeTagInput,
  slugForTag,
  usageLabel,
} from './tagSlug';
import { HASHTAG_LIST } from './hashtagList';

test('typing becomes slug form', () => {
  assert.equal(normalizeTagInput('Live Music'), 'live-music');
  assert.equal(normalizeTagInput('#board_games'), 'board-games');
  assert.equal(normalizeTagInput('rock & roll!'), 'rock-roll');
  assert.equal(normalizeTagInput('live '), 'live-', 'trailing hyphen kept while typing');
  assert.equal(normalizeTagInput('--x--y'), 'x-y');
  assert.equal(normalizeTagInput('café'), 'caf');
  assert.equal(normalizeTagInput('a'.repeat(30)).length, 24);
  assert.equal(finishSlug('live '), 'live');
});

test('valid slugs: 3-24 characters, words joined by single hyphens', () => {
  assert.ok(isValidSlug('live-music'));
  assert.ok(isValidSlug('5k'.padEnd(3, 'x')));
  assert.ok(!isValidSlug('ab'));
  assert.ok(!isValidSlug('live--music'));
  assert.ok(!isValidSlug('-live'));
  assert.ok(!isValidSlug('Live'));
  assert.ok(!isValidSlug('a'.repeat(25)));
});

test('every listed tag has a slug id', () => {
  for (const entry of HASHTAG_LIST) assert.match(entry.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, entry.tag);
});

test('listed tags keep their labels; made-up ones get capitals', () => {
  assert.equal(displayForSlug('live-music'), '#LiveMusic');
  assert.equal(displayForSlug('livemusic'), '#LiveMusic');
  assert.equal(displayForSlug('acoustic-brunch'), '#AcousticBrunch');
  assert.equal(slugForTag('#LiveMusic'), 'live-music');
  assert.equal(slugForTag('#AcousticBrunch'), 'acoustic-brunch');
  assert.equal(slugForTag(displayForSlug('5k-fun-run')), '5k-fun-run');
});

test('hyphen-aware matching and highlight ranges', () => {
  assert.deepEqual(matchRange('live-music', 'music'), [5, 10]);
  assert.deepEqual(matchRange('music-bingo', 'music'), [0, 5]);
  assert.equal(matchRange('live-music', 'usic'), null);
  const slugs = localTagSuggestions('music').map((s) => s.slug);
  assert.ok(slugs.length > 1 && slugs.length <= 8);
  assert.ok(slugs.includes('live-music'));
  const firstHyphen = slugs.findIndex((s) => !s.startsWith('music'));
  assert.ok(slugs.slice(firstHyphen).every((s) => !s.startsWith('music')), 'prefix matches come first');
  assert.deepEqual(localTagSuggestions('m'), []);
  assert.ok(!localTagSuggestions('music', ['live-music']).some((s) => s.slug === 'live-music'));
});

test('made-up tags must be clean', () => {
  assert.ok(isUsableCustomSlug('acoustic-brunch'));
  assert.ok(!isUsableCustomSlug('ab'));
});

test('usage labels', () => {
  assert.equal(usageLabel(920), '920 uses');
  assert.equal(usageLabel(1), '1 use');
  assert.equal(usageLabel(1250), '1.3k uses');
  assert.equal(usageLabel(0), null);
  assert.equal(usageLabel(null), null);
});

test("a Point keeps listed tags and people's own clean ones", async () => {
  const { pointTags } = await import('./tagSlug');
  assert.deepEqual(pointTags(['#livemusic', '#AcousticBrunch', '#ab', 'LiveMusic', null]), ['#LiveMusic', '#AcousticBrunch']);
});
