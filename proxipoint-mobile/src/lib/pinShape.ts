/**
 * Map pin outline: a circle head that narrows to a point below it, as one closed shape, so the
 * rim drawn around it is the same thickness all the way round (head and tip).
 */
export function teardropPath(cx: number, cy: number, r: number, tipY: number): string {
  const d = tipY - cy;
  if (d <= r) {
    // No room for a tip: just the circle.
    return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
  }
  // Where the straight sides meet the circle (tangent points).
  const cos = r / d;
  const sin = Math.sqrt(1 - cos * cos);
  const dx = r * sin;
  const dy = r * cos;
  const f = (n: number) => Math.round(n * 100) / 100;
  return `M${f(cx)} ${f(tipY)}L${f(cx + dx)} ${f(cy + dy)}A${r} ${r} 0 1 0 ${f(cx - dx)} ${f(cy + dy)}Z`;
}
