/**
 * Keeps the access token fresh. The server's access tokens last 15 minutes; the refresh token is
 * swapped for a new one on every refresh, and handing the server an already-swapped refresh token
 * ends that phone's session (it looks like a copied token). So:
 *
 * - Refresh a minute before the access token runs out, not after a request fails.
 * - Only ONE refresh at a time: callers that arrive while one is running wait for it and share
 *   its result, so the same refresh token is never sent twice.
 * - Save the new pair before anyone uses it, so a crash right after can't strand the old one.
 * - If the server refuses the refresh token, the phone is signed out; if it can't be reached,
 *   keep the session (the old access token, while it lasts) and try again on the next call.
 *
 * Pure (no React Native), so it's tested in tokenKeeper.test.ts.
 */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** When the access token runs out (ms since epoch). */
  expiresAt: number;
}

/** Refresh this long before the access token runs out. */
export const REFRESH_EARLY_MS = 60 * 1000;

export interface TokenKeeperDeps<S extends TokenPair> {
  /** The session as it is right now (null when signed out). */
  current: () => S | null;
  /** Swap the refresh token for a new session (the server's POST /v1/auth/refresh). */
  refresh: (session: S) => Promise<S>;
  /** Save and use a refreshed session. */
  save: (session: S) => Promise<void>;
  /** The server refused the refresh token: sign this phone out. */
  signOut: () => Promise<void>;
  /** True when an error means the server refused the token (vs. couldn't be reached). */
  isRefused: (error: unknown) => boolean;
  now?: () => number;
}

export interface TokenKeeper {
  /**
   * A usable access token, refreshing first when it's about to run out (or when `force`, after
   * the server said the token was no good). Null when signed out. Throws only when a refresh is
   * needed, the server can't be reached and the old token has already run out.
   */
  accessToken: (options?: { force?: boolean }) => Promise<string | null>;
}

export function createTokenKeeper<S extends TokenPair>(deps: TokenKeeperDeps<S>): TokenKeeper {
  const now = deps.now ?? Date.now;
  let running: Promise<string | null> | null = null;

  const runRefresh = async (session: S): Promise<string | null> => {
    try {
      const next = await deps.refresh(session);
      // Signed out, or signed in again, while this was running: that session wins.
      if (deps.current()?.refreshToken !== session.refreshToken) return deps.current()?.accessToken ?? null;
      await deps.save(next);
      return next.accessToken;
    } catch (error) {
      if (deps.isRefused(error)) {
        if (deps.current()?.refreshToken === session.refreshToken) await deps.signOut();
        return null;
      }
      // Couldn't reach the server: the old token is still fine if it hasn't run out.
      if (session.expiresAt > now()) return session.accessToken;
      throw error;
    }
  };

  return {
    accessToken: async ({ force = false } = {}) => {
      if (running) return running;
      const session = deps.current();
      if (!session) return null;
      if (!force && session.expiresAt - REFRESH_EARLY_MS > now()) return session.accessToken;
      running = runRefresh(session).finally(() => {
        running = null;
      });
      return running;
    },
  };
}

/** Tokens made by the app's on-phone stand-in (before real accounts) start with these. */
export function isStandInSession(session: TokenPair): boolean {
  return session.accessToken.startsWith('local_') || session.refreshToken.startsWith('localr_');
}
