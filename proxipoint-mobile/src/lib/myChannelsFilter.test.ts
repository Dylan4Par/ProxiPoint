import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inMyChannels } from './discoverFilters';

const channels = [
  { id: 'music', joined: true, tags: ['#LiveMusic', '#Jazz'] },
  { id: 'chess', joined: false, tags: ['#Chess'] },
] as never;

test('My channels: listed in a joined channel, or sharing its #tag', () => {
  assert.equal(inMyChannels({ channelId: 'music', tags: [] }, channels), true);
  assert.equal(inMyChannels({ tag: '#jazz' }, channels), true);
  assert.equal(inMyChannels({ tags: ['Chess'], channelId: 'chess' }, channels), false);
  assert.equal(inMyChannels({ tags: ['#Hiking'] }, channels), false);
  assert.equal(inMyChannels({ tags: ['#LiveMusic'] }, [] as never), false);
});
