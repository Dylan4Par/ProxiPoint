/**
 * First-run tour of Explore Map. Shown once per phone, the first time the main app opens;
 * Settings → Help → App guide shows it again.
 */

/** Things on screen a step can point at; each registers itself with tourTarget(id). */
export type TourTargetId =
  | 'create-event'
  | 'drop-tags'
  | 'map-filter-rail'
  | 'map-area'
  | 'map-cards'
  | 'nav-channels'
  | 'nav-profile';

export interface TourStep {
  id: 'map' | 'filters' | 'channels' | 'profile' | 'create';
  /** Shown above the title, e.g. "STEP 1". */
  label: string;
  title: string;
  body: string;
  /** Spotlighted together; the card sits clear of them where there's room. */
  targets: TourTargetId[];
  /**
   * Instead of the targets themselves, a round spotlight of `size` in the middle of `within`,
   * counting only the part above `above` (the map between the header and the event cards).
   */
  centerSpot?: { within: TourTargetId; above?: TourTargetId; size: number };
  /** The Create Event sheet has to be open for this step. */
  needsCreateSheet?: boolean;
  /** Button text; "Next" when left out. */
  cta?: string;
}

export const MAP_TOUR: TourStep[] = [
  {
    id: 'map',
    label: 'STEP 1',
    title: 'See What’s Happening Nearby',
    body: 'Every pin on the map is a Point: a live hangout, pickup game, or local gathering happening around you right now.',
    targets: ['map-area', 'map-cards'],
    centerSpot: { within: 'map-area', above: 'map-cards', size: 170 },
  },
  {
    id: 'filters',
    label: 'STEP 2',
    title: 'Tune to Your Interests',
    body: 'Filter by time or tap tags like #Pickleball or #LiveMusic to immediately zero in on the crowds and activities you care about.',
    targets: ['map-filter-rail'],
  },
  {
    id: 'channels',
    label: 'STEP 3',
    title: 'Join Local Channels',
    body: 'Connect with hyper-local groups, from running clubs and tech meetups to food truck trackers and town notices.',
    targets: ['nav-channels'],
  },
  {
    id: 'profile',
    label: 'STEP 4',
    title: 'Manage Your Activity',
    body: 'Keep track of your RSVPs, check your live attendee count, or easily re-drop past favorites with one tap.',
    targets: ['nav-profile'],
  },
  {
    id: 'create',
    label: 'STEP 5',
    title: 'Drop Your Own Point',
    body: 'Hosting something or heading out? Tap here anytime to set your spot, add your tags, and beacon nearby people to join you.',
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
