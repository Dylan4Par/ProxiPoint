/**
 * Explore Map's Filter → Match mode: its #tag filters (the chip row's tags, up to
 * MAX_ACTIVE_TAGS) show Points with Any of them (default) or All of them. Discover has its own
 * (lib/discoverTagFilter).
 */
import { useEffect, useState } from 'react';
import type { TagMatchMode } from './discoverFilters';

let mode: TagMatchMode = 'any';
const listeners = new Set<() => void>();

export const getExploreTagMode = (): TagMatchMode => mode;

export function setExploreTagMode(next: TagMatchMode): void {
  if (next === mode) return;
  mode = next;
  listeners.forEach((listener) => listener());
}

export function useExploreTagMode(): TagMatchMode {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return mode;
}
