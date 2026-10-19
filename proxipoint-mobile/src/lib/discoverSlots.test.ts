import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localSpots, placeBoosts, spotsLabel, spotsWindowEnd } from './discoverSlots';
import { recommendChannels, type FeedNode } from './discoverFeed';
import type { Channel } from './channels';

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, tag: i % 2 ? '#Jazz' : '#Hiking' }));
const ids = (list: Array<{ item: { id: string } }>) => list.map((entry) => entry.item.id);

test('Boosts move into the 2nd and 6th slots; everything else keeps its order', () => {
  const list = items(10); // room for 2 slotted Boosts (1 in 5)
  const boosted = new Set(['p7', 'p9']);
  const placed = placeBoosts(list, (item) => boosted.has(item.id));
  assert.deepEqual(ids(placed), ['p0', 'p7', 'p1', 'p2', 'p3', 'p9', 'p4', 'p5', 'p6', 'p8']);
  assert.deepEqual(placed.filter((p) => p.slotted).map((p) => p.item.id), ['p7', 'p9']);
});

test('at most 1 in 5 items is a slotted Boost; the rest stay put, still labeled', () => {
  const list = items(6); // room for 1
  const placed = placeBoosts(list, (item) => item.id === 'p4' || item.id === 'p5');
  assert.deepEqual(ids(placed), ['p0', 'p4', 'p1', 'p2', 'p3', 'p5']);
  assert.equal(placed.find((p) => p.item.id === 'p5')?.boosted, true);
  assert.equal(placed.find((p) => p.item.id === 'p5')?.slotted, false);
  // A short list gets no slotted Boosts at all.
  assert.deepEqual(ids(placeBoosts(items(4), (item) => item.id === 'p3')), ['p0', 'p1', 'p2', 'p3']);
});

test('Boosts matching your #tags go first; hidden ones go back to their place', () => {
  const list = items(10);
  const boosted = new Set(['p4', 'p7']); // p4 #Hiking, p7 #Jazz
  const placed = placeBoosts(list, (item) => boosted.has(item.id), { interestTags: ['jazz'] });
  assert.equal(placed.at(1)?.item.id, 'p7');
  assert.equal(placed.at(5)?.item.id, 'p4');
  const hidden = placeBoosts(list, (item) => boosted.has(item.id), { hidden: new Set(['p7']) });
  assert.equal(hidden.at(1)?.item.id, 'p4');
  assert.equal(hidden.find((p) => p.item.id === 'p7')?.slotted, false);
});

const NOON = new Date(2026, 9, 19, 12, 0).getTime();
const EVENING = new Date(2026, 9, 19, 19, 0).getTime();
const at = (base: number, hours: number) => new Date(base + hours * 3600000).toISOString();

test('local spots: one card per business venue, Boosted then live then soonest', () => {
  const nodes = [
    { id: 'a', venue: 'The Rusty Anchor', host: '@rustyanchor', startsAt: at(NOON, 6), endsAt: at(NOON, 9) },
    { id: 'b', venue: 'The Rusty Anchor', host: '@rustyanchor', startsAt: at(NOON, 2), endsAt: at(NOON, 4) },
    { id: 'c', venue: 'Meeple Café', host: '@meeplecafe', startsAt: at(NOON, -1), endsAt: at(NOON, 2) },
    { id: 'd', venue: 'Mesa Trailhead', host: '@trailtribe', startsAt: at(NOON, 1), endsAt: at(NOON, 3) }, // not a business
    { id: 'e', venue: 'Creekside', host: '@creeksidemarket', startsAt: at(NOON, 30), endsAt: at(NOON, 33) }, // tomorrow
    { id: 'f', venue: 'Secret Spot', host: '@meeplecafe', startsAt: at(NOON, 3), endsAt: at(NOON, 4), locationPrivacy: { regionName: 'Erie' } },
    { id: 'g', venue: 'Mesa 4 Tacos', host: '@mesa4tacos', startsAt: at(NOON, 5), endsAt: at(NOON, 7) },
  ];
  const business = new Set(['@rustyanchor', '@meeplecafe', '@creeksidemarket', '@mesa4tacos']);
  const spots = localSpots(nodes, { now: NOON, isBusiness: (h) => business.has(h), isBoosted: (n) => n.id === 'g' });
  assert.deepEqual(spots.map((s) => s.node.id), ['g', 'c', 'b']);
  assert.deepEqual(spots.map((s) => [s.boosted, s.live]), [[true, false], [false, true], [false, false]]);
  // Hidden Boost: no longer first.
  const hidden = localSpots(nodes, { now: NOON, isBusiness: (h) => business.has(h), isBoosted: (n) => n.id === 'g', hidden: new Set(['g']) });
  assert.deepEqual(hidden.map((s) => s.node.id), ['c', 'b', 'g']);
});

test('today until midnight; tonight from 5 pm until 2 am', () => {
  assert.equal(spotsLabel(NOON), 'TODAY AT LOCAL SPOTS');
  assert.equal(spotsLabel(EVENING), 'TONIGHT AT LOCAL SPOTS');
  assert.equal(spotsWindowEnd(NOON), new Date(2026, 9, 19, 23, 59, 59, 999).getTime());
  assert.equal(spotsWindowEnd(EVENING), new Date(2026, 9, 20, 2, 0).getTime());
});

const channel = (id: string, tags: string[], memberCount: number): Channel => ({
  id,
  name: id,
  handle: `c/${id}`,
  description: '',
  tags,
  memberCount,
  joined: false,
});

test('a town channel no longer outranks a real channel just by counting every Point', () => {
  const nodes: FeedNode[] = [
    { id: '1', tags: ['#Hiking'], status: 'Starts in 1h', startsAt: at(NOON, 1) },
    { id: '2', tags: ['#LiveMusic'], status: 'Starts in 2h', startsAt: at(NOON, 2) },
    { id: '3', tags: ['#FoodTrucks'], status: 'Starts in 3h', startsAt: at(NOON, 3) },
    { id: '4', tags: ['#Jazz'], status: 'Starts in 4h', startsAt: at(NOON, 4) },
  ];
  const picks = recommendChannels([channel('erie-local', [], 0), channel('trail', ['#Hiking'], 1630)], nodes, [], NOON);
  assert.deepEqual(picks.map((p) => p.channel.id), ['trail', 'erie-local']);
  assert.equal(picks.at(1)?.reason, 'Your town’s channel');
});
