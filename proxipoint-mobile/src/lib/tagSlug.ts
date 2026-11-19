/**
 * Tag slugs: the key every tag is matched by, lowercase words joined by hyphens
 * (^[a-z0-9]+(-[a-z0-9]+)*$, e.g. "live-music", "board-games"). Listed tags keep their labels
 * (#LiveMusic) for display; a tag someone makes up shows its words with capitals
 * ("acoustic-brunch" -> #AcousticBrunch). Same rules as ingest's tags table (migration 013) and
 * GET /api/v1/tags/autocomplete. Pure (no React), so it's unit-tested.
 */
import { HASHTAG_LIST, type HashtagEntry } from './hashtagList';
import { containsOffensive } from './profanity';
import { canonicalTag } from './hashtags';

export const TAG_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const TAG_SLUG_MIN = 3;
export const TAG_SLUG_MAX = 24;
export const TAG_QUERY_MIN = 2;

/**
 * What's typed, in slug form, as you type: lowercase; spaces and underscores become hyphens;
 * anything else outside a-z, 0-9 and '-' is dropped; no doubled or leading hyphens. A trailing
 * hyphen is kept (you're about to type the next word). At most 24 characters.
 */
export function normalizeTagInput(text: string): string {
  return text
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, TAG_SLUG_MAX);
}

/** The finished slug (no trailing hyphen). */
export function finishSlug(text: string): string {
  return normalizeTagInput(text).replace(/-+$/, '');
}

export function isValidSlug(slug: string): boolean {
  return TAG_SLUG_RE.test(slug) && slug.length >= TAG_SLUG_MIN && slug.length <= TAG_SLUG_MAX;
}

const BY_SLUG = new Map<string, HashtagEntry>(HASHTAG_LIST.map((entry) => [entry.id, entry]));
const BY_KEY = new Map<string, HashtagEntry>(HASHTAG_LIST.map((entry) => [entry.id.replace(/-/g, ''), entry]));

/** The listed tag for a slug ("live-music" -> #LiveMusic), or null. Also matches "livemusic". */
export function listedTagForSlug(slug: string): HashtagEntry | null {
  return BY_SLUG.get(slug) ?? BY_KEY.get(slug.replace(/-/g, '')) ?? null;
}

/** "#LiveMusic" for a listed slug; otherwise the slug's words with capitals: "#AcousticBrunch". */
export function displayForSlug(slug: string): string {
  const listed = listedTagForSlug(slug);
  if (listed) return listed.tag;
  return `#${slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')}`;
}

/** The slug for a shown tag: a listed one's id, else its words split at capitals ("#AcousticBrunch" -> "acoustic-brunch"). */
export function slugForTag(tag: string): string {
  const clean = tag.replace(/^#+/, '').replace(/[^A-Za-z0-9]/g, '');
  const listed = BY_KEY.get(clean.toLowerCase());
  if (listed) return listed.id;
  return clean
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/** A tag someone made up that's fine to use: valid slug, not listed, clean language. */
export function isUsableCustomSlug(slug: string): boolean {
  return isValidSlug(slug) && !containsOffensive(slug.replace(/-/g, ' ')) && !containsOffensive(slug.replace(/-/g, ''));
}

/**
 * Where the query matches in a slug, for highlighting: at the start or right after a hyphen
 * ("music" in "live-music" -> [5, 10]). Null when it doesn't match that way.
 */
export function matchRange(slug: string, query: string): [number, number] | null {
  const q = finishSlug(query);
  if (!q) return null;
  if (slug.startsWith(q)) return [0, q.length];
  const at = slug.indexOf(`-${q}`);
  return at >= 0 ? [at + 1, at + 1 + q.length] : null;
}

export interface TagSuggestionItem {
  slug: string;
  /** Without '#': "LiveMusic". */
  displayName: string;
  usageCount: number | null;
  isCanonical: boolean;
}

/**
 * Hyphen-aware matches from the listed tags, ranked like the server: exact, then prefix, then a
 * hyphenated word starting with the query; list order breaks ties (no usage counts offline).
 */
export function localTagSuggestions(query: string, exclude: readonly string[] = [], limit = 8): TagSuggestionItem[] {
  const q = finishSlug(query);
  if (q.length < TAG_QUERY_MIN) return [];
  const skip = new Set(exclude);
  const hits: Array<{ entry: HashtagEntry; rank: number; index: number }> = [];
  HASHTAG_LIST.forEach((entry, index) => {
    if (skip.has(entry.id)) return;
    const range = matchRange(entry.id, q);
    if (!range) return;
    hits.push({ entry, rank: entry.id === q ? 0 : range[0] === 0 ? 1 : 2, index });
  });
  return hits
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map(({ entry }) => ({ slug: entry.id, displayName: entry.tag.replace(/^#/, ''), usageCount: null, isCanonical: true }));
}

/** "920 uses", "1.2k uses". */
export function usageLabel(count: number | null): string | null {
  if (count == null || count <= 0) return null;
  const n = count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(count);
  return `${n} ${count === 1 ? 'use' : 'uses'}`;
}

/**
 * A Point's tags: listed ones in the list's spelling, people's own (valid, clean) ones as
 * #CapitalizedWords; anything else dropped; no repeats.
 */
export function pointTags(tags: readonly (string | null | undefined)[] | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of tags ?? []) {
    if (!raw) continue;
    const listed = canonicalTag(raw);
    const slug = listed ? null : slugForTag(raw);
    const tag = listed ?? (slug && isUsableCustomSlug(slug) ? displayForSlug(slug) : null);
    if (tag && !out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out;
}
