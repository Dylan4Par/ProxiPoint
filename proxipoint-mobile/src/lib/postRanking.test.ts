import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildThreads,
  countComments,
  hotScore,
  isPinLive,
  pinTimeLeft,
  snapToBlock,
  sortPosts,
} from './postRanking';
import type { ChannelPost, PostComment } from './channels';

const NOW = new Date('2026-10-18T18:00:00Z').getTime();
const ago = (minutes: number) => new Date(NOW - minutes * 60000).toISOString();
const later = (minutes: number) => new Date(NOW + minutes * 60000).toISOString();
const CENTER = { latitude: 40.06, longitude: -105.04 };

const post = (id: string, minutesOld: number, upvotes: number, extra: Partial<ChannelPost> = {}): ChannelPost => ({
  id,
  channelId: 'ch',
  author: '@a',
  body: id,
  createdAt: ago(minutesOld),
  upvotes,
  voted: false,
  ...extra,
});

// ~1.1 km per 0.01° latitude
const nextDoor = { latitude: 40.0605, longitude: -105.04, label: 'Next door' };
const acrossTown = { latitude: 40.15, longitude: -105.04, label: 'Across town' };

const posts = [
  post('old-popular', 24 * 60, 200),
  post('fresh-small', 20, 6, { place: nextDoor, pinnedUntil: later(60) }),
  post('mid', 120, 40, { place: acrossTown, pinnedUntil: later(60) }),
  post('brand-new', 1, 1),
];

test('new and top sorts', () => {
  assert.deepEqual(sortPosts(posts, 'new', { now: NOW }).map((p) => p.id), ['brand-new', 'fresh-small', 'mid', 'old-popular']);
  assert.deepEqual(sortPosts(posts, 'top', { now: NOW }).map((p) => p.id), ['old-popular', 'mid', 'fresh-small', 'brand-new']);
});

test('hot lets a fresh, active post beat an old popular one', () => {
  const order = sortPosts(posts, 'hot', { now: NOW }).map((p) => p.id);
  assert.ok(order.indexOf('mid') < order.indexOf('old-popular'));
  assert.ok(hotScore(posts[1], 3, NOW) > hotScore(posts[1], 0, NOW), 'comments raise the score');
});

test('near puts the post next door ahead of a bigger one across town', () => {
  const order = sortPosts(posts, 'near', { now: NOW, center: CENTER }).map((p) => p.id);
  assert.equal(order[0], 'fresh-small');
  assert.ok(order.indexOf('fresh-small') < order.indexOf('mid'));
});

test('near without a location falls back to hot', () => {
  assert.deepEqual(
    sortPosts(posts, 'near', { now: NOW }).map((p) => p.id),
    sortPosts(posts, 'hot', { now: NOW }).map((p) => p.id),
  );
});

test('pins expire and report time left', () => {
  const live = post('x', 5, 1, { place: nextDoor, pinnedUntil: later(150) });
  const ended = post('y', 5, 1, { place: nextDoor, pinnedUntil: ago(1) });
  assert.equal(isPinLive(live, NOW), true);
  assert.equal(isPinLive(ended, NOW), false);
  assert.equal(isPinLive(post('z', 5, 1), NOW), false);
  assert.equal(pinTimeLeft(live, NOW), '3h left');
  assert.equal(pinTimeLeft(post('w', 5, 1, { place: nextDoor, pinnedUntil: later(40) }), NOW), '40m left');
});

test('snapToBlock rounds to about 100 m', () => {
  assert.deepEqual(snapToBlock({ latitude: 40.061708, longitude: -105.038292 }), { latitude: 40.062, longitude: -105.038 });
});

const comment = (id: string, parentId: string | null, minutesOld: number, upvotes: number, postId = 'p'): PostComment => ({
  id,
  postId,
  parentId,
  author: '@a',
  body: id,
  createdAt: ago(minutesOld),
  upvotes,
  voted: false,
});

test('buildThreads: best top-level first, replies in order, other posts ignored', () => {
  const list = [
    comment('a', null, 30, 2),
    comment('b', null, 20, 9),
    comment('a2', 'a', 10, 50),
    comment('a1', 'a', 25, 0),
    comment('other', null, 5, 99, 'q'),
  ];
  const threads = buildThreads(list, 'p');
  assert.deepEqual(threads.map((t) => t.comment.id), ['b', 'a']);
  assert.deepEqual(threads[1].replies.map((r) => r.id), ['a1', 'a2']);
  assert.deepEqual(countComments(list), { p: 4, q: 1 });
});
