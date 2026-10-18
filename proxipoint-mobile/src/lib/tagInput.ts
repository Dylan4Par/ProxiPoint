import { useState } from 'react';
import { parseBeaconTags } from './beaconDraft';

/**
 * Shared behavior for every Tags field (Drop Point sheet, Manage sheet editor):
 * auto "#", one tag per word, and suggestions from existing hashtags.
 */

export const MAX_TAG_SUGGESTIONS = 6;

/** Tags used during this app session, so they're suggested even before the server has them. */
const sessionTags = new Map<string, number>();

export function rememberTags(tags: string[]) {
  tags.forEach((tag) => {
    const clean = tag.replace(/^#+/, '');
    if (clean) sessionTags.set(clean, (sessionTags.get(clean) ?? 0) + 1);
  });
}

/** Strip #s and anything that isn't a letter, number or underscore. */
export function cleanTagWord(word: string) {
  return word.replace(/^#+/, '').replace(/[^A-Za-z0-9_]/g, '');
}

/**
 * Keeps a Tags field in "#One, #Two, #" form while the user types.
 * - Every word gets a leading #.
 * - A space or comma closes the current tag and starts a new "#".
 * - Backspace is never fought: deleting "#" from an empty tag removes it.
 */
export function formatTagInput(raw: string, previous: string): string {
  if (raw === '' || raw === '#') return raw;

  if (raw.length < previous.length) {
    // Backspacing over the auto-inserted ", #" separator removes the whole separator.
    if (/,\s*$/.test(raw)) return raw.replace(/,\s*$/, '');
    return raw;
  }

  const endsWithSeparator = /[\s,]$/.test(raw);
  const words = raw
    .split(/[\s,]+/)
    .map(cleanTagWord)
    .filter(Boolean);
  if (words.length === 0) return '#';

  const body = words.map((word) => `#${word}`).join(', ');
  return endsWithSeparator ? `${body}, #` : body;
}

/** The tag currently being typed (the last one, if the field doesn't end with a separator). */
export function currentTagFragment(value: string): string {
  if (/[\s,]$/.test(value)) return '';
  const parts = value.split(/[\s,]+/);
  return cleanTagWord(parts[parts.length - 1] ?? '');
}

/** Tags already entered, without #, lowercased (for "don't suggest it twice"). */
export function enteredTags(value: string): Set<string> {
  return new Set(
    value
      .split(/[\s,]+/)
      .map(cleanTagWord)
      .filter(Boolean)
      .map((tag) => tag.toLowerCase()),
  );
}

/** Pulls hashtags off whatever beacons/events the store holds, most-used first. */
export function collectKnownTags(items: unknown[] | undefined): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  const add = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    const label = cleanTagWord(raw);
    if (!label) return;
    const key = label.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { label, count: 1 });
  };

  (items ?? []).forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    for (const field of ['tags', 'hashtags']) {
      const value = record[field];
      if (Array.isArray(value)) value.forEach(add);
      else if (typeof value === 'string') parseBeaconTags(value).forEach(add);
    }
  });
  sessionTags.forEach((count, label) => {
    const key = label.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += count;
    else counts.set(key, { label, count });
  });

  return [...counts.values()].sort((a, b) => b.count - a.count).map((entry) => entry.label);
}

/** Tags as an editable string, e.g. ["GIS", "Tech"] -> "#GIS, #Tech". */
export function tagsToInput(tags: string[]): string {
  return tags
    .map(cleanTagWord)
    .filter(Boolean)
    .map((tag) => `#${tag}`)
    .join(', ');
}

/**
 * Wires a TextInput up as a Tags field. Spread the handlers onto the TextInput and render
 * `suggestions` as tappable chips that call `applySuggestion`.
 */
export function useTagField(
  value: string,
  setValue: (update: (current: string) => string) => void,
  knownItems?: unknown[],
) {
  const [focused, setFocused] = useState(false);

  const fragment = currentTagFragment(value).toLowerCase();
  const alreadyEntered = enteredTags(value);
  if (fragment) alreadyEntered.delete(fragment);
  const suggestions = focused
    ? collectKnownTags(knownItems)
        .filter((tag) => !alreadyEntered.has(tag.toLowerCase()))
        .filter((tag) => !fragment || tag.toLowerCase().startsWith(fragment))
        .filter((tag) => tag.toLowerCase() !== fragment)
        .slice(0, MAX_TAG_SUGGESTIONS)
    : [];

  return {
    suggestions,
    onChangeText: (raw: string) => setValue((previous) => formatTagInput(raw, previous)),
    onFocus: () => {
      setFocused(true);
      setValue((current) => {
        if (current === '') return '#';
        // Field already has tags: open a fresh "#" so the user can keep typing.
        return /#$/.test(current) ? current : `${current}, #`;
      });
    },
    onBlur: () => {
      setFocused(false);
      // Drop the dangling "#" (or ", #") left by the auto-prefix.
      setValue((current) => current.replace(/(,\s*)?#$/, ''));
    },
    applySuggestion: (tag: string) =>
      setValue((current) => {
        const base =
          /[\s,]$/.test(current) || current === '' ? current : current.replace(/#?[A-Za-z0-9_]*$/, '');
        const prefix = base.replace(/(,\s*)?#?$/, '');
        return `${prefix ? `${prefix}, ` : ''}#${tag}, #`;
      }),
  };
}
