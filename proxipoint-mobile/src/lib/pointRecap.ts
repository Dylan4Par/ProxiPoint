/**
 * Point recaps: a short post about a Point you hosted, with up to 3 photos.
 * People can react with emojis (on the post and on each photo). There are no comments.
 *
 * Kept in memory for now (DiscoverScreen holds them). Server side later:
 *   POST   /points/:id/recaps            create (photos uploaded first, then URLs sent)
 *   GET    /users/:id/recaps             list for a profile
 *   PUT    /recaps/:id/reactions/:emoji  add my reaction   (DELETE to remove it)
 *   PUT    /recaps/:id/photos/:photoId/reactions/:emoji
 */

/** The only reactions allowed. A fixed set keeps it friendly and easy to moderate. */
export const REACTION_EMOJIS = ['🎉', '🔥', '❤️', '👏', '😂', '🙌'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Per emoji: how many people reacted, and whether I'm one of them. */
export type Reactions = Partial<Record<ReactionEmoji, { count: number; mine: boolean }>>;

export const RECAP_TEXT_LIMIT = 280;
export const RECAP_PHOTO_LIMIT = 3;

export interface RecapPhoto {
  id: string;
  uri: string;
  reactions: Reactions;
}

export interface PointRecap {
  id: string;
  pointId: string;
  /** Copied from the Point when posting, so the recap still reads right if the Point changes. */
  pointTitle: string;
  pointStartsAt: string;
  /** Public place text (never the exact spot when location privacy was on). */
  where: string;
  text: string;
  photos: RecapPhoto[];
  reactions: Reactions;
  createdAt: string;
}

/** Adds my reaction, or takes it back if I already used that emoji. */
export function toggleReaction(reactions: Reactions, emoji: ReactionEmoji): Reactions {
  const current = reactions[emoji] ?? { count: 0, mine: false };
  const next = current.mine
    ? { count: Math.max(0, current.count - 1), mine: false }
    : { count: current.count + 1, mine: true };
  const updated: Reactions = { ...reactions, [emoji]: next };
  if (next.count === 0) delete updated[emoji];
  return updated;
}

export function reactionTotal(reactions: Reactions): number {
  return Object.values(reactions).reduce((sum, entry) => sum + (entry?.count ?? 0), 0);
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
