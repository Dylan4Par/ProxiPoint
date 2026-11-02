/**
 * The sticky mini bar's context chip on Discover: "Boulder • 15 mi • 3 days".
 */

/** City without its state ("Boulder, CO" → "Boulder"). */
export function shortPlace(label: string): string {
  const name = label.split(',')[0]?.trim();
  return name || label.trim() || 'Here';
}

/** Dates in a few characters: "Next 3 days" → "3 days"; others as they are. */
export function shortWhen(label: string): string {
  return label.replace(/^next\s+/i, '').trim();
}

/** "Boulder • 15 mi • 3 days"; no range → "Any distance". */
export function miniBarContext(placeLabel: string, range: string | null, when: string): string {
  return [shortPlace(placeLabel), range ?? 'Any distance', shortWhen(when)].filter(Boolean).join(' • ');
}
