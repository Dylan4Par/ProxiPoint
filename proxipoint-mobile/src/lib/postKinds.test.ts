import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEADS_UP_MAX_HOURS,
  answerStillHappening,
  asksStillHappening,
  defaultPinHours,
  pinChoices,
  searchPosts,
} from './postKinds';
import type { ChannelPost } from './channels';

const NOW = new Date('2026-10-18T18:00:00Z').getTime();
const iso = (hoursFromNow: number) => new Date(NOW + hoursFromNow * 3600000).toISOString();
const place = { latitude: 40.06, longitude: -105.04, label: 'Meadow Park Courts' };

const post = (id: string, extra: Partial<ChannelPost> = {}): ChannelPost => ({
  id,
  channelId: 'c',
  author: '@a',
  body: id,
  createdAt: iso(-1),
  upvotes: 1,
  voted: false,
  ...extra,
});

test('each kind has its own pin lengths and default', () => {
  assert.equal(defaultPinHours('heads_up'), 2);
  assert.equal(defaultPinHours('tip'), 24);
  assert.equal(defaultPinHours(undefined), 6); // chat
  assert.deepEqual(pinChoices('heads_up'), [1, 2, 6]);
  assert.deepEqual(pinChoices('question'), [6, 24, 72]);
});

test('"still happening?" is asked only on a heads-up that is still on the map', () => {
  assert.equal(asksStillHappening(post('a', { kind: 'heads_up', place, pinnedUntil: iso(1) }), NOW), true);
  assert.equal(asksStillHappening(post('b', { kind: 'heads_up', place, pinnedUntil: iso(-1) }), NOW), false);
  assert.equal(asksStillHappening(post('c', { kind: 'tip', place, pinnedUntil: iso(1) }), NOW), false);
});

test('yes keeps it up at least another hour, never past the cap; over takes it down', () => {
  const base = post('a', { kind: 'heads_up', place, pinnedUntil: iso(0.25) });
  const yes = answerStillHappening(base, true, NOW);
  assert.equal(yes.pinnedUntil, iso(1));
  assert.equal(yes.confirmations, 1);
  // Already up for longer: unchanged.
  assert.equal(answerStillHappening({ ...base, pinnedUntil: iso(3) }, true, NOW).pinnedUntil, iso(3));
  // Posted 11.5h ago: capped at 12h after posting.
  const late = answerStillHappening({ ...base, createdAt: iso(-11.5) }, true, NOW);
  assert.equal(late.pinnedUntil, iso(HEADS_UP_MAX_HOURS - 11.5));
  const over = answerStillHappening(base, false, NOW);
  assert.equal(over.pinnedUntil, iso(0));
  assert.equal(over.endedReports, 1);
});

test('post search: every word, in text, place or kind; tips and questions first', () => {
  const posts = [
    post('lights', { body: 'Do the courts have lights?', kind: 'question', place, upvotes: 5 }),
    post('resurfaced', { body: 'Courts resurfaced this week', kind: 'tip', place, upvotes: 19 }),
    post('chatter', { body: 'Great night at the courts', upvotes: 50 }),
    post('far', { body: 'Courts far away', kind: 'tip', place: { ...place, latitude: 41 }, upvotes: 99 }),
  ];
  assert.deepEqual(searchPosts(posts, 'courts').map((p) => p.id), ['far', 'resurfaced', 'lights', 'chatter']);
  assert.deepEqual(
    searchPosts(posts, 'courts', { center: place, rangeMeters: 5000 }).map((p) => p.id),
    ['resurfaced', 'lights', 'chatter'],
  );
  assert.deepEqual(searchPosts(posts, 'meadow lights').map((p) => p.id), ['lights']);
  assert.deepEqual(searchPosts(posts, 'question').map((p) => p.id), ['lights']);
  assert.deepEqual(searchPosts(posts, 'c/courts'), []);
});
