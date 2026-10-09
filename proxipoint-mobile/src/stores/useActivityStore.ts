import { create } from 'zustand';
import { buildActivityFeed, unreadActivityIds } from '../lib/activityFeed';
import { useDiscoveryStore } from './useDiscoveryStore';

const SEEN_KEY = 'proxipoint.activity.seen';

function readSeen(): string[] {
  if (typeof globalThis.localStorage === 'undefined') return [];
  try {
    const raw = globalThis.localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeSeen(ids: string[]): void {
  if (typeof globalThis.localStorage === 'undefined') return;
  globalThis.localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
}

type ActivityState = {
  open: boolean;
  seen: string[];
  setOpen: (open: boolean) => void;
  markViewed: (ids: string[]) => void;
};

export const useActivityStore = create<ActivityState>((set, get) => ({
  open: false,
  seen: readSeen(),
  setOpen: (open) => set({ open }),
  markViewed: (ids) => {
    const next = Array.from(new Set([...get().seen, ...ids]));
    if (next.length === get().seen.length) return;
    writeSeen(next);
    set({ seen: next });
  },
}));

export function useActivityNotice() {
  const nodes = useDiscoveryStore((state) => state.nodes);
  const seen = useActivityStore((state) => state.seen);
  const feed = buildActivityFeed(Object.values(nodes), new Date());
  return { feed, unread: unreadActivityIds(feed, seen) };
}
