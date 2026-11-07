import assert from 'node:assert/strict';
import { test } from 'node:test';

test('people near each other in the same 10 minutes make the same request (cacheable)', async () => {
  process.env.EXPO_PUBLIC_EVENTS_URL = 'https://api.example.com/api/v1/events';
  const { eventsRequestUrl } = await import('../services/eventsApi');
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const a = eventsRequestUrl({ tenantId, near: { latitude: 40.0131, longitude: -105.27041 }, now: new Date('2026-11-03T07:21:13.456Z') });
  const b = eventsRequestUrl({ tenantId, near: { latitude: 40.0149, longitude: -105.2711 }, now: new Date('2026-11-03T07:29:59.000Z') });
  assert.equal(a, b);
  assert.match(a, /near=40\.01,-105\.27/);
  assert.match(a, /from=2026-11-03T07%3A20%3A00\.000Z/);
  assert.match(a, /to=2026-12-03T07%3A20%3A00\.000Z/);
  const later = eventsRequestUrl({ tenantId, near: { latitude: 40.0131, longitude: -105.2704 }, now: new Date('2026-11-03T07:30:00.000Z') });
  assert.notEqual(a, later, 'a new window every 10 minutes');
});
