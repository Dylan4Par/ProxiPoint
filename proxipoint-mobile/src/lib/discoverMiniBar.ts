/**
 * The sticky mini bar's context chip on Discover: just the city ("Boulder").
 */

/** City without its state ("Boulder, CO" → "Boulder"). */
export function shortPlace(label: string): string {
  const name = label.split(',')[0]?.trim();
  return name || label.trim() || 'Here';
}
