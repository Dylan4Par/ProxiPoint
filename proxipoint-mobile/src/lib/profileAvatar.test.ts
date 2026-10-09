import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeAvatarPayload, writeStoredAvatar, readStoredAvatar } from './profileAvatar';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('a profile picture must be a jpeg, png, or gif', () => {
  const saved = decodeAvatarPayload('image/png', PNG);
  assert.equal(saved.error, '');
  assert.equal(saved.dataUri.startsWith('data:image/png;base64,'), true);

  assert.equal(decodeAvatarPayload('text/plain', PNG).error.length > 0, true);
  assert.equal(decodeAvatarPayload('image/png', 'aaaa').error.length > 0, true);
  assert.equal(decodeAvatarPayload('image/jpeg', `${'A'.repeat(3_000_000)}`).error, 'That picture is too large.');
});

test('the uploaded picture is kept for the same operator', () => {
  const storage = new Map<string, string>();
  const memory = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  };
  const uri = `data:image/png;base64,${PNG}`;
  writeStoredAvatar('Ranger-F0A5ACCF', uri, memory);
  assert.equal(readStoredAvatar('@ranger-f0a5accf', memory), uri);
  writeStoredAvatar('Ranger-F0A5ACCF', '', memory);
  assert.equal(readStoredAvatar('Ranger-F0A5ACCF', memory), '');
});
