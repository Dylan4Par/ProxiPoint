import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chunkChronologicalFeed,
  formatFeedMeta,
  formatFeedSectionTitle,
  isLiveFeedItem,
  type ChronologicalFeedItem,
} from './feedSections';

const now = new Date(2026, 9, 9, 15, 0, 0);

function item(partial: Partial<ChronologicalFeedItem> & Pick<ChronologicalFeedItem, 'id'>): ChronologicalFeedItem {
  return {
    status: 'Scheduled',
    distanceMeters: 100,
    startsAt: null,
    ...partial,
  };
}

test('live beacons pin to the top and sort nearest first', () => {
  const sections = chunkChronologicalFeed(
    [
      item({ id: 'far', status: 'LIVE NOW', distanceMeters: 420, startsAt: new Date(2026, 9, 9, 18, 0, 0).toISOString() }),
      item({ id: 'later', startsAt: new Date(2026, 9, 9, 18, 0, 0).toISOString(), distanceMeters: 900 }),
      item({ id: 'near', status: 'LIVE NOW', distanceMeters: 180 }),
      item({ id: 'market', startsAt: new Date(2026, 9, 10, 9, 0, 0).toISOString(), distanceMeters: 640 }),
      item({ id: 'run', startsAt: new Date(2026, 9, 11, 7, 30, 0).toISOString(), distanceMeters: 1500 }),
    ],
    now,
  );

  assert.deepEqual(
    sections.map((section) => section.title),
    ['LIVE NOW', 'TODAY — FRIDAY, OCT 9', 'TOMORROW — SATURDAY, OCT 10', 'SUNDAY, OCT 11'],
  );
  assert.equal(sections[0]?.tone, 'live');
  assert.deepEqual(sections[0]?.data.map((entry) => entry.id), ['near', 'far']);
  assert.deepEqual(sections[1]?.data.map((entry) => entry.id), ['later']);
  assert.deepEqual(sections[2]?.data.map((entry) => entry.id), ['market']);
  assert.deepEqual(sections[3]?.data.map((entry) => entry.id), ['run']);
});

test('scheduled cards show the clock and live cards show distance', () => {
  const later = new Date(2026, 9, 9, 18, 0, 0).toISOString();
  assert.equal(isLiveFeedItem({ status: 'Scheduled', startsAt: later }, now), false);
  assert.equal(formatFeedMeta({ status: 'Scheduled', startsAt: later, distanceMeters: 12 }, now), '18:00');
  assert.equal(formatFeedMeta({ status: 'LIVE NOW', distanceMeters: 180.4 }, now), '180m away');
  assert.equal(formatFeedMeta(item({ id: 'soon', status: 'Tomorrow 18:00', distanceMeters: 90 }), now), '18:00');
});

test('an event that already started today stays in LIVE NOW', () => {
  const sections = chunkChronologicalFeed(
    [item({ id: 'ongoing', startsAt: new Date(2026, 9, 9, 9, 0, 0).toISOString(), distanceMeters: 50 })],
    now,
  );
  assert.equal(sections[0]?.id, 'live');
  assert.equal(sections[0]?.data[0]?.id, 'ongoing');
});

test('explicit live status wins over a future start', () => {
  const startsAt = new Date(2026, 9, 10, 9, 0, 0).toISOString();
  assert.equal(isLiveFeedItem({ status: 'LIVE NOW', startsAt }, now), true);
});

test('yesterday stays on its own date instead of the live rail', () => {
  const sections = chunkChronologicalFeed(
    [item({ id: 'old', startsAt: new Date(2026, 9, 8, 18, 0, 0).toISOString(), distanceMeters: 10 })],
    now,
  );
  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.tone, 'scheduled');
  assert.equal(sections[0]?.title, 'THURSDAY, OCT 8');
});

test('status text without a timestamp still chunks into today or tomorrow', () => {
  const sections = chunkChronologicalFeed(
    [
      item({ id: 'soon', status: 'Starts in 15m', distanceMeters: 430 }),
      item({ id: 'tomorrow', status: 'Tomorrow 18:00', distanceMeters: 1200 }),
    ],
    now,
  );
  assert.deepEqual(
    sections.map((section) => [section.title, section.data.map((entry) => entry.id)]),
    [
      ['TODAY — FRIDAY, OCT 9', ['soon']],
      ['TOMORROW — SATURDAY, OCT 10', ['tomorrow']],
    ],
  );
});

test('tomorrow rolls into the next month', () => {
  const monthEnd = new Date(2026, 9, 31, 12, 0, 0);
  const title = formatFeedSectionTitle(new Date(2026, 10, 1, 9, 0, 0), monthEnd);
  assert.equal(title, 'TOMORROW — SUNDAY, NOV 1');
});

test('an empty feed has no sections', () => {
  assert.deepEqual(chunkChronologicalFeed([], now), []);
});
