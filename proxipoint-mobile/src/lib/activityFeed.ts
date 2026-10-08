import { formatStartLabel } from './beaconSchedule';

export type ActivityKind = 'rsvp' | 'promo' | 'following' | 'friend';

export interface ActivityNode {
  id: string;
  title: string;
  venue: string;
  status: string;
  isRsvpd: boolean;
  startsAt?: string;
  hostName?: string;
}

export interface FriendRsvp {
  friend: string;
  eventId: string;
}

export interface PromoEvent {
  id: string;
  title: string;
  place: string;
  startsAt: string;
}

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  eventId?: string;
  title: string;
  detail: string;
  at: number;
}

export interface ActivitySection {
  id: ActivityKind;
  title: string;
  empty: string;
  items: ActivityEntry[];
}

export const FOLLOWED_HOSTS = ['The Midnight Owls', 'Boulder Devs'];

export const FRIEND_RSVPS: FriendRsvp[] = [
  { friend: 'jordan_ellis', eventId: 'event-2' },
  { friend: 'sam_travels', eventId: 'event-3' },
  { friend: 'maya_chen', eventId: 'event-1' },
];

const UPCOMING_GRACE_MS = 60 * 60 * 1000;

export function promotionalEvents(now: Date): PromoEvent[] {
  return [
    {
      id: 'promo-lantern',
      title: 'Lantern Walk on Pearl Street',
      place: 'Pearl Street Mall',
      startsAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'promo-market',
      title: 'Saturday Makers Market',
      place: 'Central Park Plaza',
      startsAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

export function scheduledAt(node: Pick<ActivityNode, 'startsAt' | 'status'>, now: Date): number {
  if (node.startsAt) {
    const parsed = Date.parse(node.startsAt);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (node.status === 'LIVE NOW') return now.getTime();
  const minutes = node.status.match(/Starts in (\d+)m/i);
  if (minutes) return now.getTime() + Number(minutes[1]) * 60 * 1000;
  const tomorrow = node.status.match(/Tomorrow (\d{1,2}):(\d{2})/);
  if (tomorrow) {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, Number(tomorrow[1]), Number(tomorrow[2]), 0, 0);
    return next.getTime();
  }
  return now.getTime() + 7 * 24 * 60 * 60 * 1000;
}

function isUpcoming(at: number, now: Date): boolean {
  return at >= now.getTime() - UPCOMING_GRACE_MS;
}

function whenLabel(at: number, status: string | undefined, now: Date): string {
  if (status && !status.startsWith('Tomorrow') && status !== 'LIVE NOW' && !status.startsWith('Starts in')) {
    return formatStartLabel(new Date(at), now);
  }
  if (status) return status;
  return formatStartLabel(new Date(at), now);
}

function bySoonest(left: ActivityEntry, right: ActivityEntry): number {
  return left.at - right.at;
}

export function buildActivityFeed(
  nodes: ActivityNode[],
  now: Date,
  followedHosts: readonly string[] = FOLLOWED_HOSTS,
  friendRsvps: readonly FriendRsvp[] = FRIEND_RSVPS,
): ActivitySection[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const followed = new Set(followedHosts.map((host) => host.toLowerCase()));

  const rsvps = nodes
    .filter((node) => node.isRsvpd)
    .map((node) => {
      const at = scheduledAt(node, now);
      return {
        id: `rsvp:${node.id}`,
        kind: 'rsvp' as const,
        eventId: node.id,
        title: node.title,
        detail: `${node.venue} · ${whenLabel(at, node.startsAt ? undefined : node.status, now)}`,
        at,
      };
    })
    .sort(bySoonest);

  const promos = promotionalEvents(now)
    .map((promo) => {
      const at = Date.parse(promo.startsAt);
      return {
        id: `promo:${promo.id}`,
        kind: 'promo' as const,
        title: promo.title,
        detail: `${promo.place} · ${formatStartLabel(new Date(at), now)}`,
        at,
      };
    })
    .filter((promo) => isUpcoming(promo.at, now))
    .sort(bySoonest);

  const following = nodes
    .filter((node) => node.hostName && followed.has(node.hostName.toLowerCase()))
    .map((node) => {
      const at = scheduledAt(node, now);
      return { node, at };
    })
    .filter(({ at }) => isUpcoming(at, now))
    .map(({ node, at }) => ({
      id: `following:${node.hostName}:${node.id}`,
      kind: 'following' as const,
      eventId: node.id,
      title: node.title,
      detail: `${node.hostName} · ${whenLabel(at, node.startsAt ? undefined : node.status, now)}`,
      at,
    }))
    .sort(bySoonest);

  const friends = friendRsvps
    .flatMap((rsvp) => {
      const node = byId.get(rsvp.eventId);
      if (!node) return [];
      const at = scheduledAt(node, now);
      if (!isUpcoming(at, now)) return [];
      return [{
        id: `friend:${rsvp.friend}:${node.id}`,
        kind: 'friend' as const,
        eventId: node.id,
        title: node.title,
        detail: `@${rsvp.friend} RSVP'd · ${whenLabel(at, node.startsAt ? undefined : node.status, now)}`,
        at,
      }];
    })
    .sort(bySoonest);

  return [
    { id: 'rsvp', title: 'RSVP scheduled events', empty: 'You have no RSVPs yet.', items: rsvps },
    { id: 'promo', title: 'Upcoming recommended events', empty: 'No promotions right now.', items: promos },
    { id: 'following', title: 'Hosts you follow', empty: 'No upcoming events from hosts you follow.', items: following },
    { id: 'friend', title: "Friends' RSVPs", empty: 'None of your friends have an RSVP yet.', items: friends },
  ];
}

export function unreadActivityIds(sections: ActivitySection[], seen: readonly string[]): string[] {
  const seenSet = new Set(seen);
  const unread: string[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      if (!seenSet.has(item.id)) unread.push(item.id);
    }
  }
  return unread;
}
