import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  channelNodes,
  formatCount,
  formatDistance,
  groupByDay,
  recommendChannels,
  splitFeed,
  type FeedNode,
} from './discoverFeed';
import type { Channel } from './channels';

const NOW = new Date('2026-10-18T18:00:00').getTime();
const at = (minutes: number) => new Date(NOW + minutes * 60000).toISOString();

const nodes: FeedNode[] = [
  { id: 'live-far', status: 'LIVE NOW', distanceMeters: 900, tags: ['#LiveMusic'], startsAt: at(-30), endsAt: at(90) },
  { id: 'live-near', status: 'LIVE NOW', distanceMeters: 200, tags: ['#Jazz'], startsAt: at(-10), endsAt: at(60) },
  { id: 'soon', status: 'Starts in 1h', distanceMeters: 500, tags: ['#FoodTrucks'], startsAt: at(60), endsAt: at(180) },
  { id: 'tonight', status: 'Starts in 4h', distanceMeters: 100, tags: ['#Pickleball'], startsAt: at(240), endsAt: at(300) },
  { id: 'tomorrow', status: 'Tomorrow', distanceMeters: 50, tags: ['#Hiking'], startsAt: at(60 * 20), endsAt: at(60 * 22) },
  { id: 'ended', status: 'Ended', distanceMeters: 10, tags: ['#LiveMusic'], startsAt: at(-200), endsAt: at(-5) },
  { id: 'mine', origin: 'local', status: 'LIVE NOW', distanceMeters: 0, tags: ['#LiveMusic'], endsAt: at(30) },
];

test('splitFeed puts live and soon Points in nearby, closest first', () => {
  const { nearby } = splitFeed(nodes, NOW);
  assert.deepEqual(
    nearby.map((n) => n.id),
    ['live-near', 'soon', 'live-far'],
  );
});

test('splitFeed puts later Points in upcoming, soonest first, without ended or own Points', () => {
  const { upcoming } = splitFeed(nodes, NOW);
  assert.deepEqual(
    upcoming.map((n) => n.id),
    ['tonight', 'tomorrow'],
  );
});

test('splitFeed respects the allow filter (reports and blocks)', () => {
  const { nearby } = splitFeed(nodes, NOW, (n) => n.id !== 'live-near');
  assert.ok(!nearby.some((n) => n.id === 'live-near'));
});

const channel = (id: string, tags: string[], joined = false, memberCount = 100): Channel => ({
  id,
  name: id,
  handle: `c/${id}`,
  description: '',
  tags,
  memberCount,
  joined,
});

test('channelNodes matches tags ignoring case and #', () => {
  const found = channelNodes(channel('music', ['livemusic', '#JAZZ']), nodes);
  assert.deepEqual(found.map((n) => n.id).sort(), ['ended', 'live-far', 'live-near', 'mine']);
});

test('recommendChannels skips joined channels and ranks shared #tags first', () => {
  const picks = recommendChannels(
    [
      channel('music', ['#LiveMusic'], true),
      channel('food', ['#FoodTrucks']),
      channel('hike', ['#Hiking']),
      channel('big', ['#Knitting'], false, 50000),
    ],
    nodes,
    ['#hiking'],
    NOW,
  );
  assert.deepEqual(
    picks.map((p) => p.channel.id),
    ['hike', 'food', 'big'],
  );
  assert.equal(picks[0].reason, 'Matches #Hiking');
  assert.equal(picks[1].reason, '1 Point near you');
});

test('groupByDay labels today and tomorrow', () => {
  const groups = groupByDay(splitFeed(nodes, NOW).upcoming, NOW);
  assert.deepEqual(
    groups.map((g) => [g.label, g.items.length]),
    [
      ['Today', 1],
      ['Tomorrow', 1],
    ],
  );
});

test('formatting helpers', () => {
  assert.equal(formatDistance(316.4), '316m');
  assert.equal(formatDistance(1400), '1.4 km');
  assert.equal(formatDistance(undefined), null);
  assert.equal(formatCount(386), '386');
  assert.equal(formatCount(1240), '1.2k');
  assert.equal(formatCount(2000), '2k');
});
