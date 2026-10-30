/**
 * How long people stay signed in. Pure, so the server uses the same numbers.
 *
 * - Access token: 15 minutes, refreshed quietly in the background.
 * - Idle limit: 60 days. Every time the app is opened, the clock restarts, so anyone who uses
 *   ProxiPoint at least once every two months never has to sign in again on that phone.
 * - Hard limit: 365 days. After a year on one phone, sign in again once (catches lost and handed-
 *   down phones).
 * - Sensitive actions (change email or password, delete the account, buy a Boost) ask for the
 *   password again if it hasn't been entered in the last 10 minutes.
 * - Resetting or changing the password signs out every other phone.
 */

export const ACCESS_TOKEN_MINUTES = 15;
export const IDLE_LIMIT_DAYS = 60;
export const MAX_SESSION_DAYS = 365;
export const REAUTH_WINDOW_MINUTES = 10;

const DAY = 24 * 3600 * 1000;

export interface SessionClock {
  /** When this phone signed in (ms). */
  startedAt: number;
  /** Last time the app was opened while signed in (ms). */
  lastActiveAt: number;
}

export type SessionState = 'active' | 'idle_expired' | 'max_expired';

export function sessionState(clock: SessionClock, now = Date.now()): SessionState {
  if (now - clock.startedAt >= MAX_SESSION_DAYS * DAY) return 'max_expired';
  if (now - clock.lastActiveAt >= IDLE_LIMIT_DAYS * DAY) return 'idle_expired';
  return 'active';
}

/** The app was opened: restart the idle clock. */
export function touchSession<T extends SessionClock>(clock: T, now = Date.now()): T {
  return { ...clock, lastActiveAt: Math.max(clock.lastActiveAt, now) };
}

/** Does a sensitive action need the password again? */
export function needsReauth(lastPasswordAt: number | null, now = Date.now()): boolean {
  return lastPasswordAt == null || now - lastPasswordAt > REAUTH_WINDOW_MINUTES * 60 * 1000;
}

/** Shown on the welcome screen after an automatic sign-out. */
export function signedOutMessage(state: SessionState): string | null {
  if (state === 'idle_expired') return `You were signed out after ${IDLE_LIMIT_DAYS} days away. Sign in to pick up where you left off.`;
  if (state === 'max_expired') return 'For your security, please sign in again.';
  return null;
}
