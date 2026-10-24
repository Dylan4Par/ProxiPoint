import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canCommentIn,
  canPostIn,
  canViewChannel,
  membershipAction,
  uniqueHandle,
  validateNewChannel,
} from './channelAccess';
import type { Channel } from './channels';

const channel = (extra: Partial<Channel> = {}): Channel => ({
  id: 'x',
  name: 'X',
  handle: 'c/x',
  description: '',
  tags: [],
  memberCount: 1,
  joined: false,
  ...extra,
});

test('public: anyone can view, post and comment (joined or not)', () => {
  const c = channel();
  assert.deepEqual([canViewChannel(c), canPostIn(c), canCommentIn(c)], [true, true, true]);
  assert.equal(membershipAction(c), 'join');
});

test('restricted: anyone views and comments; posting needs approval', () => {
  const c = channel({ access: 'restricted', joined: true });
  assert.deepEqual([canViewChannel(c), canPostIn(c), canCommentIn(c)], [true, false, true]);
  assert.equal(canPostIn({ ...c, approved: true }), true);
  // Joining a restricted channel is open; approval is a separate request.
  assert.equal(membershipAction({ ...c, joined: false }), 'join');
});

test('private: nothing until approved; joining is a request', () => {
  const c = channel({ access: 'private' });
  assert.deepEqual([canViewChannel(c), canPostIn(c), canCommentIn(c)], [false, false, false]);
  assert.equal(membershipAction(c), 'request');
  assert.equal(membershipAction({ ...c, requested: true }), 'requested');
  const member = { ...c, joined: true, approved: true };
  assert.deepEqual([canViewChannel(member), canPostIn(member), canCommentIn(member)], [true, true, true]);
  assert.equal(membershipAction(member), 'leave');
});

test('the moderator is always approved and never "leaves" by tapping Join', () => {
  const c = channel({ access: 'private', moderator: true, joined: true });
  assert.deepEqual([canViewChannel(c), canPostIn(c)], [true, true]);
  assert.equal(membershipAction(c), 'moderator');
});

test('unknown channels (a post whose channel never loaded) are not hidden', () => {
  assert.equal(canViewChannel(null), true);
});

test('handles are unique', () => {
  assert.equal(uniqueHandle('Vinyl Swap!', []), 'c/vinylswap');
  assert.equal(uniqueHandle('Vinyl Swap', ['c/vinylswap', 'c/vinylswap2']), 'c/vinylswap3');
  assert.equal(uniqueHandle('!!!', []), 'c/channel');
});

test('new channel checks', () => {
  const ok = { name: 'Vinyl Swap', description: '', tags: ['#Vinyl'], access: 'public' as const };
  assert.deepEqual(validateNewChannel(ok, []), {});
  assert.ok(validateNewChannel({ ...ok, name: 'ab' }, []).name);
  assert.ok(validateNewChannel({ ...ok, name: '%%%%' }, []).name);
  assert.ok(validateNewChannel(ok, [{ name: 'vinyl swap' }]).name);
  assert.ok(validateNewChannel({ ...ok, tags: ['#a', '#b', '#c', '#d', '#e', '#f'] }, []).tags);
  assert.ok(validateNewChannel({ ...ok, description: 'x'.repeat(201) }, []).description);
});
