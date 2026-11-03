/**
 * Tag suggestions from the backend: GET {TAGS_URL}/autocomplete?q= (ingest-core, migration 013).
 * Public, no sign-in. TAGS_URL is EXPO_PUBLIC_TAGS_URL, or the events URL with /events swapped
 * for /tags. Unset = off: suggestions come from the listed tags on the phone.
 */
import { EVENTS_URL } from './eventsApi';
import type { TagSuggestionItem } from '../lib/tagSlug';

export const TAGS_URL: string = (
  (process.env.EXPO_PUBLIC_TAGS_URL ?? '').trim() || EVENTS_URL.replace(/\/events$/, '/tags')
).replace(/\/+$/, '');

export function parseTagSuggestions(body: unknown): TagSuggestionItem[] {
  const list = (body as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(list)) return [];
  return list
    .filter((t): t is { slug: string; displayName: string; usageCount?: number; isCanonical?: boolean } => {
      const x = t as { slug?: unknown; displayName?: unknown } | null;
      return Boolean(x && typeof x.slug === 'string' && typeof x.displayName === 'string');
    })
    .map((t) => ({
      slug: t.slug,
      displayName: t.displayName.replace(/^#+/, ''),
      usageCount: typeof t.usageCount === 'number' ? t.usageCount : null,
      isCanonical: t.isCanonical === true,
    }));
}

export async function fetchTagSuggestions(query: string, signal?: AbortSignal): Promise<TagSuggestionItem[]> {
  if (!TAGS_URL) return [];
  const response = await fetch(`${TAGS_URL}/autocomplete?q=${encodeURIComponent(query)}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`tags: HTTP ${response.status}`);
  return parseTagSuggestions(await response.json());
}
