/**
 * Venue hubs: every place events happen (a bar, a restaurant, a park, an amphitheater, an outdoor
 * mall...) has its own page with what kind of place it is, where it is, its upcoming events and
 * the last 30 days of events. Businesses and organizations can claim their page, through review.
 * Pure (no React) apart from the small claim store at the bottom, so it's unit-tested.
 *
 * Server side: GET /api/v1/venues/{tenant}/{venue} and GET /api/v1/venues/{tenant}?q= on
 * ingest-core (internal/handlers/venues_handler.go), claims in venue_claims (migration 012).
 * The kind rules match ingest's internal/venuekind, with the same test cases.
 */
import { useEffect, useState } from 'react';
import type { LocalPlace, PlaceKind } from './localPlaces';

// ---- Kinds -------------------------------------------------------------------------------------

export type VenueKind =
  | 'bar'
  | 'brewery'
  | 'winery'
  | 'restaurant'
  | 'cafe'
  | 'music_venue'
  | 'theater'
  | 'amphitheater'
  | 'arena'
  | 'park'
  | 'trail'
  | 'plaza'
  | 'outdoor_mall'
  | 'market'
  | 'library'
  | 'community_center'
  | 'school'
  | 'church'
  | 'gym'
  | 'shop'
  | 'gallery'
  | 'museum'
  | 'hotel'
  | 'venue'
  // Places from posts (not venues anyone runs): never claimable.
  | 'intersection'
  | 'block';

export const VENUE_KIND_LABEL: Record<VenueKind, string> = {
  bar: 'Bar',
  brewery: 'Brewery',
  winery: 'Winery',
  restaurant: 'Restaurant',
  cafe: 'Café',
  music_venue: 'Music venue',
  theater: 'Theater',
  amphitheater: 'Amphitheater',
  arena: 'Arena',
  park: 'Park',
  trail: 'Trail',
  plaza: 'Plaza',
  outdoor_mall: 'Outdoor mall',
  market: 'Market',
  library: 'Library',
  community_center: 'Community center',
  school: 'School',
  church: 'Place of worship',
  gym: 'Gym',
  shop: 'Shop',
  gallery: 'Gallery',
  museum: 'Museum',
  hotel: 'Hotel',
  venue: 'Venue',
  intersection: 'Intersection',
  block: 'Block',
};

const PUBLIC_KINDS = new Set<VenueKind>(['park', 'trail', 'plaza']);

export const PUBLIC_SPACE_NOTE =
  'This is a public space. Anyone can host a live pickup game, gathering, or club meetup here!';

// First match wins, so the more specific words come first. Same order as ingest's venuekind.
const RULES: Array<[VenueKind, RegExp]> = [
  ['amphitheater', /amphitheat(er|re)/i],
  ['arena', /arena|stadium|coliseum|event center|events center/i],
  ['outdoor_mall', /\bmall\b|outlets?\b|town cent(er|re)|shops at|promenade|marketplace|\bthe streets at\b/i],
  ['market', /farmers'? market|night market|flea market|\bmarket\b/i],
  ['brewery', /brew(ing|ery|ers|house|pub)|taproom|beer co\b|beer company/i],
  ['winery', /winery|vineyards?|cellars|wine bar|meadery|cidery/i],
  ['library', /library/i],
  ['community_center', /community (center|centre|hall|pantry)|rec(reation)? cent(er|re)|senior cent(er|re)|food bank|\bpantry\b|\bymca\b|grange/i],
  ['trail', /trail(head)?s?\b|greenway|bike path/i],
  ['plaza', /plaza|\bsquare\b|\bcommons\b|piazza|\bthe green\b/i],
  ['park', /\bpark\b|open space|reservoir|state park|\bgardens?\b|\bcourts\b|fields\b|dog park|sports complex/i],
  ['museum', /museum/i],
  ['gallery', /gallery|arts? (center|centre|space|studio)/i],
  ['theater', /theat(er|re)|playhouse|cinema|opera house|performing arts/i],
  ['music_venue', /music hall|ballroom|concert|\bhall\b|lounge & stage|\bstage\b|\bclub\b/i],
  ['bar', /\bbar\b|\bpub\b|tavern|saloon|taphouse|tap house|cocktail|speakeasy|\blounge\b|\binn & tavern\b/i],
  ['cafe', /caf(e\b|é)|coffee|espresso|roasters|tea (house|room)|bakery/i],
  ['restaurant', /restaurant|grill|kitchen|diner|bistro|pizz|taqueria|cantina|eatery|bbq|barbecue|steakhouse|sushi|ramen|burger|tacos?\b|food hall|trattoria/i],
  ['church', /church|chapel|cathedral|temple|synagogue|mosque|parish/i],
  ['school', /school|university|college|academy|campus/i],
  ['gym', /\bgym\b|fitness|crossfit|yoga|climbing|bouldering|pilates|\bdojo\b/i],
  ['hotel', /hotel|\binn\b|resort|\blodge\b|motel/i],
  ['shop', /\bshop\b|\bstore\b|books|records|boutique|outfitters|supply/i],
];

/** What kind of place a venue is, from its name ('venue' when nothing fits). */
export function inferVenueKind(name: string): VenueKind {
  const n = name.trim();
  for (const [kind, re] of RULES) if (re.test(n)) return kind;
  return 'venue';
}

const FROM_PLACE_KIND: Partial<Record<PlaceKind, VenueKind>> = {
  park: 'park',
  trail: 'trail',
  plaza: 'plaza',
  intersection: 'intersection',
  block: 'block',
};

export interface VenueInfo {
  kind: VenueKind;
  label: string;
  publicSpace: boolean;
  /** A business or organization can claim it (not intersections or blocks). */
  claimable: boolean;
}

/** Kind, label, public space and claimability for a place (the server's kind wins when known). */
export function venueInfo(place: Pick<LocalPlace, 'name' | 'kind'> & { venueKind?: string | null; publicSpace?: boolean | null }): VenueInfo {
  const stored = place.venueKind && place.venueKind in VENUE_KIND_LABEL ? (place.venueKind as VenueKind) : null;
  const kind = stored ?? FROM_PLACE_KIND[place.kind] ?? inferVenueKind(place.name);
  return {
    kind,
    label: VENUE_KIND_LABEL[kind],
    publicSpace: place.publicSpace ?? PUBLIC_KINDS.has(kind),
    claimable: kind !== 'intersection' && kind !== 'block',
  };
}

// ---- Events at a venue ---------------------------------------------------------------------------

export const VENUE_PAST_DAYS = 30;

interface TimedNode {
  startsAt?: string;
  endsAt?: string;
}

/** Splits a venue's events into upcoming (soonest first) and ended in the last 30 days (newest first). */
export function splitVenueEvents<T extends TimedNode>(nodes: T[], now = Date.now()): { upcoming: T[]; past: T[] } {
  const since = now - VENUE_PAST_DAYS * 24 * 3600 * 1000;
  const start = (n: T) => (n.startsAt ? new Date(n.startsAt).getTime() : now);
  const end = (n: T) => (n.endsAt ? new Date(n.endsAt).getTime() : Infinity);
  const upcoming = nodes.filter((n) => end(n) > now).sort((a, b) => start(a) - start(b));
  const past = nodes.filter((n) => end(n) <= now && end(n) > since).sort((a, b) => start(b) - start(a));
  return { upcoming, past };
}

/** Merges two lists of events by id (the first list wins). */
export function mergeById<T extends { id: string }>(first: T[], second: T[]): T[] {
  const seen = new Set(first.map((n) => n.id));
  return [...first, ...second.filter((n) => !seen.has(n.id))];
}

// ---- Claims ------------------------------------------------------------------------------------

export type ClaimRole = 'owner' | 'general_manager' | 'event_coordinator' | 'staff';

export const CLAIM_ROLES: Array<{ id: ClaimRole; label: string }> = [
  { id: 'owner', label: 'Owner' },
  { id: 'general_manager', label: 'General Manager' },
  { id: 'event_coordinator', label: 'Event Coordinator' },
  { id: 'staff', label: 'Staff' },
];

/** Consumer email providers: they can't prove you run a venue on their own. */
export const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com',
  'comcast.net', 'att.net', 'verizon.net', 'zoho.com', 'yandex.com', 'hey.com', 'fastmail.com',
]);

export const CLAIM_MIN_ACCOUNT_HOURS = 48;
export const CLAIM_REVIEW_NOTE = 'Claims are reviewed within 24–48 hours to protect local business authenticity.';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split('@')[1] ?? '';
}

/** "www.etown.org" from "https://www.etown.org/events" → "etown.org". */
export function websiteDomain(url: string | null | undefined): string {
  if (!url) return '';
  const host = url.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/?#]/)[0];
  return host.replace(/^www\./, '');
}

export type ClaimMethod = 'email_domain' | 'manual';

/**
 * How a claim gets verified:
 * - email_domain: the work email is at the venue's own domain (or, without a known website, any
 *   business domain): a verification link goes to it, then an admin approves.
 * - manual: a consumer email (gmail, yahoo...) can't prove it, so proof is required (a business
 *   phone, or a license / business card to show the reviewer).
 */
export function claimMethod(workEmail: string, venueWebsite?: string | null): { method: ClaimMethod; domainMatches: boolean } {
  const domain = emailDomain(workEmail);
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return { method: 'manual', domainMatches: false };
  const site = websiteDomain(venueWebsite);
  const domainMatches = Boolean(site) && (domain === site || domain.endsWith(`.${site}`));
  return { method: site && !domainMatches ? 'manual' : 'email_domain', domainMatches };
}

export interface ClaimForm {
  role: ClaimRole | null;
  fullName: string;
  workEmail: string;
  businessPhone: string;
  proofNote: string;
}

/** What's wrong with a claim form, or null. */
export function claimFormProblem(form: ClaimForm, venueWebsite?: string | null): string | null {
  if (!form.role) return 'Pick your role at this venue.';
  if (form.fullName.trim().length < 2) return 'Add your full name.';
  if (!EMAIL_RE.test(form.workEmail.trim())) return 'Add your work or official email.';
  const { method } = claimMethod(form.workEmail, venueWebsite);
  if (method === 'manual' && form.businessPhone.replace(/\D/g, '').length < 10 && form.proofNote.trim().length < 10) {
    return 'With a personal email, add the business phone or tell the reviewer how to confirm you run this venue (a license or business card works).';
  }
  return null;
}

/** Guardrails before the form: account age and one claim in review at a time. */
export function claimBlocker(opts: {
  accountCreatedAt?: string | null;
  myPendingVenueKeys: string[];
  venueKey: string;
  businessOperator?: boolean;
  now?: number;
}): string | null {
  const now = opts.now ?? Date.now();
  if (opts.accountCreatedAt) {
    const hours = (now - new Date(opts.accountCreatedAt).getTime()) / 3600000;
    if (hours < CLAIM_MIN_ACCOUNT_HOURS) {
      const left = Math.ceil(CLAIM_MIN_ACCOUNT_HOURS - hours);
      return `New accounts can claim a venue after 48 hours (about ${left} more ${left === 1 ? 'hour' : 'hours'}).`;
    }
  }
  const others = opts.myPendingVenueKeys.filter((key) => key !== opts.venueKey);
  if (!opts.businessOperator && others.length > 0) {
    return 'You already have a claim in review. One at a time, unless you hold the Business Operator badge (for groups running several venues).';
  }
  return null;
}

export type ClaimStatus = 'unclaimed' | 'pending' | 'claimed';

export interface MyClaim {
  venueKey: string;
  venueName: string;
  role: ClaimRole;
  fullName: string;
  workEmail: string;
  businessPhone: string;
  proofNote: string;
  method: ClaimMethod;
  submittedAt: string;
}

/** The key a venue is known by: the server's id when there is one, else its name. */
export function venueKey(place: { name: string; venueId?: string | null }): string {
  return place.venueId ? `id:${place.venueId}` : `name:${place.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
}

// In memory for now; POST /api/v1/venues/{tenant}/{venue}/claims (signed in) once the auth
// service is up. The server enforces the same rules (migration 012's venue_claims trigger).
let claims: MyClaim[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const getMyClaims = (): MyClaim[] => claims;
export const myClaimFor = (key: string): MyClaim | null => claims.find((claim) => claim.venueKey === key) ?? null;

export function submitClaim(claim: MyClaim): void {
  claims = [...claims.filter((c) => c.venueKey !== claim.venueKey), claim];
  emit();
}

export function withdrawClaim(key: string): void {
  const next = claims.filter((c) => c.venueKey !== key);
  if (next.length === claims.length) return;
  claims = next;
  emit();
}

export function useMyClaims(): MyClaim[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return claims;
}

// ---- Disputes ------------------------------------------------------------------------------------

export type DisputeKind = 'ownership' | 'wrong_details' | 'closed' | 'other';

export const DISPUTE_KINDS: Array<{ id: DisputeKind; label: string }> = [
  { id: 'ownership', label: 'Dispute who claimed it' },
  { id: 'wrong_details', label: 'Wrong details' },
  { id: 'closed', label: 'Closed for good' },
  { id: 'other', label: 'Something else' },
];
