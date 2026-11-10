import type { Rect, TourTargetId } from '../../lib/tour';

/** Anything the tour can measure: Views and Touchables both qualify. */
interface Measurable {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
}

const nodes = new Map<TourTargetId, Measurable>();
const refs = new Map<TourTargetId, (node: Measurable | null) => void>();

/**
 * Ref for something the tour can spotlight: `ref={tourTarget('create-event')}`.
 * The same function comes back every render, so React doesn't re-attach it.
 */
export function tourTarget(id: TourTargetId): (node: unknown) => void {
  let ref = refs.get(id);
  if (!ref) {
    ref = (node: Measurable | null) => {
      if (node && typeof node.measureInWindow === 'function') nodes.set(id, node);
      else nodes.delete(id);
    };
    refs.set(id, ref);
  }
  return ref as (node: unknown) => void;
}

/** Where the target is on screen right now, or null if it isn't mounted or has no size. */
export function measureTourTarget(id: TourTargetId): Promise<Rect | null> {
  const node = nodes.get(id);
  if (!node) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 500);
    try {
      node.measureInWindow((x, y, width, height) => {
        clearTimeout(timer);
        resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}
