/**
 * Zoom and middle that fit a set of points (map world units) into the visible part of the map,
 * with room for pins and their #tag labels. Pure, so it's tested.
 */
export interface FitPadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A pin reaches 17 px above its point and its label ~46 px below, plus some breathing room. */
export const FIT_PADDING: FitPadding = { left: 44, right: 44, top: 40, bottom: 62 };

export function fitView(
  points: Array<{ x: number; y: number }>,
  view: { width: number; height: number },
  zoom: { min: number; max: number; single: number },
  pad: FitPadding = FIT_PADDING,
): { z: number; x: number; y: number; screenX: number; screenY: number } | null {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!pts.length) return null;
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const roomW = Math.max(40, view.width - pad.left - pad.right);
  const roomH = Math.max(40, view.height - pad.top - pad.bottom);
  const dx = maxX - minX;
  const dy = maxY - minY;
  // One spot (or all at one spot): don't zoom right in, just show it.
  let z = dx < 1e-6 && dy < 1e-6 ? zoom.single : Math.min(dx > 0 ? roomW / dx : Infinity, dy > 0 ? roomH / dy : Infinity);
  z = Math.min(zoom.max, Math.max(zoom.min, z));
  return {
    z,
    // World point to put at the screen spot below: the middle of the points.
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    // Where that goes on screen: the middle of the room left after the padding.
    screenX: pad.left + roomW / 2,
    screenY: pad.top + roomH / 2,
  };
}
