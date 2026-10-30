import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsReauth, sessionState, signedOutMessage, touchSession } from './sessionPolicy';
import { LEGAL_DOCS, MINIMUM_AGE } from './legal';

const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 9, 19);

test('stays signed in while used at least every 60 days, up to a year', () => {
  assert.equal(sessionState({ startedAt: NOW - 200 * DAY, lastActiveAt: NOW - 59 * DAY }, NOW), 'active');
  assert.equal(sessionState({ startedAt: NOW - 200 * DAY, lastActiveAt: NOW - 60 * DAY }, NOW), 'idle_expired');
  assert.equal(sessionState({ startedAt: NOW - 365 * DAY, lastActiveAt: NOW }, NOW), 'max_expired');
});

test('opening the app restarts the idle clock (never backwards)', () => {
  const clock = { startedAt: NOW - 10 * DAY, lastActiveAt: NOW - 5 * DAY };
  assert.equal(touchSession(clock, NOW).lastActiveAt, NOW);
  assert.equal(touchSession({ ...clock, lastActiveAt: NOW }, NOW - DAY).lastActiveAt, NOW);
});

test('sensitive actions ask for the password after 10 minutes', () => {
  assert.equal(needsReauth(null, NOW), true);
  assert.equal(needsReauth(NOW - 5 * 60000, NOW), false);
  assert.equal(needsReauth(NOW - 11 * 60000, NOW), true);
  assert.equal(signedOutMessage('active'), null);
});

test('the three legal documents exist and state the minimum age', () => {
  assert.deepEqual(Object.keys(LEGAL_DOCS), ['terms', 'privacy', 'guidelines']);
  const terms = JSON.stringify(LEGAL_DOCS.terms);
  assert.ok(terms.includes(`at least ${MINIMUM_AGE}`));
  assert.ok(JSON.stringify(LEGAL_DOCS.privacy).includes('do not sell'));
});
