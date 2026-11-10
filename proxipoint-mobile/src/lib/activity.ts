import { useEffect, useState } from 'react';
import { getActiveBoosts, formatTimeLeft } from './boost';
import { isNodeAllowed } from './moderation';

/**
 * Activity feed: alerts for new Points and Boosts that match the #tags on your profile.
 * Kept in memory for now. Server side later, the matching should happen on the server so
 * alerts arrive even when the app is closed:
 *   PUT  /me/interest-tags   { tags, public }
 *   GET  /me/activity        (newest first, with read state)
 *   POST /me/activity/read   (mark all read)
 * plus a push notification (expo-notifications) for each new alert.
 */

export type ActivityKind = 'new_point' | 'boost';

export interface ActivityItem {
  /** One alert per Point ("new:<id>") and per boost ("boost:<id>:<start>"). */
  id: string;
  kind: ActivityKind;
  pointId: string;
  /** The followed #tag that matched, e.g. "#LiveMusic". */
  tag: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

const MAX_ITEMS = 100;

let items: ActivityItem[] = [];
const listeners = new Set<() => void>();

function changed() {
  listeners.forEach((listener) => listener());
}

export function getActivity(): ActivityItem[] {
  return items;
}

export function unreadCount(): number {
  return items.filter((item) => !item.read).length;
}

export function markAllActivityRead() {
  if (!items.some((item) => !item.read)) return;
  items = items.map((item) => (item.read ? item : { ...item, read: true }));
  changed();
}

export function clearActivity() {
  items = [];
  changed();
}

/** Re-renders the caller whenever the feed changes. */
export function useActivity(): ActivityItem[] {
  const [current, setCurrent] = useState(items);
  useEffect(() => {
    const listener = () => setCurrent(items);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return current;
}

/** "livemusic" from "#LiveMusic" */
function key(tag: string): string {
  return tag.replace(/^#+/, '').trim().toLowerCase();
}

/** "#LiveMusic" — keeps the user's casing. */
function display(tag: string): string {
  return `#${tag.replace(/^#+/, '').trim()}`;
}

interface NodeLike {
  id: string;
  title?: string;
  tag?: string;
  tags?: string[];
  venue?: string;
  status?: string;
  endsAt?: string;
  origin?: string;
  locationPrivacy?: { regionName?: string } | null;
}

function nodeTags(node: NodeLike): string[] {
  const list = Array.isArray(node.tags) && node.tags.length ? node.tags : node.tag ? [node.tag] : [];
  return list.filter(Boolean);
}

/** The first of the node's tags that you follow, as you wrote it. */
function matchingTag(node: NodeLike, followed: Map<string, string>): string | null {
  for (const tag of nodeTags(node)) {
    const hit = followed.get(key(tag));
    if (hit) return hit;
  }
  return null;
}

function whereOf(node: NodeLike): string {
  if (node.locationPrivacy?.regionName) return `somewhere in ${node.locationPrivacy.regionName}`;
  return node.venue ? `at ${node.venue}` : '';
}

/**
 * Compares what's on Discover with your #tags and adds alerts for anything new:
 * Points you haven't been told about yet, and boosts that just started.
 * Your own Points, ended ones, and anything you reported or whose host you blocked are skipped.
 */
export function checkTagAlerts(nodes: Record<string, NodeLike> | null | undefined, interestTags: string[], now = Date.now()) {
  if (!interestTags.length || !nodes) return;
  const followed = new Map(interestTags.map((tag) => [key(tag), display(tag)]));
  const known = new Set(items.map((item) => item.id));
  const fresh: ActivityItem[] = [];
  const stamp = new Date(now).toISOString();

  const eligible = (node: NodeLike) =>
    node.origin !== 'local' &&
    isNodeAllowed(node) &&
    !(node.endsAt && new Date(node.endsAt).getTime() <= now);

  for (const node of Object.values(nodes)) {
    if (!node || !eligible(node)) continue;
    const tag = matchingTag(node, followed);
    if (!tag) continue;
    const id = `new:${node.id}`;
    if (known.has(id)) continue;
    const where = whereOf(node);
    fresh.push({
      id,
      kind: 'new_point',
      pointId: node.id,
      tag,
      title: `New Point · ${tag}`,
      body: [node.title ?? 'A new Point', [node.status, where].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
      createdAt: stamp,
      read: false,
    });
  }

  for (const boost of getActiveBoosts(now)) {
    const node = nodes[boost.pointId];
    if (!node || !eligible(node)) continue;
    const tag = matchingTag(node, followed);
    if (!tag) continue;
    const id = `boost:${boost.pointId}:${boost.startedAt}`;
    if (known.has(id)) continue;
    fresh.push({
      id,
      kind: 'boost',
      pointId: node.id,
      tag,
      title: `Boosted · ${tag}`,
      body: `${node.title ?? 'A Point'} is boosted for the next ${formatTimeLeft(boost.endsAt, now)}${node.status ? ` · ${node.status}` : ''}`,
      createdAt: stamp,
      read: false,
    });
  }

  if (!fresh.length) return;
  // Boosts first within a batch, then newest batches on top.
  fresh.sort((a, b) => Number(b.kind === 'boost') - Number(a.kind === 'boost'));
  items = [...fresh, ...items].slice(0, MAX_ITEMS);
  changed();
}

/** "now", "5m", "3h", "2d" */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
