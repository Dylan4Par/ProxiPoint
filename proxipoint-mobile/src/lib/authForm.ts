/**
 * Rules for the sign-up, sign-in and onboarding forms. Pure (no React), so the server can check
 * the same things: the app's checks are for quick feedback, the server's are the real ones.
 */

// ---- Email ----------------------------------------------------------------------------------

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Loose on purpose: something@something.tld, no spaces. The confirmation email is the real test. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
}

// ---- Password -------------------------------------------------------------------------------

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export interface PasswordCheck {
  id: 'length' | 'letter' | 'number' | 'notEmail';
  label: string;
  ok: boolean;
}

/** The checklist shown under the password field as you type. */
export function passwordChecks(password: string, email = ''): PasswordCheck[] {
  const local = normalizeEmail(email).split('@')[0];
  return [
    { id: 'length', label: `At least ${PASSWORD_MIN} characters`, ok: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX },
    { id: 'letter', label: 'A letter', ok: /[a-z]/i.test(password) },
    { id: 'number', label: 'A number or symbol', ok: /[^a-z\s]/i.test(password) },
    {
      id: 'notEmail',
      label: 'Not your email',
      ok: !password || local.length < 3 || !password.toLowerCase().includes(local),
    },
  ];
}

export function isValidPassword(password: string, email = ''): boolean {
  return passwordChecks(password, email).every((check) => check.ok);
}

export type PasswordStrength = 'weak' | 'okay' | 'strong';

/** A rough meter: length and variety. Only shown once the password passes the checks. */
export function passwordStrength(password: string): PasswordStrength {
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-z0-9]/i].filter((re) => re.test(password)).length;
  if (password.length >= 16 && kinds >= 3) return 'strong';
  if (password.length >= 12 && kinds >= 2) return 'okay';
  if (password.length >= PASSWORD_MIN && kinds >= 3) return 'okay';
  return 'weak';
}

// ---- Handle ---------------------------------------------------------------------------------

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

/** Handles nobody can take (staff, the brand, and words people would mistake for the app). */
export const RESERVED_HANDLES = [
  'admin',
  'administrator',
  'support',
  'help',
  'proxipoint',
  'callsign',
  'callsignsolutions',
  'moderator',
  'mod',
  'staff',
  'official',
  'system',
  'root',
  'me',
  'everyone',
  'here',
];

/** "@Sam Rivera!" → "samrivera". Letters, numbers, _ and - only, lower case, no @. */
export function cleanHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, HANDLE_MAX);
}

/** Why a handle can't be used, or null when it's fine (taken-or-not is the server's call). */
export function handleProblem(raw: string): string | null {
  const handle = cleanHandle(raw);
  if (handle.length < HANDLE_MIN) return `At least ${HANDLE_MIN} characters`;
  if (!/^[a-z0-9]/.test(handle)) return 'Start with a letter or number';
  if (/[_-]{2,}/.test(handle)) return 'No double _ or -';
  if (RESERVED_HANDLES.includes(handle.replace(/[_-]/g, ''))) return 'That one’s reserved';
  return null;
}

/** A starting handle from a name: "Sam Rivera" → "samrivera" (or the email's first part). */
export function suggestHandle(displayName: string, email = ''): string {
  const fromName = cleanHandle(displayName.replace(/[^a-z0-9]/gi, ''));
  if (fromName.length >= HANDLE_MIN) return fromName;
  const fromEmail = cleanHandle(normalizeEmail(email).split('@')[0].replace(/[^a-z0-9]/gi, ''));
  return fromEmail.length >= HANDLE_MIN ? fromEmail : '';
}

// ---- Display name ---------------------------------------------------------------------------

export const NAME_MAX = 40;

export function cleanDisplayName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trimStart().slice(0, NAME_MAX);
}

export function isValidDisplayName(raw: string): boolean {
  return cleanDisplayName(raw).trim().length >= 1;
}

// ---- Onboarding -----------------------------------------------------------------------------

export type OnboardingStep = 'profile' | 'home' | 'interests' | 'privacy';

export const ONBOARDING_STEPS: Array<{ id: OnboardingStep; title: string; optional: boolean }> = [
  { id: 'profile', title: 'Your name', optional: false },
  { id: 'home', title: 'Your area', optional: true },
  { id: 'interests', title: 'What you’re into', optional: true },
  { id: 'privacy', title: 'Your privacy', optional: false },
];

/** #tags offered on the interests step (any can be skipped; more can be added later). */
export const STARTER_INTERESTS = [
  '#LiveMusic',
  '#FoodTrucks',
  '#FarmersMarket',
  '#Hiking',
  '#RunClub',
  '#Cycling',
  '#Coffee',
  '#TriviaNight',
  '#Comedy',
  '#Art',
  '#Yoga',
  '#Dogs',
  '#Family',
  '#Sports',
  '#Volunteering',
  '#Nightlife',
];

/** Turn an interest on or off, never past `limit`. */
export function toggleInterest(tags: string[], tag: string, limit: number): string[] {
  const key = tag.toLowerCase();
  if (tags.some((t) => t.toLowerCase() === key)) return tags.filter((t) => t.toLowerCase() !== key);
  return tags.length >= limit ? tags : [...tags, tag];
}

// ---- Server errors --------------------------------------------------------------------------

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_taken'
  | 'handle_taken'
  | 'weak_password'
  | 'rate_limited'
  | 'network'
  | 'unknown';

/** What to tell people. Sign-in never says whether the email exists. */
export function authErrorMessage(code: AuthErrorCode): string {
  switch (code) {
    case 'invalid_credentials':
      return 'That email and password don’t match.';
    case 'email_taken':
      return 'There’s already an account with that email. Try signing in.';
    case 'handle_taken':
      return 'That handle is taken. Try another.';
    case 'weak_password':
      return 'Pick a stronger password.';
    case 'rate_limited':
      return 'Too many tries. Wait a minute and try again.';
    case 'network':
      return 'Can’t reach ProxiPoint. Check your connection.';
    default:
      return 'Something went wrong. Try again.';
  }
}
