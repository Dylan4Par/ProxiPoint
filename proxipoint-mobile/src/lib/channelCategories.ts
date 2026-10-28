/**
 * Categories for the chip row on Channels → My Channels → Find channels. Channels don't store a
 * category: each of their #tags has one on the allowed list (lib/hashtags), and each chip covers
 * one or more of those categories. A channel is under every chip any of its tags falls in (a
 * channel whose tags only fall in uncovered categories shows under All).
 */
import { findHashtag, type HashtagCategoryId } from './hashtags';

export type ChannelCategory = 'all' | 'sports' | 'arts' | 'tech' | 'food';

export const CHANNEL_CATEGORIES: { id: ChannelCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sports', label: 'Sports & Rec' },
  { id: 'arts', label: 'Music & Arts' },
  { id: 'tech', label: 'Tech' },
  { id: 'food', label: 'Food & Drink' },
];

/** Which of the list's categories each chip covers. */
const CHIP_CATEGORIES: Record<Exclude<ChannelCategory, 'all'>, HashtagCategoryId[]> = {
  sports: ['sports-fitness', 'outdoors-recreation'],
  arts: ['music-nightlife', 'arts-culture'],
  tech: ['tech-professional'],
  food: ['food-dining'],
};

/** Whether a channel with these #tags belongs under the chip. 'all' always matches. */
export function channelInCategory(tags: readonly string[] | undefined, category: ChannelCategory): boolean {
  if (category === 'all') return true;
  const wanted = CHIP_CATEGORIES[category];
  return (tags ?? []).some((tag) => {
    const entry = findHashtag(tag);
    return entry ? wanted.includes(entry.category) : false;
  });
}
