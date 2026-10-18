/**
 * The signed-in user's profile, as the Profile and Settings screens need it.
 * Kept in memory for now (DiscoverScreen holds it); load and save it through the backend
 * (e.g. GET/PATCH /me) once sign-in exists.
 */
export interface MyProfile {
  displayName: string;
  /** "@ranger-f0a5accf"-style handle others invite you by. */
  handle: string;
  avatarUri: string | null;
  /** Wide 16:9 image across the top of the Profile page. Null = the dot pattern. */
  bannerUri: string | null;
  /** Short "about me" shown on the Profile page. Empty = not set. */
  bio: string;
  followers: number;
  following: number;
  /** #tags you're into, e.g. ['#LiveMusic', '#FoodTrucks']. New Points and Boosts with them show in Activity. */
  interestTags: string[];
  /** True: shown on your public profile. False: only you see them (alerts work either way). */
  interestTagsPublic: boolean;
  /** Your home city. Null = the app's default area until you pick one. */
  homeCity: { name: string; region?: string; latitude: number; longitude: number } | null;
  /** True: Discover follows your GPS. False: Discover opens on your home city. */
  trackLocation: boolean;
}

/** Most #tags you can follow. */
export const INTEREST_TAG_LIMIT = 10;

export const DEFAULT_PROFILE: MyProfile = {
  displayName: 'Ranger-F0A5ACCF',
  handle: '@ranger-f0a5accf',
  avatarUri: null,
  bannerUri: null,
  bio: '',
  followers: 0,
  following: 0,
  interestTags: [],
  interestTagsPublic: false,
  homeCity: null,
  trackLocation: false,
};

export const BIO_CHAR_LIMIT = 160;
/** Most lines a bio can have (so it can't be stretched into a wall of blank space). */
export const BIO_MAX_LINES = 5;

/**
 * Keeps a bio within the limits while typing: at most BIO_MAX_LINES lines, never two blank
 * lines in a row, and BIO_CHAR_LIMIT characters. Extra line breaks are simply ignored.
 */
export function limitBio(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const blank = line.trim() === '';
    const prevBlank = kept.length > 0 && kept[kept.length - 1].trim() === '';
    if (blank && prevBlank) continue; // no double blank lines
    if (kept.length < BIO_MAX_LINES) kept.push(line);
    else if (!blank) {
      // Past the limit: keep the words on the last line, drop the extra break.
      const last = kept[kept.length - 1];
      kept[kept.length - 1] = last.trim() === '' ? line : `${last} ${line}`;
    }
  }
  return kept.join('\n').slice(0, BIO_CHAR_LIMIT);
}

export function profileInitial(profile: Pick<MyProfile, 'displayName'>): string {
  return profile.displayName.trim().charAt(0).toUpperCase() || '•';
}

/** App and privacy choices from Settings. In memory for now; save with the profile later. */
export interface MySettings {
  notifications: boolean;
  units: 'metric' | 'imperial';
  hideExactLocationByDefault: boolean;
  findableByHandle: boolean;
  /** Contact details for your public profile's Contact button. Empty = not shared. */
  contactEmail: string;
  contactPhone: string;
  /** True: anyone can see them. False: people send a request and you choose who gets them. */
  contactPublic: boolean;
}

export const DEFAULT_SETTINGS: MySettings = {
  notifications: true,
  units: 'metric',
  hideExactLocationByDefault: false,
  findableByHandle: true,
  contactEmail: '',
  contactPhone: '',
  contactPublic: false,
};
