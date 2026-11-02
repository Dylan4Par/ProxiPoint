/**
 * Which of the wider, coarser layers a map needs, from how wide its view is: 0 = street level
 * only, 4 = all of them (the 70-mile view). Each layer is only downloaded once the view is close
 * to running off the edge of the layer inside it, and it stays once loaded (so zooming back in
 * and out doesn't fetch it again).
 */
export function wideLayersFor(viewWidthMeters: number): number {
  if (viewWidthMeters > 45000) return 4; // ~28 mi and up: the z9 region
  if (viewWidthMeters > 20000) return 3; // ~12 mi: z10
  if (viewWidthMeters > 9000) return 2; // ~5.6 mi: z11
  if (viewWidthMeters > 3500) return 1; // ~2.2 mi: z12
  return 0;
}
