import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SAMPLE_PLACES,
  bestTips,
  blockPlace,
  buildPlaceIndex,
  placeRef,
  placesNear,
  pointsAtPlace,
  postsAtPlace,
  searchLocalPlaces,
  type LocalPlace,
} from './localPlaces';
import type { ChannelPost } from './channels';

const NOW = new Date('2026-10-18T18:00:00Z').getTime();
const daysAgo = (days: number) => new Date(NOW - days * 86400000).toISOString();
const plaza = SAMPLE_PLACES.find((place) => place.id === 'pl-central-plaza') as LocalPlace;
const meadow = SAMPLE_PLACES.find((place) => place.id === 'pl-meadow-park') as LocalPlace;

const post = (id: string, extra: Partial<ChannelPost> = {}): ChannelPost => ({
  id,
  channelId: 'c',
  author: '@a',
  body: id,
  createdAt: daysAgo(1),
  upvotes: 1,
  voted: false,
  ...extra,
});

test('place index: Point venues become places unless already known or hidden', () => {
  const index = buildPlaceIndex(SAMPLE_PLACES, [
    { id: 'pt-taco', venue: 'Central Park Plaza', latitude: plaza.latitude + 0.0002, longitude: plaza.longitude },
    { id: 'pt-new', venue: 'Vinyl Barn', latitude: 40.07, longitude: -105.03 },
    { id: 'pt-secret', venue: 'My Backyard', latitude: 40.07, longitude: -105.03, locationPrivacy: { regionName: 'Erie' } },
  ]);
  assert.equal(index.length, SAMPLE_PLACES.length + 1);
  assert.equal(index[index.length - 1].id, 'venue-pt-new');
});

test('place index picks up places that only exist on posts (a block)', () => {
  const block = blockPlace(SAMPLE_PLACES, { latitude: 40.0611, longitude: -105.0369 });
  const index = buildPlaceIndex(SAMPLE_PLACES, [], [post('p', { place: placeRef(block) })]);
  assert.ok(index.some((place) => place.id === block.id && place.kind === 'block'));
});

test('search: name prefix first, then contains, then kind; blocks never listed', () => {
  assert.equal(searchLocalPlaces(SAMPLE_PLACES, 'meadow')[0].id, 'pl-meadow-park');
  assert.deepEqual(
    searchLocalPlaces(SAMPLE_PLACES, 'trail').map((place) => place.id),
    ['pl-coal-creek', 'pl-mesa-trailhead'], // both contain "trail": alphabetical without a center
  );
  // With a center, the closer one wins the tie.
  const mesa = SAMPLE_PLACES.find((place) => place.id === 'pl-mesa-trailhead') as LocalPlace;
  assert.equal(searchLocalPlaces(SAMPLE_PLACES, 'trail', mesa)[0].id, 'pl-mesa-trailhead');
  assert.ok(searchLocalPlaces(SAMPLE_PLACES, 'park').length >= 2);
  assert.deepEqual(searchLocalPlaces(SAMPLE_PLACES, 'x'), []);
});

test('a block is named after the closest place, never "near you"', () => {
  const near = blockPlace(SAMPLE_PLACES, { latitude: plaza.latitude, longitude: plaza.longitude + 0.001 });
  assert.equal(near.name, 'Near Central Park Plaza');
  assert.equal(near.kind, 'block');
  assert.equal(blockPlace(SAMPLE_PLACES, { latitude: 41, longitude: -106 }).name, 'Nearby block');
  assert.equal(placesNear(SAMPLE_PLACES, plaza, 1)[0].id, 'pl-central-plaza');
});

test('posts at a place: by id, or by name close by for older posts', () => {
  const posts = [
    post('a', { place: placeRef(plaza) }),
    post('b', { place: { latitude: plaza.latitude, longitude: plaza.longitude, label: 'Central Park Plaza' } }),
    post('c', { place: placeRef(meadow) }),
    post('d'),
  ];
  assert.deepEqual(postsAtPlace(posts, plaza).map((p) => p.id), ['a', 'b']);
});

test('points at a place: same venue name or within 120 m', () => {
  const nodes = [
    { id: 'x', venue: 'Central Park Plaza', latitude: 40.2, longitude: -105.2 },
    { id: 'y', venue: 'Elsewhere', latitude: plaza.latitude + 0.0005, longitude: plaza.longitude },
    { id: 'z', venue: 'Far', latitude: plaza.latitude + 0.01, longitude: plaza.longitude },
  ];
  assert.deepEqual(pointsAtPlace(nodes, plaza).map((n) => n.id), ['x', 'y']);
});

test('best tips: tips and questions from the last year, most upvoted first', () => {
  const posts = [
    post('tip', { kind: 'tip', upvotes: 10 }),
    post('q', { kind: 'question', upvotes: 30 }),
    post('heads', { kind: 'heads_up', upvotes: 99 }),
    post('old', { kind: 'tip', upvotes: 500, createdAt: daysAgo(400) }),
  ];
  assert.deepEqual(bestTips(posts, NOW).map((p) => p.id), ['q', 'tip']);
});
