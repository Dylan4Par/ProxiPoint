export type DrawerSnap = 'collapsed' | 'peek' | 'expanded';

export const DRAWER_COLLAPSED = 74;
export const DRAWER_PEEK = 215;

export function expandedDrawerHeight(windowHeight: number): number {
  return Math.round(Math.max(0, windowHeight) * 0.48);
}

export function drawerStopHeights(windowHeight: number): Record<DrawerSnap, number> {
  return {
    collapsed: DRAWER_COLLAPSED,
    peek: DRAWER_PEEK,
    expanded: expandedDrawerHeight(windowHeight),
  };
}

export function heightForSnap(snap: DrawerSnap, windowHeight: number): number {
  return drawerStopHeights(windowHeight)[snap];
}

/**
 * Resolve the snap point after a drag.
 * `velocityY` follows React Native's pan responder: positive when the finger moves down.
 * Units are px/ms. A fast flick steps one stop in that direction; a slow release
 * settles on the stop nearest the projected height.
 */
export function resolveDrawerSnap(
  height: number,
  velocityY: number,
  windowHeight: number,
): DrawerSnap {
  const stops = drawerStopHeights(windowHeight);
  const ordered: { snap: DrawerSnap; height: number }[] = [
    { snap: 'collapsed', height: stops.collapsed },
    { snap: 'peek', height: stops.peek },
    { snap: 'expanded', height: stops.expanded },
  ];

  const flick = 0.65;
  if (velocityY > flick) {
    const lower = [...ordered].reverse().find((stop) => stop.height < height - 12);
    if (lower) return lower.snap;
  }
  if (velocityY < -flick) {
    const higher = ordered.find((stop) => stop.height > height + 12);
    if (higher) return higher.snap;
  }

  const projected = height - velocityY * 180;
  let best: DrawerSnap = 'peek';
  let bestDistance = Infinity;
  for (const stop of ordered) {
    const distance = Math.abs(stop.height - projected);
    if (distance < bestDistance) {
      best = stop.snap;
      bestDistance = distance;
    }
  }
  return best;
}
