/**
 * Pinch-zoom and pan maths for the full-screen photo viewer (components/common/PhotoViewer).
 * Pure, so it's tested. Positions are in screen points relative to the middle of the viewer; the
 * photo is drawn scaled by `scale` about its middle and moved by (x, y).
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
/** Double-tap zooms to this, or back out to 1. */
export const DOUBLE_TAP_SCALE = 2.5;

export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

/** Keeps the zoomed photo covering the viewer: no panning past its edges, and centered at 1×. */
export function clampZoom(state: ZoomState, view: { width: number; height: number }): ZoomState {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.scale));
  const maxX = ((scale - 1) * view.width) / 2;
  const maxY = ((scale - 1) * view.height) / 2;
  // "+ 0" turns -0 into 0.
  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, state.x)) + 0,
    y: Math.min(maxY, Math.max(-maxY, state.y)) + 0,
  };
}

/**
 * Where the photo goes during a pinch: the point that was under the fingers when the pinch began
 * stays under them (now at `focus`), at the start scale times how far the fingers have spread.
 * `startFocus` and `focus` are relative to the viewer's middle.
 */
export function pinchZoom(
  start: ZoomState,
  startFocus: { x: number; y: number },
  focus: { x: number; y: number },
  spread: number,
  view: { width: number; height: number },
): ZoomState {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.scale * spread));
  // The photo point under the fingers at the start, in unscaled photo units.
  const px = (startFocus.x - start.x) / start.scale;
  const py = (startFocus.y - start.y) / start.scale;
  return clampZoom({ scale, x: focus.x - px * scale, y: focus.y - py * scale }, view);
}

/** Double tap: zoom in on the tapped spot, or back out to the whole photo. */
export function doubleTapZoom(state: ZoomState, tap: { x: number; y: number }, view: { width: number; height: number }): ZoomState {
  if (state.scale > MIN_SCALE + 0.01) return { scale: MIN_SCALE, x: 0, y: 0 };
  return pinchZoom(state, tap, { x: 0, y: 0 }, DOUBLE_TAP_SCALE / state.scale, view);
}
