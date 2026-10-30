/**
 * Whether a finger is on the Explore map right now. The card list uses it to hold off rebuilding
 * its cards until the map is let go, so a rebuild never lands in the middle of a drag.
 */
let touching = false;
const listeners = new Set<(touching: boolean) => void>();

export function setMapTouching(next: boolean): void {
  if (next === touching) return;
  touching = next;
  listeners.forEach((fn) => fn(next));
}

export function isMapTouching(): boolean {
  return touching;
}

/** Called with the new value each time it changes. Returns an unsubscribe function. */
export function onMapTouchingChange(fn: (touching: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
