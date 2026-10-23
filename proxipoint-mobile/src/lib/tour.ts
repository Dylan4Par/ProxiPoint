/**
 * First-run tour of Explore Map. Shown once per phone, the first time the main app opens;
 * Settings → FAQs → "Replay app tour" shows it again.
 */

/** Things on screen a step can point at; each registers itself with tourTarget(id). */
export type TourTargetId = 'create-event' | 'drop-tags' | 'map-filter-rail' | 'map-area' | 'nav-profile';

export interface TourStep {
  id: 'create' | 'tags' | 'explore' | 'profile';
  /** Shown above the title, e.g. "STEP 1.1". */
  label: string;
  title: string;
  body: string;
  /** Spotlighted together; the card sits clear of them where there's room. */
  targets: TourTargetId[];
  /** The Create Event sheet has to be open for this step. */
  needsCreateSheet?: boolean;
}

export const MAP_TOUR: TourStep[] = [
  {
    id: 'create',
    label: 'STEP 1',
    title: 'Drop a Point',
    body:
      'A Point is anything happening around you: a pickup game, a jam session, a pop-up, a last-minute hangout. Tap + Event to put one on the map.',
    targets: ['create-event'],
  },
  {
    id: 'tags',
    label: 'STEP 1.1',
    title: 'Tag it so the right people find it',
    body:
      'Points aren’t just pins. Tags like #Pickleball or #LiveMusic alert people nearby who follow them, so your Point reaches the crowd that cares.',
    targets: ['drop-tags'],
    needsCreateSheet: true,
  },
  {
    id: 'explore',
    label: 'STEP 2',
    title: 'See what’s happening',
    body:
      'Pins and clusters show Points near you, live now or coming up. Use the filter rail to switch to Live now, sort, or narrow the map to the tags you follow.',
    targets: ['map-filter-rail', 'map-area'],
  },
  {
    id: 'profile',
    label: 'STEP 3',
    title: 'Run your Points from Profile',
    body:
      'Under MY EVENTS you’ll see live RSVP counts while your Point is on. When it ends, Drop Again relaunches it in a tap, perfect for a weekly run or game night.',
    targets: ['nav-profile'],
  },
];

/** Where "tour seen" is saved on the phone. Bump the version to show a new tour to everyone. */
export const MAP_TOUR_KEY = 'pp.tour.mapIntro.v1';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
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
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
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
      const r = Math.min(radius, h.width / 2, h.height / 2);
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
