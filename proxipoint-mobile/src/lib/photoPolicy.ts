/**
 * Community photo rules: the text, which version the user agreed to, and the one-time
 * agreement shown before their first photo upload (any photo: Point cover, profile photo,
 * banner, recap photos).
 *
 * The agreement is kept in memory for now. Server side later: store { policyVersion, acceptedAt }
 * on the user (e.g. PATCH /me) and send the version with every upload so the server can refuse
 * uploads from accounts that haven't accepted the current rules.
 */

/** Bump when the rules change in a way people should re-accept. */
export const PHOTO_POLICY_VERSION = 1;
export const PHOTO_POLICY_UPDATED = 'October 2026';
/** Placeholder: replace with your real support address before release. */
export const SUPPORT_EMAIL = 'support@proxipoint.app';

export interface PolicySection {
  title: string;
  points: string[];
}

/** Short version, shown in the agreement before the first upload. */
export const PHOTO_RULES_SUMMARY: string[] = [
  'Only post photos you took or have the right to share.',
  'No nudity, sexual content, graphic violence, hate or harassment.',
  'Anything sexualizing minors is removed and reported to authorities.',
  'Don’t reveal someone’s home, private address or personal documents.',
  'Ask before posting close-ups of people, and ask a parent before posting kids.',
];

/** Full rules, shown on the Photo rules page. */
export const PHOTO_POLICY_SECTIONS: PolicySection[] = [
  {
    title: 'What these rules cover',
    points: [
      'Every photo you add to ProxiPoint: Point cover photos, your profile photo and banner, and recap photos.',
    ],
  },
  {
    title: 'Allowed',
    points: [
      'Photos you took, or have permission to share.',
      'Events, places, food, crowds and people who are happy to be in the shot.',
    ],
  },
  {
    title: 'Not allowed',
    points: [
      'Nudity or sexual content of any kind.',
      'Any content that sexualizes or endangers minors. We remove it, ban the account and report it to the authorities.',
      'Graphic violence, gore, self-harm or cruelty to animals.',
      'Hate symbols, slurs, threats, bullying or harassment.',
      'Illegal goods, drugs or dangerous activity.',
      'Spam, ads or misleading images.',
      'Other people’s photos, artwork or logos you don’t have the rights to.',
    ],
  },
  {
    title: 'Privacy',
    points: [
      'Don’t post photos that show where someone lives, or their private address.',
      'Don’t post IDs, documents, license plates or screenshots of private messages.',
      'Ask before posting close-ups of people, and take a photo down if someone asks you to.',
      'Ask a parent or guardian before posting photos of children.',
      'ProxiPoint removes hidden location data (GPS) from photos when they’re uploaded.',
    ],
  },
  {
    title: 'Reporting and blocking',
    points: [
      'Use Report on any photo or recap that breaks these rules. Reported content is hidden for you right away and reviewed.',
      'Block someone to stop seeing their Points and recaps.',
    ],
  },
  {
    title: 'What happens when rules are broken',
    points: [
      'The photo is removed.',
      'Repeat or serious problems can mean an upload ban or a suspended account.',
      'Illegal content is reported to law enforcement where the law requires it.',
    ],
  },
];

// ---------------------------------------------------------------------------
// State: agreement + requests for the UI host (PhotoPolicyHost) to show things.
// ---------------------------------------------------------------------------

export interface PhotoPolicyState {
  acceptedVersion: number | null;
  acceptedAt: string | null;
  /** The one-time agreement is open, waiting for the user. */
  agreementOpen: boolean;
  /** The full rules page is open. */
  policyOpen: boolean;
}

let state: PhotoPolicyState = {
  acceptedVersion: null,
  acceptedAt: null,
  agreementOpen: false,
  policyOpen: false,
};
const listeners = new Set<() => void>();
let pending: Array<(accepted: boolean) => void> = [];

function setState(next: Partial<PhotoPolicyState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function getPhotoPolicyState(): PhotoPolicyState {
  return state;
}

export function subscribePhotoPolicy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasAcceptedPhotoPolicy(): boolean {
  return state.acceptedVersion === PHOTO_POLICY_VERSION;
}

/**
 * Call before opening any photo picker. Resolves true straight away if the current rules were
 * already accepted; otherwise shows the agreement and resolves with the user's answer.
 */
export function ensurePhotoPolicyAccepted(): Promise<boolean> {
  if (hasAcceptedPhotoPolicy()) return Promise.resolve(true);
  return new Promise((resolve) => {
    pending.push(resolve);
    setState({ agreementOpen: true });
  });
}

function settle(accepted: boolean) {
  const waiting = pending;
  pending = [];
  waiting.forEach((resolve) => resolve(accepted));
}

export function acceptPhotoPolicy() {
  setState({
    acceptedVersion: PHOTO_POLICY_VERSION,
    acceptedAt: new Date().toISOString(),
    agreementOpen: false,
  });
  // Server side: PATCH /me { photoPolicyVersion, photoPolicyAcceptedAt }
  settle(true);
}

export function declinePhotoPolicy() {
  setState({ agreementOpen: false });
  settle(false);
}

export function openPhotoPolicy() {
  setState({ policyOpen: true });
}

export function closePhotoPolicy() {
  setState({ policyOpen: false });
}
