import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONTRIBUTION_HEADROOM,
  computeSignal,
  contributionsOf,
  nextBarIn,
  recapCheers,
  signalBars,
  strongestSignals,
} from './signalScore';
import type { ChannelPost, PostComment } from './channels';
import type { PointRecap } from './pointRecap';

const NOW = new Date('2026-10-18T18:00:00Z').getTime();
const ago = (minutes: number) => new Date(NOW - minutes * 60000).toISOString();
const DAY = 24 * 60;

const post = (id: string, author: string, upvotes: number, extra: Partial<ChannelPost> = {}): ChannelPost => ({
  id,
  channelId: 'music',
  author,
  body: `post ${id}`,
  createdAt: ago(60),
  upvotes,
  voted: false,
  ...extra,
});

const comment = (id: string, postId: string, author: string, upvotes: number, extra: Partial<PostComment> = {}): PostComment => ({
  id,
  postId,
  parentId: null,
  author,
  body: `comment ${id}`,
  createdAt: ago(30),
  upvotes,
  voted: false,
  ...extra,
});

const recap = (id: string, cheers: number, photoCheers = 0): PointRecap => ({
  id,
  pointId: `pt-${id}`,
  pointTitle: 'Jam',
  pointStartsAt: ago(DAY),
  where: 'Somewhere',
  text: '',
  reactions: { '🔥': { count: cheers, mine: false } },
  photos: photoCheers ? [{ id: `${id}-ph`, uri: 'x', reactions: { '❤️': { count: photoCheers, mine: false } } }] : [],
  createdAt: ago(DAY - 60),
});

test('earned counts other people’s upvotes and recap cheers, never your own starting vote', () => {
  const signal = computeSignal('@sam', {
    posts: [post('a', '@sam', 11), post('b', '@sam', 1), post('c', '@kim', 50)],
    comments: [comment('x', 'c', 'sam', 4)], // handle matching ignores the @ and case
    recaps: [recap('r1', 5, 2)],
  });
  assert.equal(signal.postUpvotes, 10);
  assert.equal(signal.commentUpvotes, 3);
  assert.equal(signal.cheers, 7);
  assert.equal(signal.earned, 20);
  // 2 posts ×2 + 1 comment ×1 + 1 recap ×2
  assert.equal(signal.contributed, 7);
  assert.equal(signal.score, 27);
  assert.equal(signal.bars, 2);
  assert.equal(signal.level, 'Fair');
});

test('contribution can only run a little ahead of what you’ve earned', () => {
  // Lots of posts nobody upvoted, plus 100 Points hosted with no recaps.
  const spam = Array.from({ length: 40 }, (_, n) => post(`s${n}`, '@spammy', 1));
  const signal = computeSignal('@spammy', { posts: spam, comments: [], pointsHosted: 100 });
  assert.equal(signal.earned, 0);
  assert.equal(signal.contributed, CONTRIBUTION_HEADROOM);
  assert.equal(signal.bars, 2);
});

test('a brand-new account has no signal', () => {
  const signal = computeSignal('@new', { posts: [], comments: [] });
  assert.deepEqual([signal.score, signal.bars, signal.level], [0, 0, 'No signal']);
});

test('bars and the next bar', () => {
  assert.deepEqual([0, 1, 24, 25, 99, 100, 250, 599, 600, 5000].map(signalBars), [0, 1, 1, 2, 2, 3, 4, 4, 5, 5]);
  assert.equal(nextBarIn(0), 1);
  assert.equal(nextBarIn(30), 70);
  assert.equal(nextBarIn(600), null);
  assert.equal(recapCheers(recap('r', 3, 4)), 7);
});

test('contributions: posts and comments, newest first, with the post’s channel', () => {
  const posts = [post('a', '@sam', 3, { createdAt: ago(300) }), post('b', '@kim', 9, { channelId: 'food' })];
  const comments = [
    comment('x', 'b', '@sam', 2, { createdAt: ago(10) }),
    comment('y', 'gone', '@sam', 2), // its post isn't visible
  ];
  const items = contributionsOf('@sam', posts, comments);
  assert.deepEqual(
    items.map((item) => [item.kind, item.id, item.channelId]),
    [
      ['comment', 'x', 'food'],
      ['post', 'a', 'music'],
    ],
  );
});

test('strongest signal in a channel: last 30 days only, best first', () => {
  const posts = [
    post('p1', '@rusty', 42),
    post('p2', '@erie', 14),
    post('p3', '@old', 500, { createdAt: ago(40 * DAY) }), // too old
    post('p4', '@foodie', 90, { channelId: 'food' }), // other channel
    post('p5', '@quiet', 1), // nobody upvoted
  ];
  const comments = [comment('c1', 'p1', '@rusty', 9), comment('c2', 'p1', '@jazzcat', 6)];
  const ranks = strongestSignals(posts, comments, { channelId: 'music', now: NOW });
  assert.deepEqual(
    ranks.map((rank) => rank.handle),
    ['@rusty', '@erie', '@jazzcat'],
  );
  // 41 + 8 upvotes earned, 2 + 1 contributed
  assert.deepEqual([ranks[0].score, ranks[0].upvotes, ranks[0].posts, ranks[0].comments], [52, 49, 1, 1]);
  // Everywhere: the food post wins.
  assert.equal(strongestSignals(posts, comments, { now: NOW, limit: 1 })[0].handle, '@foodie');
  // Leaving someone out (e.g. a blocked user).
  assert.equal(strongestSignals(posts, comments, { channelId: 'music', now: NOW, exclude: (h) => h === '@rusty' })[0].handle, '@erie');
});
