import { readStoredAvatar } from './profileAvatar';

export const REACTION_EMOJI = ['🔥', '👏', '😂', '🎉', '✨', '👀'] as const;

export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

export interface PhotoReaction {
  actor: string;
  emoji: string;
}

export interface HostPhoto {
  id: string;
  eventTitle: string;
  eventPlace: string;
  territory: string;
  eventAt: string;
  imageUri: string;
  reactions: PhotoReaction[];
}

export interface HostGallery {
  handle: string;
  displayName: string;
  following: number;
  followers: number;
  activities: number;
  avatarUri: string;
  photos: HostPhoto[];
}

export function emojiAllowed(emoji: string): emoji is ReactionEmoji {
  return (REACTION_EMOJI as readonly string[]).includes(emoji);
}

export function applyEmojiReaction(
  reactions: PhotoReaction[],
  actor: string,
  emoji: string,
): { reactions: PhotoReaction[]; error: string } {
  const name = actor.trim().replace(/^@+/, '');
  if (!name || !emojiAllowed(emoji)) {
    return { reactions, error: 'Photos can only be reacted to with an emoji.' };
  }
  const existing = reactions.find((reaction) => reaction.actor === name);
  if (existing?.emoji === emoji) {
    return { reactions: reactions.filter((reaction) => reaction.actor !== name), error: '' };
  }
  return {
    reactions: [...reactions.filter((reaction) => reaction.actor !== name), { actor: name, emoji }],
    error: '',
  };
}

function sceneUri(kind: 'stage' | 'market'): string {
  const svg = kind === 'stage'
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
        <rect width="640" height="360" fill="#0f172a"/>
        <rect y="230" width="640" height="130" fill="#1e293b"/>
        <rect x="140" y="150" width="360" height="110" rx="8" fill="#f97316"/>
        <circle cx="230" cy="110" r="28" fill="#38bdf8"/>
        <circle cx="410" cy="96" r="22" fill="#facc15"/>
      </svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
        <rect width="640" height="360" fill="#e0f2fe"/>
        <rect y="210" width="640" height="150" fill="#86efac"/>
        <rect x="50" y="130" width="160" height="120" rx="8" fill="#f97316"/>
        <rect x="240" y="100" width="170" height="150" rx="8" fill="#facc15"/>
        <rect x="440" y="145" width="150" height="105" rx="8" fill="#0ea5e9"/>
      </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function localGallery(handle: string): HostGallery {
  const name = handle.trim() || 'Ranger-F0A5ACCF';
  return {
    handle: name,
    displayName: name,
    following: 6,
    followers: 14,
    activities: 2,
    avatarUri: readStoredAvatar(name),
    photos: [
      {
        id: 'photo-owls',
        eventTitle: 'The Midnight Owls • Live at The Rusty Anchor',
        eventPlace: 'The Rusty Anchor',
        territory: 'Downtown Boulder',
        eventAt: '2026-10-07T20:00:00.000Z',
        imageUri: sceneUri('stage'),
        reactions: [
          { actor: 'anna_vibe', emoji: '🔥' },
          { actor: 'sam_travels', emoji: '🎉' },
        ],
      },
      {
        id: 'photo-tacos',
        eventTitle: 'Taco Tuesday Truck Rally • Central Park Plaza',
        eventPlace: 'Central Park Plaza',
        territory: 'Downtown Boulder',
        eventAt: '2026-10-06T17:30:00.000Z',
        imageUri: sceneUri('market'),
        reactions: [{ actor: 'jordan_ellis', emoji: '👏' }],
      },
    ],
  };
}

export function formatEventWhen(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
