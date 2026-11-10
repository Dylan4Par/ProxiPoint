import { useEffect, useState } from 'react';
import { isLiveNode } from './liveStatus';

/**
 * How the Explore Map list orders Points (from the Filter & sort sheet). In memory, like the
 * time window. Boosted Points still lead the list, labeled, whichever sort is picked: sorting
 * happens first, then Boosts are moved up keeping that order.
 */

export type PointSort = 'closest' | 'soonest' | 'popular';

export const POINT_SORTS: Array<{ id: PointSort; label: string; hint: string }> = [
  { id: 'closest', label: 'Closest', hint: 'Nearest first' },
  { id: 'soonest', label: 'Happening soonest', hint: 'Live now, then by start time' },
  { id: 'popular', label: 'Most going', hint: 'Biggest crowds first' },
];

export const DEFAULT_POINT_SORT: PointSort = 'closest';

interface SortablePoint {
  distanceMeters?: number;
  startsAt?: string;
  attendeeCount?: number;
  status?: string;
  isLiveNow?: boolean;
}

const startOf = (point: SortablePoint) => {
  const t = point.startsAt ? new Date(point.startsAt).getTime() : NaN;
  return Number.isFinite(t) ? t : Infinity;
};

/** A sorted copy; ties keep their original order. */
export function sortPoints<T extends SortablePoint>(points: T[], sort: PointSort): T[] {
  const keyed = points.map((point, index) => ({ point, index }));
  const compare = (a: T, b: T): number => {
    switch (sort) {
      case 'soonest':
        return Number(isLiveNode(b)) - Number(isLiveNode(a)) || startOf(a) - startOf(b);
      case 'popular':
        return (b.attendeeCount ?? 0) - (a.attendeeCount ?? 0);
      default:
        return (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity);
    }
  };
  return keyed.sort((x, y) => compare(x.point, y.point) || x.index - y.index).map((entry) => entry.point);
}

// ---- Store ----------------------------------------------------------------------------------

let current: PointSort = DEFAULT_POINT_SORT;
const listeners = new Set<() => void>();

export function getPointSort(): PointSort {
  return current;
}

export function setPointSort(sort: PointSort): void {
  if (sort === current) return;
  current = sort;
  listeners.forEach((listener) => listener());
}

export function usePointSort(): PointSort {
  const [sort, setSort] = useState(current);
  useEffect(() => {
    const listener = () => setSort(current);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return sort;
}
