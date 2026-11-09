/**
 * Splits chips into a few rows for a sideways-scrolling block (Profile → Followed Tags and My
 * Channels). Each chip goes to the row that's shortest so far, so the rows end up about the same
 * length and the first chips sit at the left of the block, top to bottom.
 */
export function splitIntoRows<T>(items: T[], rows: number, width: (item: T) => number, gap = 8): T[][] {
  const count = Math.max(1, Math.min(rows, items.length));
  const out: T[][] = Array.from({ length: count }, () => []);
  const lengths = new Array(count).fill(0);
  for (const item of items) {
    let row = 0;
    for (let r = 1; r < count; r++) if (lengths[r] < lengths[row]) row = r;
    out[row].push(item);
    lengths[row] += width(item) + (out[row].length > 1 ? gap : 0);
  }
  return items.length ? out : [];
}

/** A chip's rough width from its text: about 8.5pt per character at 13pt bold, plus padding. */
export function chipWidth(text: string, extra = 44): number {
  return Math.round(text.length * 8.5) + extra;
}
