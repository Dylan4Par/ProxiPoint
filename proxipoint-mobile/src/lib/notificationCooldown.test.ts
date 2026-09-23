import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimNotificationSlot, NOTIFICATION_COOLDOWN_MS } from './notificationCooldown';

test('the first breach for a target claims a notification slot', () => {
  const cache = new Map<string, number>();
  assert.equal(claimNotificationSlot(cache, 'alpha', 1_000), true);
  assert.equal(cache.get('alpha'), 1_000);
});

test('repeats inside the cooldown are suppressed per target', () => {
  const cache = new Map<string, number>();
  assert.equal(claimNotificationSlot(cache, 'alpha', 1_000), true);
  assert.equal(claimNotificationSlot(cache, 'alpha', 1_000 + NOTIFICATION_COOLDOWN_MS - 1), false);
  assert.equal(claimNotificationSlot(cache, 'bravo', 1_500), true);
});

test('a target can notify again after the cooldown', () => {
  const cache = new Map<string, number>();
  assert.equal(claimNotificationSlot(cache, 'alpha', 1_000), true);
  assert.equal(claimNotificationSlot(cache, 'alpha', 1_000 + NOTIFICATION_COOLDOWN_MS), true);
  assert.equal(cache.get('alpha'), 1_000 + NOTIFICATION_COOLDOWN_MS);
});
