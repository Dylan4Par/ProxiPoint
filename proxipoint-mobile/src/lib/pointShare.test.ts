import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pointShareContent, pointShareWhen } from './pointShare';

test('share text: title, when · where, and the link', () => {
  const start = new Date(2026, 10, 4, 19, 0).toISOString();
  const end = new Date(2026, 10, 4, 21, 30).toISOString();
  const c = pointShareContent({ id: 'ev:abc 1', title: 'Porch Blues Session', startsAt: start, endsAt: end, where: 'Briggs Street Porch' });
  assert.equal(c.message, 'Porch Blues Session\nWed, Nov 4 · 7:00 PM – 9:30 PM · Briggs Street Porch');
  assert.match(c.url, /\/ev%3Aabc%201$/);
  assert.equal(pointShareWhen({ id: 'x', title: 't', live: true, endsAt: end }), 'Live now · until 9:30 PM');
  assert.equal(pointShareContent({ id: 'x', title: 'No time' }).message, 'No time');
});
