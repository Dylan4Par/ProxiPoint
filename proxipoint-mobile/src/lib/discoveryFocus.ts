export const DISCOVERY_WORLD_OFFSET = 200;
export const DISCOVERY_PIXELS_PER_METER = 0.45;
export const CARD_LIST_MARGIN_METERS = 300;

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// World rectangle currently inside the map view.
export function visibleWorldBounds(
  panX: number,
  panY: number,
  viewportWidth: number,
  viewportHeight: number,
  worldOffset = DISCOVERY_WORLD_OFFSET,
): WorldBounds {
  return {
    minX: worldOffset - panX,
    maxX: worldOffset - panX + viewportWidth,
    minY: worldOffset - panY,
    maxY: worldOffset - panY + viewportHeight,
  };
}

// Card list keeps events that sit up to 300 meters past the screen edge.
export function cardListBounds(
  screen: WorldBounds,
  marginMeters = CARD_LIST_MARGIN_METERS,
  pixelsPerMeter = DISCOVERY_PIXELS_PER_METER,
): WorldBounds {
  const pad = marginMeters * pixelsPerMeter;
  return {
    minX: screen.minX - pad,
    maxX: screen.maxX + pad,
    minY: screen.minY - pad,
    maxY: screen.maxY + pad,
  };
}

export function pointInBounds(x: number, y: number, bounds: WorldBounds): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

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
