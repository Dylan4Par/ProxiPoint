import type { BeaconDuration, BeaconVisibility } from '../types/beacon';

export const GEOCODE_DEBOUNCE_MS = 300;

export function parseBeaconTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of raw.split(/[,\s]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const tag = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    if (tag === '#' || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

export function primaryBeaconTag(raw: string): string {
  return parseBeaconTags(raw)[0] ?? '#Beacon';
}

export function describeBeaconTiming(input: {
  isLiveNow: boolean;
  duration: BeaconDuration;
  scheduledStart: string;
}): { status: string; statusColor: string } {
  if (input.isLiveNow) {
    return { status: 'LIVE NOW', statusColor: '#10b981' };
  }
  const when = input.scheduledStart.trim() || 'scheduled';
  return { status: `Starts ${when}`, statusColor: '#38bdf8' };
}

export function isBeaconVisibility(value: string): value is BeaconVisibility {
  return value === 'private' || value === 'tag_network' || value === 'public';
}
