import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VERIFIED_MIN_DROPS,
  VERIFIED_MIN_RATIO,
  coordinatorBadgeLabel,
  hostReputation,
  qualifiesAsVerifiedCoordinator,
  shouldRequestHostFeedback,
} from './trust';

test('coordinator qualification requires five drops and an 85 percent score', () => {
  assert.equal(VERIFIED_MIN_DROPS, 5);
  assert.equal(VERIFIED_MIN_RATIO, 0.85);
  assert.equal(qualifiesAsVerifiedCoordinator(4, 4), false);
  assert.equal(qualifiesAsVerifiedCoordinator(5, 4), false);
  assert.equal(qualifiesAsVerifiedCoordinator(100, 84), false);
  assert.equal(qualifiesAsVerifiedCoordinator(5, 5), true);
  assert.equal(qualifiesAsVerifiedCoordinator(100, 85), true);
});

test('Viper-2 at 45 upvotes across 48 drops is a verified coordinator at 94 percent', () => {
  const reputation = hostReputation(48, 45);
  assert.equal(reputation.positivePercent, 94);
  assert.equal(reputation.isVerifiedCoordinator, true);
  assert.equal(coordinatorBadgeLabel(48, 45), '⭐ Verified Coordinator (94% • 48 drops)');
});

test('hosts below the bar do not get a badge label', () => {
  const reputation = hostReputation(3, 3);
  assert.equal(reputation.positiveRatio, 1);
  assert.equal(reputation.isVerifiedCoordinator, false);
  assert.equal(coordinatorBadgeLabel(3, 3), '');
  assert.equal(hostReputation(0, 4).positiveRatio, 0);
  assert.equal(qualifiesAsVerifiedCoordinator(0, 0), false);
});

test('negative or empty totals cannot inflate a reputation', () => {
  const reputation = hostReputation(-2, Number.NaN);
  assert.equal(reputation.totalDrops, 0);
  assert.equal(reputation.upvoteCount, 0);
  assert.equal(reputation.isVerifiedCoordinator, false);
});

test('feedback is requested when an RSVP leaves the fence or the beacon expires', () => {
  assert.equal(
    shouldRequestHostFeedback({ wasRsvpd: true, stillInside: false, beaconExpired: false, alreadyPrompted: false }),
    true,
  );
  assert.equal(
    shouldRequestHostFeedback({ wasRsvpd: true, stillInside: true, beaconExpired: true, alreadyPrompted: false }),
    true,
  );
  assert.equal(
    shouldRequestHostFeedback({ wasRsvpd: true, stillInside: true, beaconExpired: false, alreadyPrompted: false }),
    false,
  );
  assert.equal(
    shouldRequestHostFeedback({ wasRsvpd: false, stillInside: false, beaconExpired: true, alreadyPrompted: false }),
    false,
  );
  assert.equal(
    shouldRequestHostFeedback({ wasRsvpd: true, stillInside: false, beaconExpired: true, alreadyPrompted: true }),
    false,
  );
});
