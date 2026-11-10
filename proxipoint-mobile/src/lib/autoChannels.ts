import type { Channel } from './channels';

/**
 * Channels that start themselves, so a new area never opens on an empty Channels tab:
 * - one general channel per city ("Erie Local"), for anything happening around it;
 * - one per #tag that Points around the city use as their main tag but no channel covers yet
 *   ("Erie Vinyl Night").
 * They start unclaimed with no members. Someone local can claim one to become its moderator.
 * Pure (no React) so it's testable; the server can run the same rules when Points come in.
 */

export interface AutoNode {
  id: string;
  tag?: string;
  tags?: string[];
  endsAt?: string;
  origin?: string;
}

const key = (tag: string) => tag.replace(/^#+/, '').trim().toLowerCase();
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** "#LiveMusic" → "Live Music", "#BBQ_Night" → "BBQ Night". */
export function tagWords(tag: string): string {
  return tag
    .replace(/^#+/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

export function cityChannelId(city: string): string {
  return `auto-${slug(city)}-local`;
}

/**
 * The auto channels this city should have that don't exist yet (by id), in a stable order:
 * the city channel first, then tag channels by how many Points use the tag.
 */
export function planAutoChannels(
  existing: Channel[],
  nodes: Record<string, AutoNode> | AutoNode[] | null | undefined,
  city: string,
  now = Date.now(),
): Channel[] {
  const cityName = city.trim();
  const citySlug = slug(cityName);
  if (!citySlug) return [];
  const ids = new Set(existing.map((channel) => channel.id));
  const covered = new Set(existing.flatMap((channel) => channel.tags.map(key)));
  const planned: Channel[] = [];

  if (!ids.has(cityChannelId(cityName))) {
    planned.push({
      id: cityChannelId(cityName),
      name: `${cityName} Local`,
      handle: `c/${citySlug}local`,
      description: `Anything happening around ${cityName}: questions, heads-ups and plans.`,
      tags: [],
      memberCount: 0,
      joined: false,
      auto: true,
      owner: null,
    });
  }

  // Main #tags of Points that haven't ended (your own Points count too: they're local activity).
  const counts = new Map<string, { tag: string; count: number }>();
  for (const node of Array.isArray(nodes) ? nodes : Object.values(nodes ?? {})) {
    if (!node || (node.endsAt && new Date(node.endsAt).getTime() <= now)) continue;
    const main = (Array.isArray(node.tags) && node.tags[0]) || node.tag || '';
    const k = key(main);
    if (!k) continue;
    const entry = counts.get(k);
    if (entry) entry.count += 1;
    else counts.set(k, { tag: `#${main.replace(/^#+/, '')}`, count: 1 });
  }
  [...counts.entries()]
    .filter(([k]) => !covered.has(k))
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .forEach(([k, { tag }]) => {
      const id = `auto-${citySlug}-${k.replace(/[^a-z0-9]+/g, '')}`;
      if (ids.has(id)) return;
      planned.push({
        id,
        name: `${cityName} ${tagWords(tag)}`,
        handle: `c/${citySlug}${slug(k)}`,
        description: `Started automatically from Points tagged ${tag} around ${cityName}.`,
        tags: [tag],
        memberCount: 0,
        joined: false,
        auto: true,
        owner: null,
      });
    });
  return planned;
}
