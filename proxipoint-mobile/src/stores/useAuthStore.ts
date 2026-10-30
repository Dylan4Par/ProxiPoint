import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { MyProfile } from '../lib/myProfile';
import { sessionState, signedOutMessage, touchSession, type SessionClock } from '../lib/sessionPolicy';
import {
  completeOnboarding,
  signOut as serverSignOut,
  type AuthSession,
  type OnboardingProfile,
} from '../services/authApi';

/**
 * Who's signed in, and whether they've finished onboarding. Saved on the phone so the app opens
 * straight to Discover next time. How long that lasts is in lib/sessionPolicy.ts: signed in as
 * long as the app is opened at least every 60 days, for up to a year per phone.
 *
 * Note: the session sits in AsyncStorage for now. Move the tokens to expo-secure-store (Keychain /
 * Keystore) with the next dev-client build, since it's a native module.
 */

export type AuthStatus = 'loading' | 'signedOut' | 'onboarding' | 'signedIn';

const SESSION_KEY = 'pp.auth.session.v1';
const CLOCK_KEY = 'pp.auth.clock.v1';
const SEED_KEY = 'pp.auth.profileSeed.v1';

/** What onboarding chose, for the Profile and Settings screens to start from. */
export interface ProfileSeed {
  profile: Partial<MyProfile>;
  notifications: boolean;
}

/** When this phone signed in, was last opened, and last had the password typed in. */
export interface StoredClock extends SessionClock {
  lastPasswordAt: number | null;
}

interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  seed: ProfileSeed | null;
  clock: StoredClock | null;
  /** Why the app signed someone out on its own (60 days away, a year on this phone), for Welcome. */
  notice: string | null;
  /** Read the saved session (once, at launch). */
  hydrate: () => Promise<void>;
  /** After sign-up or sign-in. */
  setSession: (session: AuthSession) => Promise<void>;
  /**
   * Save onboarding to the account, then open the app. Throws AuthError (e.g. handle_taken).
   * The photo stays on the phone for now (upload + PATCH /me once the backend takes photos).
   */
  finishOnboarding: (profile: OnboardingProfile, avatarUri?: string | null) => Promise<void>;
  signOut: () => Promise<void>;
}

const statusFor = (session: AuthSession | null): AuthStatus =>
  !session ? 'signedOut' : session.account.onboarded ? 'signedIn' : 'onboarding';

async function clearSaved(): Promise<void> {
  await Promise.all([SESSION_KEY, SEED_KEY, CLOCK_KEY].map((key) => AsyncStorage.removeItem(key))).catch(() => undefined);
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  session: null,
  seed: null,
  clock: null,
  notice: null,

  hydrate: async () => {
    const [session, seed, savedClock] = await Promise.all([
      readJson<AuthSession>(SESSION_KEY),
      readJson<ProfileSeed>(SEED_KEY),
      readJson<StoredClock>(CLOCK_KEY),
    ]);
    if (!session) {
      set({ session: null, seed, clock: null, status: 'signedOut' });
      return;
    }
    // Sessions saved before the clock existed start it now.
    const now = Date.now();
    const clock: StoredClock = savedClock ?? { startedAt: now, lastActiveAt: now, lastPasswordAt: null };
    const state = sessionState(clock, now);
    if (state !== 'active') {
      await clearSaved();
      set({ session: null, seed: null, clock: null, status: 'signedOut', notice: signedOutMessage(state) });
      return;
    }
    const touched = touchSession(clock, now);
    await AsyncStorage.setItem(CLOCK_KEY, JSON.stringify(touched)).catch(() => undefined);
    set({ session, seed, clock: touched, status: statusFor(session) });
  },

  setSession: async (session) => {
    const now = Date.now();
    // Signing in or up means the password was just typed.
    const clock: StoredClock = { startedAt: now, lastActiveAt: now, lastPasswordAt: now };
    await Promise.all([
      AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)),
      AsyncStorage.setItem(CLOCK_KEY, JSON.stringify(clock)),
    ]).catch(() => undefined);
    set({ session, clock, notice: null, status: statusFor(session) });
  },

  finishOnboarding: async (profile, avatarUri = null) => {
    const session = get().session;
    if (!session) return;
    const account = await completeOnboarding(session, profile);
    const next: AuthSession = { ...session, account };
    const seed: ProfileSeed = {
      profile: {
        displayName: profile.displayName.trim(),
        handle: `@${account.handle ?? profile.handle}`,
        homeCity: profile.homeCity,
        interestTags: profile.interestTags,
        trackLocation: profile.trackLocation,
        countMeInInterests: profile.countMeInInterests,
        ...(avatarUri ? { avatarUri } : {}),
      },
      notifications: profile.notifications,
    };
    await Promise.all([
      AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next)),
      AsyncStorage.setItem(SEED_KEY, JSON.stringify(seed)),
    ]).catch(() => undefined);
    set({ session: next, seed, status: statusFor(next) });
  },

  signOut: async () => {
    const session = get().session;
    await clearSaved();
    set({ session: null, seed: null, clock: null, notice: null, status: 'signedOut' });
    await serverSignOut(session);
  },
}));
