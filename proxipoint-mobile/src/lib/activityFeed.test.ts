import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildActivityFeed,
  scheduledAt,
  unreadActivityIds,
  type ActivityNode,
} from './activityFeed';

const now = new Date('2026-10-08T18:00:00.000Z');

const nodes: ActivityNode[] = [
  {
    id: 'later',
    title: 'Later show',
    venue: 'The Rusty Anchor',
    status: 'Tomorrow 18:00',
    isRsvpd: true,
    hostName: 'The Midnight Owls',
  },
  {
    id: 'soon',
    title: 'Taco rally',
    venue: 'Central Park Plaza',
    status: 'Starts in 15m',
    isRsvpd: true,
    hostName: 'Central Park Eats',
  },
  {
    id: 'live',
    title: 'Live set',
    venue: 'Title, Host',
    status: 'LIVE NOW',
    isRsvpd: true,
    hostName: 'Boulder Devs',
  },
  {
    id: 'open',
    title: 'Code & Coffee',
    venue: 'Downtown Tech Lab',
    status: 'Tomorrow 18:00',
    isRsvpd: false,
    hostName: 'Boulder Devs',
  },
];

test('scheduled events sort soonest to latest', () => {
  assert.ok(scheduledAt({ status: 'LIVE NOW' }, now) < scheduledAt({ status: 'Starts in 15m' }, now));
  assert.ok(scheduledAt({ status: 'Starts in 15m' }, now) < scheduledAt({ status: 'Tomorrow 18:00' }, now));
  const feed = buildActivityFeed(nodes, now, ['The Midnight Owls', 'Boulder Devs'], [
    { friend: 'jordan_ellis', eventId: 'soon' },
    { friend: 'sam_travels', eventId: 'open' },
  ]);
  const rsvps = feed.find((section) => section.id === 'rsvp');
  assert.deepEqual(rsvps?.items.map((item) => item.eventId), ['live', 'soon', 'later']);
});

test('the activity feed keeps promotions, followed hosts, and friend RSVPs apart', () => {
  const feed = buildActivityFeed(nodes, now, ['Boulder Devs'], [
    { friend: 'jordan_ellis', eventId: 'soon' },
    { friend: 'sam_travels', eventId: 'missing' },
  ]);
  const promo = feed.find((section) => section.id === 'promo');
  const following = feed.find((section) => section.id === 'following');
  const friends = feed.find((section) => section.id === 'friend');
  assert.equal(promo?.items.length, 2);
  assert.ok((promo?.items[0].at ?? 0) < (promo?.items[1].at ?? 0));
  assert.deepEqual(following?.items.map((item) => item.eventId), ['live', 'open']);
  assert.equal(friends?.items.length, 1);
  assert.match(friends?.items[0].detail ?? '', /@jordan_ellis RSVP'd/);
});

test('the red notice counts unseen items and clears once they are viewed', () => {
  const feed = buildActivityFeed(nodes, now, ['Boulder Devs'], [{ friend: 'jordan_ellis', eventId: 'soon' }]);
  const unread = unreadActivityIds(feed, []);
  assert.ok(unread.length > 0);
  assert.deepEqual(unreadActivityIds(feed, unread), []);
  const withNewRsvp = buildActivityFeed(
    nodes.map((node) => (node.id === 'open' ? { ...node, isRsvpd: true } : node)),
    now,
    ['Boulder Devs'],
    [{ friend: 'jordan_ellis', eventId: 'soon' }],
  );
  assert.deepEqual(unreadActivityIds(withNewRsvp, unread), ['rsvp:open']);
});
