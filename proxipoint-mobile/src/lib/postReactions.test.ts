import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  channelAllowsReplies,
  defaultRepliesOn,
  reactTo,
  repliesAllowed,
  sampleReactions,
  topEmojis,
  type Reactable,
} from './postReactions';

test('one reaction per person: add, swap, take back', () => {
  const post: Reactable = { upvotes: 3, reactions: { '🔥': 2, '❤️': 1 } };
  const added = reactTo(post, '🎉');
  assert.deepEqual([added.upvotes, added.reactions, added.myReaction], [4, { '🔥': 2, '❤️': 1, '🎉': 1 }, '🎉']);
  const swapped = reactTo(added, '🔥');
  assert.deepEqual([swapped.upvotes, swapped.reactions, swapped.myReaction], [4, { '🔥': 3, '❤️': 1 }, '🔥']);
  const removed = reactTo(swapped, '🔥');
  assert.deepEqual([removed.upvotes, removed.reactions, removed.myReaction], [3, { '🔥': 2, '❤️': 1 }, null]);
});

test('summary emojis: most used first', () => {
  assert.deepEqual(topEmojis({ '😂': 1, '🔥': 9, '❤️': 4, '🙌': 2 }), ['🔥', '❤️', '🙌']);
  assert.deepEqual(topEmojis(undefined), []);
});

test('sample reactions add up to the total and stay the same', () => {
  const counts = sampleReactions('p4', 88);
  assert.equal(Object.values(counts).reduce((a, b) => a + (b ?? 0), 0), 88);
  assert.deepEqual(sampleReactions('p4', 88), counts);
  assert.deepEqual(sampleReactions('x', 0), {});
});

test('replies: on by default for Questions and Chat, off for Heads-ups and Tips', () => {
  assert.deepEqual(['question', 'chat', 'heads_up', 'tip', undefined].map((k) => defaultRepliesOn(k as never)), [true, true, false, false, true]);
});

test('the channel setting wins over the poster', () => {
  assert.equal(repliesAllowed({ kind: 'tip', repliesOn: true }, 'on'), true);
  assert.equal(repliesAllowed({ kind: 'chat', repliesOn: false }, 'on'), false);
  assert.equal(repliesAllowed({ kind: 'chat' }, 'questions'), false);
  assert.equal(repliesAllowed({ kind: 'question' }, 'questions'), true);
  assert.equal(repliesAllowed({ kind: 'question', repliesOn: true }, 'off'), false);
  assert.equal(channelAllowsReplies('tip', undefined), true);
});
