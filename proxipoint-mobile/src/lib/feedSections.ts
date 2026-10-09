export interface ChronologicalFeedItem {
  id: string;
  status: string;
  startsAt?: string | null;
  distanceMeters: number;
}

export interface FeedSection<T> {
  id: string;
  title: string;
  tone: 'live' | 'scheduled';
  data: T[];
}

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;
const DAY_MS = 86_400_000;

export function isLiveFeedItem(
  item: Pick<ChronologicalFeedItem, 'status' | 'startsAt'>,
  now = new Date(),
): boolean {
  if (/live\s*now/i.test(item.status)) return true;
  if (item.startsAt == null || item.startsAt === '') return false;
  const start = new Date(item.startsAt);
  if (Number.isNaN(start.getTime()) || start.getTime() > now.getTime()) return false;
  return startOfDay(start) === startOfDay(now);
}

export function formatFeedSectionTitle(date: Date, now = new Date()): string {
  const label = `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
  const delta = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
  if (delta === 0) return `TODAY — ${label}`;
  if (delta === 1) return `TOMORROW — ${label}`;
  return label;
}

export function formatFeedClock(startsAt?: string | null): string | null {
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  return clockLabel(date.getHours(), date.getMinutes());
}

export function formatFeedMeta(
  item: Pick<ChronologicalFeedItem, 'status' | 'startsAt' | 'distanceMeters'>,
  now = new Date(),
): string {
  if (isLiveFeedItem(item, now)) {
    return `${Math.round(item.distanceMeters)}m away`;
  }
  return formatFeedClock(item.startsAt) ?? clockFromStatus(item.status) ?? `${Math.round(item.distanceMeters)}m away`;
}

export function chunkChronologicalFeed<T extends ChronologicalFeedItem>(
  items: readonly T[],
  now = new Date(),
): FeedSection<T>[] {
  const live: T[] = [];
  const days = new Map<string, { date: Date; items: T[] }>();

  for (const item of items) {
    if (isLiveFeedItem(item, now)) {
      live.push(item);
      continue;
    }
    const date = scheduledDate(item, now);
    const key = dayKey(date);
    const bucket = days.get(key);
    if (bucket) {
      bucket.items.push(item);
    } else {
      days.set(key, { date, items: [item] });
    }
  }

  live.sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id));

  const scheduled = [...days.values()].sort((a, b) => startOfDay(a.date) - startOfDay(b.date));
  const sections: FeedSection<T>[] = [];

  if (live.length > 0) {
    sections.push({ id: 'live', title: 'LIVE NOW', tone: 'live', data: live });
  }

  for (const bucket of scheduled) {
    bucket.items.sort((a, b) => {
      const aTime = scheduleSortKey(a, now);
      const bTime = scheduleSortKey(b, now);
      return aTime - bTime || a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id);
    });
    sections.push({
      id: dayKey(bucket.date),
      title: formatFeedSectionTitle(bucket.date, now),
      tone: 'scheduled',
      data: bucket.items,
    });
  }

  return sections;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function clockLabel(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function clockFromStatus(status: string): string | null {
  const match = status.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return clockLabel(Number(match[1]), Number(match[2]));
}

function scheduledDate(item: ChronologicalFeedItem, now: Date): Date {
  if (item.startsAt) {
    const parsed = new Date(item.startsAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const inferred = new Date(now);
  if (/tomorrow/i.test(item.status)) {
    inferred.setDate(inferred.getDate() + 1);
  }
  const match = item.status.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    inferred.setHours(Number(match[1]), Number(match[2]), 0, 0);
  } else {
    inferred.setHours(23, 59, 0, 0);
  }
  return inferred;
}

function scheduleSortKey(item: ChronologicalFeedItem, now: Date): number {
  return scheduledDate(item, now).getTime();
}
