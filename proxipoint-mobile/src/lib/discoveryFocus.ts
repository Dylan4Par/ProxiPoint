export const DISCOVERY_WORLD_OFFSET = 200;

// Pan that places a world point at the center of the discovery map.
export function focusOffsetForPoint(
  pointX: number | undefined,
  pointY: number | undefined,
  viewportWidth: number,
  viewportHeight: number,
  worldOffset = DISCOVERY_WORLD_OFFSET,
): { x: number; y: number } | null {
  if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return null;
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return null;

  return {
    x: viewportWidth / 2 - ((pointX as number) - worldOffset),
    y: viewportHeight / 2 - ((pointY as number) - worldOffset),
  };
}
