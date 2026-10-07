import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEED_EVENT_DETAILS, formatEventSchedule, templateEventDetails, zonedWindow } from './eventDetails';

test('a Denver evening window stays on the local clock', () => {
  const window = zonedWindow(new Date('2026-10-07T18:00:00.000Z'), 17, 19);
  const schedule = formatEventSchedule(window.startsAt, window.endsAt);
  assert.match(schedule.dateLabel, /October 7/);
  assert.match(schedule.timeLabel, /5:00/);
  assert.match(schedule.timeLabel, /7:00/);
  assert.match(schedule.timeLabel, /MT/);
});

test('seed events carry photos, a link, and a time window', () => {
  for (const detail of Object.values(SEED_EVENT_DETAILS)) {
    assert.match(detail.url, /^https:\/\//);
    assert.ok(detail.pictures.length >= 2);
    assert.ok(detail.pictures.every((picture) => picture.url.startsWith('https://') && picture.caption.length > 0));
    assert.ok(detail.summary.length > 40);
    assert.ok(new Date(detail.endsAt).getTime() > new Date(detail.startsAt).getTime());
  }
  const acoustic = formatEventSchedule(
    SEED_EVENT_DETAILS['downtown-1'].startsAt,
    SEED_EVENT_DETAILS['downtown-1'].endsAt,
  );
  assert.match(acoustic.dateLabel, /Wednesday, October 7/);
  assert.match(acoustic.timeLabel, /5:00 PM – 7:00 PM MT/);
});

test('a dropped beacon gets a map link and two pictures', () => {
  const detail = templateEventDetails({
    id: 'beacon-1',
    title: 'Night Market',
    venue: 'Civic Center',
    tag: '#Pickup',
    latitude: 40.015,
    longitude: -105.28,
    reference: new Date('2026-10-07T18:00:00.000Z'),
  });
  assert.match(detail.url, /google\.com\/maps\/search/);
  assert.match(detail.url, /40\.015,-105\.28/);
  assert.equal(detail.pictures.length, 2);
  assert.match(detail.summary, /Night Market/);
  assert.ok(new Date(detail.endsAt).getTime() > new Date(detail.startsAt).getTime());
});
