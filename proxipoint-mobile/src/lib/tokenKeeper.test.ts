import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REFRESH_EARLY_MS, createTokenKeeper, isStandInSession, type TokenPair } from './tokenKeeper';

const NOW = Date.UTC(2026, 10, 7, 12);
const MIN = 60 * 1000;

class Refused extends Error {}

function setup(start: TokenPair | null, refresh: (s: TokenPair) => Promise<TokenPair>) {
  let session = start;
  const calls = { refresh: 0, signOut: 0, sent: [] as string[] };
  const keeper = createTokenKeeper<TokenPair>({
    current: () => session,
    refresh: async (s) => {
      calls.refresh += 1;
      calls.sent.push(s.refreshToken);
      return refresh(s);
    },
    save: async (s) => {
      session = s;
    },
    signOut: async () => {
      calls.signOut += 1;
      session = null;
    },
    isRefused: (e) => e instanceof Refused,
    now: () => NOW,
  });
  return { keeper, calls, session: () => session, set: (s: TokenPair | null) => (session = s) };
}

const pair = (n: number, expiresAt: number): TokenPair => ({ accessToken: `a${n}`, refreshToken: `r${n}`, expiresAt });
const next = (s: TokenPair) => Promise.resolve(pair(Number(s.accessToken.slice(1)) + 1, NOW + 15 * MIN));

test('uses the current token while it has more than a minute left', async () => {
  const t = setup(pair(1, NOW + REFRESH_EARLY_MS + 1), next);
  assert.equal(await t.keeper.accessToken(), 'a1');
  assert.equal(t.calls.refresh, 0);
});

test('refreshes a minute early, and saves the new pair', async () => {
  const t = setup(pair(1, NOW + 30 * 1000), next);
  assert.equal(await t.keeper.accessToken(), 'a2');
  assert.equal(t.session()?.refreshToken, 'r2');
});

test('callers arriving together share one refresh: the refresh token is sent once', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const t = setup(pair(1, NOW - MIN), async (s) => {
    await gate;
    return next(s);
  });
  const all = Promise.all([t.keeper.accessToken(), t.keeper.accessToken(), t.keeper.accessToken({ force: true })]);
  release();
  assert.deepEqual(await all, ['a2', 'a2', 'a2']);
  assert.deepEqual(t.calls.sent, ['r1']);
  // The next call after it finished uses the fresh token without refreshing again.
  assert.equal(await t.keeper.accessToken(), 'a2');
  assert.equal(t.calls.refresh, 1);
});

test('force refreshes even a token with time left', async () => {
  const t = setup(pair(1, NOW + 10 * MIN), next);
  assert.equal(await t.keeper.accessToken({ force: true }), 'a2');
});

test('a refused refresh token signs the phone out', async () => {
  const t = setup(pair(1, NOW - MIN), () => Promise.reject(new Refused()));
  assert.equal(await t.keeper.accessToken(), null);
  assert.equal(t.calls.signOut, 1);
  assert.equal(t.session(), null);
});

test('offline: keeps the old token while it lasts, then reports the error', async () => {
  const offline = () => Promise.reject(new Error('network'));
  const soon = setup(pair(1, NOW + 30 * 1000), offline);
  assert.equal(await soon.keeper.accessToken(), 'a1');
  assert.equal(soon.calls.signOut, 0);
  const expired = setup(pair(1, NOW - MIN), offline);
  await assert.rejects(expired.keeper.accessToken(), /network/);
  assert.equal(expired.calls.signOut, 0);
  assert.equal(expired.session()?.refreshToken, 'r1');
});

test('a sign-out or new sign-in during a refresh wins over its result', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const t = setup(pair(1, NOW - MIN), async (s) => {
    await gate;
    return next(s);
  });
  const pending = t.keeper.accessToken();
  t.set(pair(9, NOW + 15 * MIN)); // signed in again meanwhile
  release();
  assert.equal(await pending, 'a9');
  assert.equal(t.session()?.refreshToken, 'r9');
});

test('signed out: no token, no refresh', async () => {
  const t = setup(null, next);
  assert.equal(await t.keeper.accessToken(), null);
  assert.equal(t.calls.refresh, 0);
});

test('spots sessions from the on-phone stand-in', () => {
  assert.equal(isStandInSession({ accessToken: 'local_abc', refreshToken: 'localr_def', expiresAt: 0 }), true);
  assert.equal(isStandInSession({ accessToken: 'eyJhbGciOi.x.y', refreshToken: 'x0_MlI', expiresAt: 0 }), false);
});
