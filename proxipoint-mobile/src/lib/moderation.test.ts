import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockUser, isAuthoredAllowed, reportContent, unblockUser } from './moderation';

test('posts and comments hide when reported or when their author is blocked', () => {
  const post = { id: 'mod-test-post', author: '@someone' };
  const other = { id: 'mod-test-other', author: '@Someone' };
  assert.equal(isAuthoredAllowed(post), true);

  reportContent({ targetType: 'post', targetId: post.id, ownerHandle: post.author, reason: 'spam', note: '' });
  assert.equal(isAuthoredAllowed(post), false, 'reported post is hidden');
  assert.equal(isAuthoredAllowed(other), true, 'reporting one post leaves the author’s others');

  blockUser('someone');
  assert.equal(isAuthoredAllowed(other), false, 'blocking hides everything by them (handle case ignored)');
  unblockUser('@someone');
  assert.equal(isAuthoredAllowed(other), true);
});
