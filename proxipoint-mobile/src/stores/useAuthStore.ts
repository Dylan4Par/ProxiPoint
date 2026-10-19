import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { MyProfile } from '../lib/myProfile';
import {
  completeOnboarding,
  signOut as serverSignOut,
  type AuthSession,
  type OnboardingProfile,
} from '../services/authApi';

/**
 * Who's signed in, and whether they've finished onboarding. Saved on the phone so the app opens
 * straight to Discover next time.
 *
 * Note: the session sits in AsyncStorage for now. Move the tokens to expo-secure-store (Keychain /
 * Keystore) with the next dev-client build, since it's a native module.
 */

export type AuthStatus = 'loading' | 'signedOut' | 'onboarding' | 'signedIn';

const SESSION_KEY = 'pp.auth.session.v1';
const SEED_KEY = 'pp.auth.profileSeed.v1';

/** What onboarding chose, for the Profile and Settings screens to start from. */
export interface ProfileSeed {
  profile: Partial<MyProfile>;
  notifications: boolean;
}

interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  seed: ProfileSeed | null;
  /** Read the saved session (once, at launch). */
  hydrate: () => Promise<void>;
  /** After sign-up or sign-in. */
  setSession: (session: AuthSession) => Promise<void>;
  /** Save onboarding to the account, then open the app. Throws AuthError (e.g. handle_taken). */
  finishOnboarding: (profile: OnboardingProfile) => Promise<void>;
  signOut: () => Promise<void>;
}

const statusFor = (session: AuthSession | null): AuthStatus =>
  !session ? 'signedOut' : session.account.onboarded ? 'signedIn' : 'onboarding';

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

  hydrate: async () => {
    const [session, seed] = await Promise.all([readJson<AuthSession>(SESSION_KEY), readJson<ProfileSeed>(SEED_KEY)]);
    set({ session, seed, status: statusFor(session) });
  },

  setSession: async (session) => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)).catch(() => undefined);
    set({ session, status: statusFor(session) });
  },

  finishOnboarding: async (profile) => {
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
    await Promise.all([AsyncStorage.removeItem(SESSION_KEY), AsyncStorage.removeItem(SEED_KEY)]).catch(() => undefined);
    set({ session: null, seed: null, status: 'signedOut' });
    await serverSignOut(session);
  },
}));
