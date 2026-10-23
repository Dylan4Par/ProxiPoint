/**
 * First-run tour of Explore Map. Shown once per phone, the first time the main app opens;
 * Settings → Help → App guide shows it again.
 */

/** Things on screen a step can point at; each registers itself with tourTarget(id). */
export type TourTargetId =
  | 'create-event'
  | 'drop-tags'
  | 'map-filter-rail'
  | 'map-date-chip'
  | 'map-area'
  | 'map-cards'
  | 'nav-channels'
  | 'nav-profile';

export interface TourStep {
  id: 'map' | 'filters' | 'channels' | 'profile' | 'create';
  /** Shown above the title, e.g. "MAP RADAR". */
  label: string;
  title: string;
  body: string;
  /** Spotlighted together; the card sits clear of them where there's room. */
  targets: TourTargetId[];
  /**
   * Instead of the targets themselves, spotlight the part of `within` above `above` (the map
   * between the header and the event cards): all of it, or with `size`, a round spot of that
   * size in its middle.
   */
  centerSpot?: { within: TourTargetId; above?: TourTargetId; size?: number };
  /** The Create Event sheet has to be open for this step. */
  needsCreateSheet?: boolean;
  /** Button text; "Next" when left out. */
  cta?: string;
}

export const MAP_TOUR: TourStep[] = [
  {
    id: 'map',
    label: 'MAP RADAR',
    title: 'See What’s Happening Nearby',
    body: 'Every pin on the map is a Point: a live hangout, pickup game, or gathering happening around you right now.',
    targets: ['map-area', 'map-cards'],
    centerSpot: { within: 'map-area', above: 'map-cards' },
  },
  {
    id: 'filters',
    label: 'DISCOVER & TAGS',
    title: 'Tune to Your Interests',
    body: 'Filter by time or tap tags like #GarageSale or #FoodTrucks to immediately zero in on the activities and crowds you care about.',
    targets: ['map-filter-rail', 'map-date-chip'],
  },
  {
    id: 'channels',
    label: 'COMMUNITY CHANNELS',
    title: 'Join Local Channels',
    body: 'Connect with hyper-local groups, from running clubs and tech meetups to food truck trackers and town notices.',
    targets: ['nav-channels'],
  },
  {
    id: 'profile',
    label: 'YOUR ACTIVITY',
    title: 'Manage Your Activity',
    body: 'Keep track of your RSVPs, check your live attendee count, or easily re-drop past favorites with one tap.',
    targets: ['nav-profile'],
  },
  {
    id: 'create',
    label: 'HOSTING & DROPS',
    title: 'Drop Your Own Point',
    body: 'Tap here anytime to select location, add your tags, and notify nearby people to join you.',
    targets: ['create-event'],
    cta: 'Start Exploring',
  },
];

/** Where "tour seen" is saved on the phone. Bump the version to show a new tour to everyone. */
export const MAP_TOUR_KEY = 'pp.tour.mapIntro.v2';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Corner radius of the spotlight; half the size makes a circle. */
  radius?: number;
}

/** The part of `area` above `cover` (e.g. the map above the event cards), or all of it. */
export function visibleArea(area: Rect, cover: Rect | null): Rect {
  let bottom = area.y + area.height;
  if (cover && cover.y > area.y && cover.y < bottom) bottom = cover.y;
  return { x: area.x, y: area.y, width: area.width, height: Math.max(0, bottom - area.y) };
}

/**
 * A round spotlight of `size` centered in `area`, using only the part of it above `cover`
 * (e.g. the map above the event cards). Shrinks to fit a short area.
 */
export function centerSpot(area: Rect, cover: Rect | null, size: number): Rect {
  let bottom = area.y + area.height;
  if (cover && cover.y > area.y && cover.y < bottom) bottom = cover.y;
  const visible = Math.max(0, bottom - area.y);
  const d = Math.max(0, Math.min(size, area.width - 24, visible - 24));
  return {
    x: area.x + (area.width - d) / 2,
    y: area.y + (visible - d) / 2,
    width: d,
    height: d,
    radius: d / 2,
  };
}

/** One box around all the rects, or null when there are none. */
export function unionRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Grow a rect by `pad` on every side, kept inside the screen. */
export function padRect(rect: Rect, pad: number, screen: { width: number; height: number }): Rect {
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  const right = Math.min(screen.width, rect.x + rect.width + pad);
  const bottom = Math.min(screen.height, rect.y + rect.height + pad);
  const out: Rect = { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
  return rect.radius != null ? { ...out, radius: rect.radius + pad } : out;
}

/**
 * Where the step card goes: under the spotlight if it fits, otherwise above it,
 * otherwise pinned to the bottom of the screen (over a big spotlight like the map).
 */
export function placeCard(
  spot: Rect | null,
  cardHeight: number,
  screenHeight: number,
  gap = 14,
  margin = 16,
): { top: number } {
  const pinnedBottom = { top: Math.max(margin, screenHeight - cardHeight - margin) };
  if (!spot) return { top: Math.max(margin, (screenHeight - cardHeight) / 2) };
  const below = spot.y + spot.height + gap;
  if (below + cardHeight + margin <= screenHeight) return { top: below };
  const above = spot.y - gap - cardHeight;
  if (above >= margin) return { top: above };
  return pinnedBottom;
}

/**
 * Spotlights around several targets: padded, rounded to follow the target (a pill stays a pill,
 * up to `maxRadius`), and kept `gap` apart where two would touch, splitting the space between
 * them evenly so neither outline runs into the other.
 */
export function spotlightHoles(
  targets: Rect[],
  pad: number,
  screen: { width: number; height: number },
  gap = 6,
  maxRadius = 24,
): Rect[] {
  const holes = targets.map((t) => {
    const p = padRect(t, pad, screen);
    return { ...p, radius: Math.min(maxRadius, p.height / 2, p.width / 2) };
  });
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = 0; j < targets.length; j += 1) {
      if (i === j) continue;
      const a = targets[i];
      const b = targets[j];
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0;
      const aBottom = a.y + a.height;
      // a sits above b and their padded spotlights would come closer than `gap`.
      if (!overlapX || aBottom > b.y || b.y - aBottom >= 2 * pad + gap) continue;
      const mid = (aBottom + b.y) / 2;
      const ha = holes[i];
      const hb = holes[j];
      const newBottom = Math.max(aBottom, mid - gap / 2);
      const newTop = Math.min(b.y, mid + gap / 2);
      ha.height = Math.max(0, Math.min(ha.y + ha.height, newBottom) - ha.y);
      const bBottom = hb.y + hb.height;
      hb.y = Math.max(hb.y, newTop);
      hb.height = Math.max(0, bBottom - hb.y);
      ha.radius = Math.min(maxRadius, ha.height / 2, ha.width / 2);
      hb.radius = Math.min(maxRadius, hb.height / 2, hb.width / 2);
    }
  }
  return holes;
}

/** SVG path of the whole screen with rounded holes cut out (draw with fillRule="evenodd"). */
export function maskPath(screen: { width: number; height: number }, holes: Rect[], radius = 14): string {
  const outer = `M0 0H${screen.width}V${screen.height}H0Z`;
  const cut = holes
    .filter((h) => h.width > 0 && h.height > 0)
    .map((h) => {
      const r = Math.min(h.radius ?? radius, h.width / 2, h.height / 2);
      const x2 = h.x + h.width;
      const y2 = h.y + h.height;
      return (
        `M${h.x + r} ${h.y}H${x2 - r}A${r} ${r} 0 0 1 ${x2} ${h.y + r}` +
        `V${y2 - r}A${r} ${r} 0 0 1 ${x2 - r} ${y2}` +
        `H${h.x + r}A${r} ${r} 0 0 1 ${h.x} ${y2 - r}` +
        `V${h.y + r}A${r} ${r} 0 0 1 ${h.x + r} ${h.y}Z`
      );
    })
    .join('');
  return outer + cut;
}
