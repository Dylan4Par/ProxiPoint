/**
 * Layout for pinned channel posts on Explore Map (pure, no React, so it's testable):
 * - posts whose bubbles would overlap on screen merge into one bubble with a count;
 * - a bubble that lands on a Point cluster bubble is absorbed into it (the cluster shows a post
 *   badge, and its list shows the posts);
 * - a bubble that would sit on top of a single Point's pin (a post pinned at that venue) slides to
 *   the pin's upper-right, like a badge, so neither hides the other.
 *
 * Positions are in map world units; box sizes and offsets are screen pixels, divided by the zoom.
 */

export interface PinSpot {
  id: string;
  x: number;
  y: number;
}

export interface PinGroup<T extends PinSpot> {
  /** Stable key from the member ids. */
  key: string;
  /** Centre of the members (the bubble's tail points here). */
  x: number;
  y: number;
  members: T[];
  /** Screen-pixel nudge off a Point's pin (0, 0 when it's clear). */
  dx: number;
  dy: number;
}

/** A post bubble's footprint on screen (bubble + tail), in pixels. */
export const POST_BOX_W = 46;
export const POST_BOX_H = 34;

/**
 * Merges pins whose bubbles would touch, closest pair first, until none touch (same approach as
 * the Point clusters). `zoom` is the map zoom the layout is for.
 */
export function clusterPins<T extends PinSpot>(pins: T[], zoom: number): Array<PinGroup<T>> {
  const boxW = POST_BOX_W / zoom;
  const boxH = POST_BOX_H / zoom;
  type Group = { members: T[]; x: number; y: number };
  const groups: Group[] = pins.map((pin) => ({ members: [pin], x: pin.x, y: pin.y }));
  const centre = (members: T[]) => ({
    x: members.reduce((sum, m) => sum + m.x, 0) / members.length,
    y: members.reduce((sum, m) => sum + m.y, 0) / members.length,
  });
  for (let guard = 0; guard < 500; guard += 1) {
    let best: { i: number; j: number; d: number } | null = null;
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const dx = Math.abs(groups[i].x - groups[j].x) / boxW;
        const dy = Math.abs(groups[i].y - groups[j].y) / boxH;
        if (dx < 1 && dy < 1) {
          const d = Math.max(dx, dy);
          if (!best || d < best.d) best = { i, j, d };
        }
      }
    }
    if (!best) break;
    const members = [...groups[best.i].members, ...groups[best.j].members];
    groups[best.i] = { members, ...centre(members) };
    groups.splice(best.j, 1);
  }
  return groups.map((group) => ({
    key: group.members
      .map((m) => m.id)
      .sort()
      .join('|'),
    x: group.x,
    y: group.y,
    members: group.members,
    dx: 0,
    dy: 0,
  }));
}

/**
 * Point pins and bubbles take a box about this size around their spot (pixels), and the post
 * bubble sits above its own spot. Anything closer than this gets nudged.
 */
export const MARKER_HALF_W = 25;
export const MARKER_HALF_H = 25;
/** Where a nudged bubble goes: up and to the right of the Point's pin head. */
export const NUDGE_X = 30;
export const NUDGE_Y = -16;

/** True when a post bubble at `group` would overlap a marker at `m` on screen. */
function overlaps(group: { x: number; y: number }, m: { x: number; y: number }, zoom: number): boolean {
  // The bubble covers from its spot up to POST_BOX_H above it, and half its width each side.
  const sx = (group.x - m.x) * zoom; // screen pixels from the marker's spot
  const sy = (group.y - m.y) * zoom;
  return Math.abs(sx) < MARKER_HALF_W + POST_BOX_W / 2 && sy > -MARKER_HALF_H && sy - POST_BOX_H < MARKER_HALF_H;
}

/**
 * Post bubbles that land on a Point cluster bubble are absorbed into it: returns each cluster's
 * posts (by cluster key) and the bubbles that stay on their own. A bubble touching several
 * clusters goes to the nearest.
 */
export function absorbIntoMarkers<T extends PinSpot>(
  groups: Array<PinGroup<T>>,
  markers: Array<{ key: string; x: number; y: number }>,
  zoom: number,
): { absorbed: Record<string, T[]>; rest: Array<PinGroup<T>> } {
  const absorbed: Record<string, T[]> = {};
  const rest: Array<PinGroup<T>> = [];
  for (const group of groups) {
    const hits = markers.filter((m) => overlaps(group, m, zoom));
    if (!hits.length) {
      rest.push(group);
      continue;
    }
    const nearest = hits.reduce((best, m) =>
      Math.hypot(m.x - group.x, m.y - group.y) < Math.hypot(best.x - group.x, best.y - group.y) ? m : best,
    );
    absorbed[nearest.key] = [...(absorbed[nearest.key] ?? []), ...group.members];
  }
  return { absorbed, rest };
}

/** Slides post bubbles that would cover a Point's pin to that pin's upper-right. */
export function nudgeOffMarkers<T extends PinSpot>(
  groups: Array<PinGroup<T>>,
  markers: Array<{ x: number; y: number }>,
  zoom: number,
): Array<PinGroup<T>> {
  return groups.map((group) => {
    const hit = markers.find((m) => overlaps(group, m, zoom));
    if (!hit) return group;
    // Sit beside that marker, measured from the bubble's own spot.
    return {
      ...group,
      dx: (hit.x - group.x) * zoom + NUDGE_X,
      dy: (hit.y - group.y) * zoom + NUDGE_Y,
    };
  });
}
