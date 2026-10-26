import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NAME_COOLDOWN_MS, nameCooldown, waitLabel } from './nameCooldown';

const now = new Date('2026-10-26T15:00:00Z');

test('a name change locks the next one for 72 hours', () => {
  assert.deepEqual(nameCooldown(null, now), { allowed: true, availableAt: null });
  const justNow = new Date(now.getTime() - 60_000).toISOString();
  const c = nameCooldown(justNow, now);
  assert.equal(c.allowed, false);
  assert.equal(c.availableAt?.getTime(), Date.parse(justNow) + NAME_COOLDOWN_MS);
  const longAgo = new Date(now.getTime() - NAME_COOLDOWN_MS - 1).toISOString();
  assert.equal(nameCooldown(longAgo, now).allowed, true);
  assert.equal(nameCooldown('garbage', now).allowed, true);
});

test('wait label', () => {
  const at = (ms: number) => new Date(now.getTime() + ms);
  assert.equal(waitLabel(at(5 * 60_000), now), 'in 5 minutes');
  assert.equal(waitLabel(at(5 * 3_600_000), now), 'in 5 hours');
  assert.equal(waitLabel(at(71 * 3_600_000), now), 'in 3 days');
});
