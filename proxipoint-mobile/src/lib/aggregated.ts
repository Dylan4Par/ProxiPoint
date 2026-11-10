/**
 * Aggregated events: listings ProxiPoint gathers from public sources (venue sites, calendars),
 * not posted by a user. Pure (no React), so the server uses the same rules.
 *
 * - They're listed by @LocalRadar, ProxiPoint's own listings account, never by the venue: the
 *   venue didn't post them, so the app doesn't say it did.
 * - Each one links to its venue's page. If the venue hasn't claimed ProxiPoint yet, that page is
 *   a "ghost": unclaimed, Tier 1, unverified, with a neutral description and a Claim button.
 * - They're flagged source: 'external' (is_aggregated in PostgreSQL), shown with a "via
 *   LocalRadar" tag and their own pin color, and left out of real-engagement analytics.
 */

export const LOCALRADAR_HANDLE = '@LocalRadar';
export const LOCALRADAR_NAME = 'LocalRadar';

/**
 * Who listed a gathered event: @LocalRadar, or another listings account (e.g. @boulderdowntown,
 * shown by its display name "BoulderDowntown.com", since handles can't hold a site name).
 */
export interface Lister {
  host?: string | null;
  hostName?: string | null;
}

/** The lister's handle ('@LocalRadar' unless another listings account listed it). */
export function listerHandle(node: Lister | null | undefined): string {
  const handle = node?.host?.trim();
  return handle && handle.toLowerCase() !== LOCALRADAR_HANDLE.toLowerCase() ? handle : LOCALRADAR_HANDLE;
}

/** The lister's name for "via …" and "Listed by …": its display name, else its handle. */
export function listerName(node: Lister | null | undefined): string {
  const handle = listerHandle(node);
  if (handle === LOCALRADAR_HANDLE) return LOCALRADAR_NAME;
  return node?.hostName?.trim() || handle;
}

/**
 * After "Listed by" on the details: '@LocalRadar', or the listings account's name as an @-label
 * ('@BoulderDowntown.com'); tapping it opens the account's page by its real handle.
 */
export function listedByLabel(node: Lister | null | undefined): string {
  const name = listerName(node);
  if (name === LOCALRADAR_NAME) return LOCALRADAR_HANDLE;
  return name.startsWith('@') ? name : `@${name}`;
}

/** "via LocalRadar" / "via BoulderDowntown.com" on cards. */
export function viaTag(node: Lister | null | undefined): string {
  return `via ${listerName(node)}`;
}

/** 'user': posted by someone on ProxiPoint. 'external': gathered from a public source. */
export type PointSource = 'user' | 'external';

/** Venue page tiers: 1 = ghost (unclaimed), 2 = claimed, 3 = claimed and verified. */
export type VenueTier = 1 | 2 | 3;

export interface Sourced {
  source?: PointSource | null;
  host?: string | null;
}

export function isAggregated(node: Sourced | null | undefined): boolean {
  return node?.source === 'external';
}

/** Only real users' Points count for engagement analytics. */
export function countsForAnalytics(node: Sourced | null | undefined): boolean {
  return !isAggregated(node);
}

/**
 * A venue page handle from its name: "The Rusty Anchor" → "@therustyanchor". Parentheses are
 * dropped ("Boulder Creek Pavilion (east lawn)" → "@bouldercreekpavilion"), and it fits the
 * 3–20 character handle rule.
 */
export function venueHandleFor(name: string): string {
  const slug = deaccent(name.replace(/\(.*?\)/g, ''))
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20);
  return `@${slug.length >= 3 ? slug : `${slug}venue`.slice(0, 20)}`;
}

/** Common accents to plain letters (String.normalize isn't reliable on every phone's JS engine). */
const ACCENTS: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a', ç: 'c', è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i', ñ: 'n', ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o', ù: 'u',
  ú: 'u', û: 'u', ü: 'u', ý: 'y', ÿ: 'y',
};
function deaccent(text: string): string {
  return text.replace(/[^\x00-\x7f]/g, (ch) => ACCENTS[ch.toLowerCase()] ?? ch);
}

/** Short tag on cards and the details sheet. */
export const AGGREGATED_TAG = `via ${LOCALRADAR_NAME}`;

/** Ghost venue page description (neutral: the venue didn't write it). */
export function ghostVenueBio(venueName: string): string {
  return `Unclaimed venue page. Events at ${venueName} are listed by ${LOCALRADAR_HANDLE} from public sources. Own or run ${venueName}? Claim this page to post your own events.`;
}

/** "Listed by @LocalRadar" line, plus the venue part when there is one. */
export function attributionLine(venueName?: string | null, claimed = false): string {
  if (!venueName) return `Listed by ${LOCALRADAR_HANDLE}`;
  return `Listed by ${LOCALRADAR_HANDLE} · at ${venueName}${claimed ? '' : ' (unclaimed)'}`;
}
