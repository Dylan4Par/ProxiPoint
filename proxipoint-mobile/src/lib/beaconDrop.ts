export const MAX_BEACON_CHANNELS = 3;

export interface ChannelSelection {
  selected: string[];
  rejected: boolean;
}

/** Keep selection order. The first entry is the tag shown when the map filter is All. */
export function toggleChannel(selected: string[], channel: string): ChannelSelection {
  const clean = channel.trim();
  if (!clean || clean === 'All') {
    return { selected, rejected: true };
  }
  if (selected.includes(clean)) {
    return { selected: selected.filter((item) => item !== clean), rejected: false };
  }
  if (selected.length >= MAX_BEACON_CHANNELS) {
    return { selected, rejected: true };
  }
  return { selected: [...selected, clean], rejected: false };
}

export function assignedTags(tags: string[] | undefined, fallback = ''): string[] {
  const source = tags && tags.length > 0 ? tags : fallback ? [fallback] : [];
  const unique: string[] = [];
  for (const tag of source) {
    const clean = tag.trim();
    if (!clean || clean === 'All' || unique.includes(clean)) continue;
    unique.push(clean);
    if (unique.length === MAX_BEACON_CHANNELS) break;
  }
  return unique;
}

/**
 * A map point shows a single channel. With the All filter that channel is the
 * first one assigned when the beacon was created.
 */
export function presentAssignedTag(tags: string[] | undefined, mapFilter: string, fallback = ''): string {
  const assigned = assignedTags(tags, fallback);
  if (assigned.length === 0) return '';
  if (mapFilter === 'All') return assigned[0];
  if (assigned.includes(mapFilter)) return mapFilter;
  return assigned[0];
}

export function eventMatchesMapFilter(tags: string[] | undefined, mapFilter: string, fallback = ''): boolean {
  if (mapFilter === 'All') return true;
  return assignedTags(tags, fallback).includes(mapFilter);
}
