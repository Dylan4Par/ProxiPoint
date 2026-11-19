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

test('funnel finds the weakest step', async () => {
  const { funnel } = await import('./hostInsights');
  const f = funnel({ impressions: 10000, opens: 600, rsvps: 60, checkIns: 50 });
  assert.deepEqual(f.steps.map((s) => s.id), ['impressions', 'opens', 'rsvps', 'checkIns']);
  assert.equal(f.steps[1].fromPrev, 0.06);
  assert.equal(f.bottleneck?.id, 'rsvps'); // 10% vs 30% typical
  assert.equal(funnel({ impressions: 1000, opens: 100, rsvps: 50, checkIns: 45 }).bottleneck, null);
  assert.equal(funnel({ impressions: 0, opens: 0, rsvps: 0, checkIns: 0 }).bottleneck, null);
});

test('origins bin into hexes and small cells are hidden', async () => {
  const { hexBin, sampleOrigins, HEX_EDGE_METERS, pastAttendees } = await import('./hostInsights');
  const pts = sampleOrigins('evt', { walk: 0.5, short: 0.3, regional: 0.2 }, 300);
  assert.equal(pts.length, 300);
  assert.deepEqual(sampleOrigins('evt', { walk: 0.5, short: 0.3, regional: 0.2 }, 300), pts);
  const cells = hexBin(pts, HEX_EDGE_METERS[8]);
  assert.ok(cells.length > 0 && cells.every((c) => c.count >= 3));
  assert.ok(cells.reduce((n, c) => n + c.count, 0) <= 300);
  assert.equal(hexBin([{ x: 0, y: 0 }, { x: 1, y: 1 }], 100).length, 0, 'two people never show');
  assert.deepEqual(pastAttendees([[{ id: '1', label: '@a' }, { id: '2', label: '@b' }], [{ id: '1', label: '@a' }], undefined]), ['@a', '@b']);
});

test('funnel widths: log step for opens, then relative to the previous bar', async () => {
  const { funnel, funnelWidths } = await import('./hostInsights');
  const { steps } = funnel({ impressions: 11400, opens: 750, rsvps: 253, checkIns: 176 });
  const w = funnelWidths(steps);
  assert.equal(w[0], 1);
  assert.ok(w[1] > 0.38 && w[1] < 0.45, String(w[1])); // ~41%
  assert.ok(Math.abs(w[2] / w[1] - 253 / 750) < 1e-9); // 34% of stage 2
  assert.ok(Math.abs(w[3] / w[2] - 176 / 253) < 1e-9); // 70% of stage 3
  assert.equal(funnelWidths([{ fromPrev: null }, { fromPrev: 0 }, { fromPrev: 0 }])[2], 0.06);
});
