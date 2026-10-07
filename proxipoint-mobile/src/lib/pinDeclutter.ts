export type LabelAnchor = 'top' | 'right' | 'bottom' | 'left';

export interface DeclutterInput {
  id: string;
  x: number;
  y: number;
}

export interface DeclutteredPin {
  id: string;
  x: number;
  y: number;
  labelAnchor: LabelAnchor;
}

/** Full stagger at or below this scale. Default tactical view is scale 1. */
export const DECLUTTER_FULL_SCALE = 1;
/** Stagger for merely-nearby pins fades out once the operator zooms past this. */
export const DECLUTTER_CLEAR_SCALE = 1.45;
export const CLUSTER_SCREEN_PX = 42;
export const EXACT_MATCH_WORLD_PX = 2;

export function declutterStrength(scale: number): number {
  if (!Number.isFinite(scale) || scale <= DECLUTTER_FULL_SCALE) return 1;
  if (scale >= DECLUTTER_CLEAR_SCALE) return 0;
  return (DECLUTTER_CLEAR_SCALE - scale) / (DECLUTTER_CLEAR_SCALE - DECLUTTER_FULL_SCALE);
}

/**
 * Spread pins that share a downtown geocode, or that collide on screen while
 * zoomed out. Exact overlaps keep a minimum fan so each pin stays tappable
 * after zooming in. The cluster centroid stays on the true coordinate.
 * Labels around a fan use distinct anchors so they don't sit on each other.
 */
export function declutterPins(pins: DeclutterInput[], scale: number): DeclutteredPin[] {
  if (pins.length === 0) return [];
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const fade = declutterStrength(safeScale);
  const groups = clusterPins(pins, safeScale, fade);
  const placed: DeclutteredPin[] = [];

  for (const group of groups) {
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    if (sorted.length === 1) {
      placed.push({ ...sorted[0], labelAnchor: 'top' });
      continue;
    }

    const centroid = {
      x: sorted.reduce((sum, pin) => sum + pin.x, 0) / sorted.length,
      y: sorted.reduce((sum, pin) => sum + pin.y, 0) / sorted.length,
    };
    const exact = sorted.every(
      (pin) => Math.hypot(pin.x - centroid.x, pin.y - centroid.y) <= EXACT_MATCH_WORLD_PX,
    );
    const radius = clusterScreenRadius(sorted.length, fade, exact);

    sorted.forEach((pin, index) => {
      const angle = (2 * Math.PI * index) / sorted.length - Math.PI / 2;
      placed.push({
        id: pin.id,
        x: centroid.x + (Math.cos(angle) * radius) / safeScale,
        y: centroid.y + (Math.sin(angle) * radius) / safeScale,
        labelAnchor: anchorForAngle(angle),
      });
    });
  }

  return placed;
}

function clusterScreenRadius(count: number, fade: number, exact: boolean): number {
  const full = 16 + Math.min(count, 8) * 2;
  if (exact) return Math.max(14, full);
  return full * fade;
}

function anchorForAngle(angle: number): LabelAnchor {
  const degrees = ((angle * 180) / Math.PI + 360) % 360;
  if (degrees >= 315 || degrees < 45) return 'right';
  if (degrees < 135) return 'bottom';
  if (degrees < 225) return 'left';
  return 'top';
}

function clusterPins(pins: DeclutterInput[], scale: number, fade: number): DeclutterInput[][] {
  const parent = pins.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  };
  const unite = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootA] = rootB;
  };

  for (let i = 0; i < pins.length; i += 1) {
    for (let j = i + 1; j < pins.length; j += 1) {
      const world = Math.hypot(pins[i].x - pins[j].x, pins[i].y - pins[j].y);
      const screen = world * scale;
      const exact = world <= EXACT_MATCH_WORLD_PX;
      const near = fade > 0 && screen <= CLUSTER_SCREEN_PX;
      if (exact || near) unite(i, j);
    }
  }

  const groups = new Map<number, DeclutterInput[]>();
  pins.forEach((pin, index) => {
    const root = find(index);
    const list = groups.get(root) ?? [];
    list.push(pin);
    groups.set(root, list);
  });
  return [...groups.values()];
}
