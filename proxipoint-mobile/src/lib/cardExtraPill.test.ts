import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POPULAR_GOING, countByHost, extraPill } from './cardExtraPill';

const hosts = countByHost([{ host: '@newbie' }, { host: '@regular' }, { host: '@Regular' }, { host: '@LocalRadar' }]);

test('price first, then New Host, then Popular', () => {
  assert.deepEqual(extraPill({ host: '@newbie', attendeeCount: 99, facts: { priceLabel: 'From $30' } }, hosts), { kind: 'price', label: 'From $30' });
  assert.deepEqual(extraPill({ host: '@newbie', attendeeCount: 99 }, hosts), { kind: 'newHost', label: 'New Host' });
  assert.deepEqual(extraPill({ host: '@regular', attendeeCount: POPULAR_GOING }, hosts), { kind: 'popular', label: 'Popular' });
  assert.equal(extraPill({ host: '@regular', attendeeCount: POPULAR_GOING - 1 }, hosts), null);
});

test('gathered events are never a New Host', () => {
  assert.equal(extraPill({ host: '@LocalRadar', source: 'external', attendeeCount: 0 }, hosts), null);
  assert.equal(extraPill({ attendeeCount: 0 }, hosts), null, 'no host');
});
