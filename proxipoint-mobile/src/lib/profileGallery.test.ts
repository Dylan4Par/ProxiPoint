import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyEmojiReaction, localGallery } from './profileGallery';

test('a host photo can only be reacted to with an emoji', () => {
  const gallery = localGallery('Ranger-F0A5ACCF');
  const photo = gallery.photos[0];
  assert.equal(photo.imageUri.startsWith('data:image/'), true);

  const added = applyEmojiReaction(photo.reactions, 'ranger', '🔥');
  assert.equal(added.error, '');
  assert.equal(added.reactions.some((reaction) => reaction.actor === 'ranger' && reaction.emoji === '🔥'), true);

  const removed = applyEmojiReaction(added.reactions, 'ranger', '🔥');
  assert.equal(removed.reactions.some((reaction) => reaction.actor === 'ranger'), false);

  const text = applyEmojiReaction(photo.reactions, 'ranger', 'great set');
  assert.equal(text.error.length > 0, true);
  assert.equal(text.reactions, photo.reactions);
});
