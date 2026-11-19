import test from 'node:test';
import assert from 'node:assert/strict';
import { FOR_YOU_LIMIT, suggestChannels, trendInfo } from './channelSuggest';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString();
const ch = (id: string, tags: string[], memberCount = 100, joined = false) => ({ id, handle: `c/${id}`, tags, memberCount, joined });

test('trending counts only this week\'s posts and likes', () => {
  const posts = [
    { channelId: 'a', createdAt: daysAgo(1), upvotes: 4 },
    { channelId: 'a', createdAt: daysAgo(10), upvotes: 50 },
    { channelId: 'b', createdAt: daysAgo(2), upvotes: 0 },
  ];
  assert.equal(trendInfo(ch('a', []), posts, NOW).postsThisWeek, 1);
  assert.equal(trendInfo(ch('c', []), posts, NOW).postsThisWeek, 0);
});

test('busier channels trend above bigger quiet ones', () => {
  const channels = [ch('big', [], 5000), ch('busy', [], 50)];
  const posts = [
    { channelId: 'busy', createdAt: daysAgo(1), upvotes: 3 },
    { channelId: 'busy', createdAt: daysAgo(2), upvotes: 1 },
  ];
  const { trending } = suggestChannels(channels, posts, [], NOW);
  assert.deepEqual(trending.map((s) => s.channel.id), ['busy', 'big']);
  assert.equal(trending[0].reason, '2 posts this week');
  assert.equal(trending[1].reason, 'Popular nearby');
});

test('For you: followed #tags first, then channels like the ones you joined', () => {
  const channels = [
    ch('mine', ['#LiveMusic'], 100, true),
    ch('hike', ['#Hiking']),
    ch('jazz', ['#Jazz', '#LiveMusic']),
    ch('tech', ['#TechMeetup']),
  ];
  const { forYou, trending } = suggestChannels(channels, [], ['hiking'], NOW);
  assert.deepEqual(forYou.map((s) => s.channel.id).sort(), ['hike', 'jazz']);
  assert.equal(forYou.find((s) => s.channel.id === 'hike')?.reason, 'Because you follow #Hiking');
  assert.equal(forYou.find((s) => s.channel.id === 'jazz')?.reason, 'Like c/mine');
  assert.deepEqual(trending.map((s) => s.channel.id), ['tech']);
});

test('every unjoined channel shows exactly once, For you is capped', () => {
  const channels = Array.from({ length: 6 }, (_, i) => ch(`c${i}`, ['#Yoga']));
  const { forYou, trending } = suggestChannels(channels, [], ['#Yoga'], NOW);
  assert.equal(forYou.length, FOR_YOU_LIMIT);
  assert.equal(forYou.length + trending.length, 6);
});
