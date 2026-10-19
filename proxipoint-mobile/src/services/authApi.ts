import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEGAL_VERSION } from '../lib/legal';
import {
  RESERVED_HANDLES,
  cleanHandle,
  isValidPassword,
  normalizeEmail,
  type AuthErrorCode,
} from '../lib/authForm';

/**
 * Accounts: sign up, sign in, password reset, handle checks and finishing onboarding.
 *
 * With EXPO_PUBLIC_AUTH_URL set, these call the backend (see "Accounts and sign-in" in the
 * Channels & Posts Backend Spec). Without it, a LOCAL STAND-IN keeps accounts on this phone so
 * the screens can be built and tested before the server has the endpoints. The stand-in is for
 * development only: it is not secure and nothing leaves the device.
 */

export const AUTH_URL: string = (process.env.EXPO_PUBLIC_AUTH_URL ?? '').replace(/\/+$/, '');
export const usingLocalAuth = !AUTH_URL;

export interface AuthAccount {
  userId: string;
  email: string;
  /** Null until onboarding picks one. */
  handle: string | null;
  displayName: string | null;
  onboarded: boolean;
  /** Version of the Terms / Privacy / Guidelines agreed to (see lib/legal.ts), and when. */
  termsVersion?: string | null;
  termsAcceptedAt?: string | null;
}

export interface AuthSession {
  account: AuthAccount;
  accessToken: string;
  refreshToken: string;
  /** When the access token runs out (ms since epoch). */
  expiresAt: number;
}

/** What onboarding saves to the account. */
export interface OnboardingProfile {
  displayName: string;
  handle: string;
  homeCity: { name: string; region?: string; latitude: number; longitude: number } | null;
  interestTags: string[];
  trackLocation: boolean;
  countMeInInterests: boolean;
  notifications: boolean;
}

export class AuthError extends Error {
  code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AuthError';
    this.code = code;
  }
}

// ---- Backend ------------------------------------------------------------------------------

async function call<T>(path: string, body: unknown, token?: string, method = 'POST'): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${AUTH_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    throw new AuthError('network');
  }
  if (response.status === 429) throw new AuthError('rate_limited');
  const data = (await response.json().catch(() => ({}))) as { error?: AuthErrorCode } & T;
  if (!response.ok) throw new AuthError(data.error ?? (response.status === 401 ? 'invalid_credentials' : 'unknown'));
  return data;
}

// ---- Local stand-in -----------------------------------------------------------------------

const LOCAL_ACCOUNTS_KEY = 'pp.auth.localAccounts.v1';

interface LocalAccount extends AuthAccount {
  /** Not a real password hash: the stand-in only has to tell passwords apart on one phone. */
  check: string;
}

function weakDigest(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b + text.charCodeAt(i), 0x5bd1e995) >>> 0;
  }
  return `${a.toString(16)}${b.toString(16)}`;
}

const randomId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

async function loadLocal(): Promise<Record<string, LocalAccount>> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LocalAccount>) : {};
  } catch {
    return {};
  }
}

async function saveLocal(accounts: Record<string, LocalAccount>): Promise<void> {
  await AsyncStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function localSession(account: LocalAccount): AuthSession {
  const { check: _check, ...pub } = account;
  return {
    account: pub,
    accessToken: randomId('local'),
    refreshToken: randomId('localr'),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };
}

/** A short pause so the stand-in feels like a network call (spinners, disabled buttons). */
const pause = () => new Promise((resolve) => setTimeout(resolve, 450));

// ---- API ----------------------------------------------------------------------------------

/**
 * `acceptedTermsVersion` must be the current LEGAL_VERSION: the person ticked "I agree" to the
 * Terms, Privacy Policy and Community Guidelines (and confirmed their age) on this screen.
 */
export async function signUp(emailRaw: string, password: string, acceptedTermsVersion: string): Promise<AuthSession> {
  const email = normalizeEmail(emailRaw);
  if (acceptedTermsVersion !== LEGAL_VERSION) throw new AuthError('terms_required');
  if (!isValidPassword(password, email)) throw new AuthError('weak_password');
  if (!usingLocalAuth) return call<AuthSession>('/v1/auth/signup', { email, password, acceptedTermsVersion });
  await pause();
  const accounts = await loadLocal();
  if (accounts[email]) throw new AuthError('email_taken');
  const account: LocalAccount = {
    userId: randomId('usr'),
    email,
    handle: null,
    displayName: null,
    onboarded: false,
    termsVersion: acceptedTermsVersion,
    termsAcceptedAt: new Date().toISOString(),
    check: weakDigest(`${email}:${password}`),
  };
  await saveLocal({ ...accounts, [email]: account });
  return localSession(account);
}

export async function signIn(emailRaw: string, password: string): Promise<AuthSession> {
  const email = normalizeEmail(emailRaw);
  if (!usingLocalAuth) return call<AuthSession>('/v1/auth/signin', { email, password });
  await pause();
  const account = (await loadLocal())[email];
  if (!account || account.check !== weakDigest(`${email}:${password}`)) throw new AuthError('invalid_credentials');
  return localSession(account);
}

/** Always "sent", whether or not the email has an account (so it can't be used to look people up). */
export async function requestPasswordReset(emailRaw: string): Promise<void> {
  const email = normalizeEmail(emailRaw);
  if (!usingLocalAuth) {
    await call('/v1/auth/password/reset', { email });
    return;
  }
  await pause();
}

/** Is this handle free? (Format problems are checked first with handleProblem.) */
export async function handleAvailable(raw: string, mine?: string | null): Promise<boolean> {
  const handle = cleanHandle(raw);
  if (mine && cleanHandle(mine) === handle) return true;
  if (!usingLocalAuth) {
    const data = await call<{ available: boolean }>(`/v1/handles/${encodeURIComponent(handle)}/available`, null, undefined, 'GET');
    return data.available;
  }
  if (RESERVED_HANDLES.includes(handle.replace(/[_-]/g, ''))) return false;
  const accounts = await loadLocal();
  return !Object.values(accounts).some((account) => account.handle === handle);
}

/** Save what onboarding collected; the account is then ready for the app. */
export async function completeOnboarding(session: AuthSession, profile: OnboardingProfile): Promise<AuthAccount> {
  const handle = cleanHandle(profile.handle);
  if (!usingLocalAuth) {
    const data = await call<{ account: AuthAccount }>('/v1/me/onboarding', { ...profile, handle }, session.accessToken);
    return data.account;
  }
  await pause();
  const accounts = await loadLocal();
  const account = accounts[session.account.email];
  if (!account) throw new AuthError('unknown');
  if (Object.values(accounts).some((other) => other.userId !== account.userId && other.handle === handle)) {
    throw new AuthError('handle_taken');
  }
  const next: LocalAccount = { ...account, handle, displayName: profile.displayName.trim(), onboarded: true };
  await saveLocal({ ...accounts, [account.email]: next });
  const { check: _check, ...pub } = next;
  return pub;
}

/** Ends this session on the server (the app forgets it either way). */
export async function signOut(session: AuthSession | null): Promise<void> {
  if (!session || usingLocalAuth) return;
  try {
    await call('/v1/auth/signout', { refreshToken: session.refreshToken }, session.accessToken);
  } catch {
    // Signed out locally regardless; the server session expires on its own.
  }
}
