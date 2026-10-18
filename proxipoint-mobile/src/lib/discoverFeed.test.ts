import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  channelNodes,
  formatCount,
  formatDistance,
  groupByDay,
  inRange,
  isChannelQuery,
  recommendChannels,
  searchChannels,
  searchPoints,
  splitFeed,
  suggestTags,
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
  assert.deepEqual(found.map((n) => n.id).sort(), ['ended', 'live-far', 'live-near', 'mine']);  // A city channel (no #tags) takes every Point.
  assert.equal(channelNodes(channel('city', []), nodes).length, nodes.length);
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

// ---- Search ----

const CENTER = { latitude: 40.05, longitude: -105.05 };
// ~1.1 km per 0.01° latitude
const placed: FeedNode[] = [
  { id: 'jazz-near', title: 'Late-Night Jazz Jam', venue: 'The Rusty Anchor', tags: ['#LiveMusic', '#Jazz'], status: 'Starts in 3h', startsAt: at(180), latitude: 40.051, longitude: -105.05 },
  { id: 'music-live', title: 'Late Set', tags: ['#LiveMusic'], status: 'LIVE NOW', endsAt: at(60), latitude: 40.06, longitude: -105.05 },
  { id: 'music-far', title: 'Big Show', tags: ['#LiveMusic'], status: 'Tomorrow', startsAt: at(1500), latitude: 40.2, longitude: -105.05 },
  { id: 'tacos', title: 'Taco Tuesday Truck Rally', tags: ['#FoodTrucks'], status: 'Starts in 15m', startsAt: at(15), latitude: 40.052, longitude: -105.05 },
];

test('searchPoints matches anywhere in tags, titles and venues; live first, then closest', () => {
  assert.deepEqual(searchPoints(placed, '#live', CENTER, null, NOW).map((n) => n.id), ['music-live', 'jazz-near', 'music-far']);
  assert.deepEqual(searchPoints(placed, 'music', CENTER, null, NOW).map((n) => n.id), ['music-live', 'jazz-near', 'music-far']);
  assert.deepEqual(searchPoints(placed, 'taco', CENTER, null, NOW).map((n) => n.id), ['tacos']);
  assert.deepEqual(searchPoints(placed, 'jazz anchor', CENTER, null, NOW).map((n) => n.id), ['jazz-near']);
  assert.deepEqual(searchPoints(placed, 'jazz tacos', CENTER, null, NOW), []);
  assert.deepEqual(searchPoints(placed, '', CENTER, null, NOW), []);
});

test('searchPoints respects the range', () => {
  assert.deepEqual(searchPoints(placed, 'livemusic', CENTER, 5000, NOW).map((n) => n.id), ['music-live', 'jazz-near']);
  assert.equal(inRange(CENTER, { id: 'x' }, 1000), true); // no coordinates: kept
});

test('suggestTags: tags containing the last word, prefix matches first', () => {
  assert.deepEqual(suggestTags(placed, 'li'), [{ tag: '#LiveMusic', count: 3 }]);
  assert.deepEqual(suggestTags(placed, 'music'), [{ tag: '#LiveMusic', count: 3 }]);
  assert.deepEqual(suggestTags(placed, 'j').map((s) => s.tag), ['#Jazz']);
  assert.deepEqual(suggestTags(placed, 'f', ['#Fishing']), [
    { tag: '#FoodTrucks', count: 1 },
    { tag: '#Fishing', count: 0 },
  ]);
});

test('searchChannels matches names and tags', () => {
  const list = [channel('a', ['#Hiking']), { ...channel('b', ['#Pickleball']), name: 'Dink Crew' }];
  assert.deepEqual(searchChannels(list, 'hik').map((c) => c.id), ['a']);
  assert.deepEqual(searchChannels(list, 'dink').map((c) => c.id), ['b']);
});

test('c/ searches channels by handle, name or tag, and only channels', () => {
  const list = [
    { ...channel('food', ['#FoodTrucks'], false, 2105), name: 'Food Truck Chasers', handle: 'c/foodtrucks' },
    { ...channel('trail', ['#Hiking'], false, 1630), name: 'Trail Tribe', handle: 'c/trailtribe' },
  ];
  assert.equal(isChannelQuery('c/food'), true);
  assert.equal(isChannelQuery('#food'), false);
  assert.deepEqual(searchChannels(list, 'c/foodtr').map((c) => c.id), ['food']);
  assert.deepEqual(searchChannels(list, 'c/tribe').map((c) => c.id), ['trail']);
  assert.deepEqual(searchChannels(list, 'c/hik').map((c) => c.id), ['trail']);
  // Bare "c/" lists every channel, biggest first.
  assert.deepEqual(searchChannels(list, 'c/').map((c) => c.id), ['food', 'trail']);
  // Channel searches skip Points and #tag suggestions.
  assert.deepEqual(searchPoints(placed, 'c/taco', CENTER, null, NOW), []);
  assert.deepEqual(suggestTags(placed, 'c/li'), []);
  // Plain words still find channels too.
  assert.deepEqual(searchChannels(list, 'trucks').map((c) => c.id), ['food']);
});
