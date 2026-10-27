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

test('Followed Tags keeps Points with one of your #tags (either it or My channels when both are on)', async () => {
  const { matchesDiscoverFilters } = await import('./discoverFilters');
  const node = (tags: string[]) => ({ id: 'n', tags, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString() });
  assert.equal(matchesDiscoverFilters(node(['#Art']), { followedTags: ['#art', '#Faith'] }), true);
  assert.equal(matchesDiscoverFilters(node(['#Hiking']), { followedTags: ['#Art'] }), false);
  assert.equal(matchesDiscoverFilters(node(['#Hiking']), { followedTags: null }), true);
});
