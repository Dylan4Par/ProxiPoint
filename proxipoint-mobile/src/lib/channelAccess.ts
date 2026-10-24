import type { Channel } from './channels';

/**
 * Who can see and post in a channel. Pure (no React), so it's testable and the server can apply
 * the same rules:
 * - Public: anyone can view, post and comment.
 * - Restricted: anyone can view and comment; only approved members can post.
 * - Private: only approved members can view, post and comment. Others see its name and
 *   description, and can ask to join.
 * The channel's moderator is always approved.
 */

export type ChannelAccess = 'public' | 'restricted' | 'private';

export const CHANNEL_ACCESS: Array<{ id: ChannelAccess; label: string; summary: string }> = [
  { id: 'public', label: 'Public', summary: 'Anyone can view, post and comment.' },
  { id: 'restricted', label: 'Restricted', summary: 'Anyone can view and comment, but only approved members can post.' },
  { id: 'private', label: 'Private', summary: 'Only approved members can view, post and comment.' },
];

export const CHANNEL_NAME_MIN = 3;
export const CHANNEL_NAME_MAX = 40;
export const CHANNEL_DESCRIPTION_MAX = 200;
export const CHANNEL_TAG_LIMIT = 5;

type AccessFields = Pick<Channel, 'access' | 'joined' | 'approved' | 'moderator' | 'requested'>;

export function accessOf(channel: Pick<Channel, 'access'> | null | undefined): ChannelAccess {
  const access = channel?.access;
  return access === 'restricted' || access === 'private' ? access : 'public';
}

export function isApproved(channel: AccessFields): boolean {
  return Boolean(channel.moderator || channel.approved);
}

/** Can you see its posts, comments and Points? (Unknown channels: yes, nothing to hide.) */
export function canViewChannel(channel: AccessFields | null | undefined): boolean {
  if (!channel) return true;
  return accessOf(channel) !== 'private' || isApproved(channel);
}

export function canPostIn(channel: AccessFields): boolean {
  return accessOf(channel) === 'public' || isApproved(channel);
}

/** Comments are open wherever you can view (restricted channels only limit posts). */
export function canCommentIn(channel: AccessFields | null | undefined): boolean {
  return canViewChannel(channel);
}

/** What the Join button does for you right now. */
export type MembershipAction = 'moderator' | 'leave' | 'join' | 'request' | 'requested';

export function membershipAction(channel: AccessFields): MembershipAction {
  if (channel.moderator) return 'moderator';
  if (channel.joined) return 'leave';
  if (accessOf(channel) === 'private') return channel.requested ? 'requested' : 'request';
  return 'join';
}

export const MEMBERSHIP_LABEL: Record<MembershipAction, string> = {
  moderator: 'MODERATOR',
  leave: 'JOINED',
  join: 'JOIN',
  request: 'REQUEST',
  requested: 'REQUESTED',
};

/** "Front Range Vinyl!" → "frontrangevinyl" (letters and digits only). */
export function channelSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
}

/** A c/handle no other channel uses ("c/vinyl", then "c/vinyl2", …). */
export function uniqueHandle(name: string, taken: string[]): string {
  const base = channelSlug(name) || 'channel';
  const used = new Set(taken.map((handle) => handle.toLowerCase()));
  if (!used.has(`c/${base}`)) return `c/${base}`;
  for (let n = 2; ; n += 1) {
    if (!used.has(`c/${base}${n}`)) return `c/${base}${n}`;
  }
}

export interface NewChannelInput {
  name: string;
  description: string;
  tags: string[];
  access: ChannelAccess;
}

/** What's wrong with a new channel, field by field (empty when it's good to create). */
export function validateNewChannel(
  input: NewChannelInput,
  existing: Array<Pick<Channel, 'name'>>,
): Partial<Record<'name' | 'description' | 'tags', string>> {
  const errors: Partial<Record<'name' | 'description' | 'tags', string>> = {};
  const name = input.name.trim();
  if (name.length < CHANNEL_NAME_MIN) errors.name = `At least ${CHANNEL_NAME_MIN} characters.`;
  else if (name.length > CHANNEL_NAME_MAX) errors.name = `${CHANNEL_NAME_MAX} characters at most.`;
  else if (!channelSlug(name)) errors.name = 'Use some letters or numbers.';
  else if (existing.some((channel) => channel.name.trim().toLowerCase() === name.toLowerCase())) {
    errors.name = 'A channel with this name already exists.';
  }
  if (input.description.trim().length > CHANNEL_DESCRIPTION_MAX) {
    errors.description = `${CHANNEL_DESCRIPTION_MAX} characters at most.`;
  }
  if (input.tags.length > CHANNEL_TAG_LIMIT) errors.tags = `${CHANNEL_TAG_LIMIT} #tags at most.`;
  return errors;
}
