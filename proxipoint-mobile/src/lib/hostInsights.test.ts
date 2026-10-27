import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendeeCsv, buildInsights, eventsInRange, formatCount } from './hostInsights';

const now = Date.parse('2026-10-27T16:00:00Z');
const ev = (id: string, daysAgo: number, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  startsAt: new Date(now - daysAgo * 86400000).toISOString(),
  tags: ['#FoodTrucks'],
  ...extra,
});

test('insights are steady, consistent and use real RSVPs when known', () => {
  const events = [ev('a', 2, { going: 40 }), ev('b', 10, { boosted: true, boostSpendCents: 499 })];
  const one = buildInsights(events);
  assert.deepEqual(buildInsights(events), one, 'same input, same numbers');
  assert.ok(one.rsvps >= 40);
  assert.ok(one.opens < one.impressions && one.checkIns <= one.rsvps);
  const t = one.travel;
  assert.ok(Math.abs(t.walk + t.short + t.regional - 1) < 1e-9);
  assert.equal(one.engagementByHour.length, 24);
  assert.equal(one.arrivals.length, 8);
  assert.ok(one.boost && one.boost.boosted > 0 && one.boost.liftPct > 0);
  assert.ok(!one.tagAffinity.some((a) => a.tag === '#FoodTrucks'), 'own tags are not "other" tags');
  assert.equal(buildInsights([]).impressions, 0);
});

test('range, CSV and counts', () => {
  const events = [ev('a', 2), ev('b', 40), ev('c', 200)];
  assert.deepEqual(eventsInRange(events, '30d', now).map((e) => e.id), ['a']);
  assert.equal(eventsInRange(events, 'all', now).length, 3);
  assert.equal(
    attendeeCsv([{ event: 'Taco, Tuesday', label: '@sam', status: 'going', at: '2026-10-27T01:00:00Z' }]),
    'Event,Attendee,Status,RSVP Time\n"Taco, Tuesday",@sam,going,2026-10-27T01:00:00Z',
  );
  assert.equal(formatCount(4820), '4,820');
  assert.equal(formatCount(12400), '12.4K');
});
