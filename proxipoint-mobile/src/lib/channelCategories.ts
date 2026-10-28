/**
 * Categories for the chip row on Channels → My Channels → Find channels. Channels don't store a
 * category, so one is read from their #tags: a channel is in every category any of its tags is in
 * (a channel with no matching tags only shows under All).
 */
export type ChannelCategory = 'all' | 'sports' | 'arts' | 'tech' | 'food';

export const CHANNEL_CATEGORIES: { id: ChannelCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sports', label: 'Sports & Rec' },
  { id: 'arts', label: 'Music & Arts' },
  { id: 'tech', label: 'Tech' },
  { id: 'food', label: 'Food & Drink' },
];

const CATEGORY_TAGS: Record<Exclude<ChannelCategory, 'all'>, string[]> = {
  sports: [
    'pickleball', 'openplay', 'hiking', 'nighthike', 'outdoors', 'yoga', 'sunrise', 'running', 'runclub',
    'cycling', 'biking', 'climbing', 'bouldering', 'soccer', 'basketball', 'volleyball', 'tennis', 'golf',
    'disc golf', 'discgolf', 'skiing', 'snowboarding', 'fitness', 'pickup', 'sports', 'kayaking', 'paddleboard',
  ],
  arts: [
    'livemusic', 'jazz', 'soul', 'openmic', 'vinylnight', 'concert', 'karaoke', 'dj', 'music', 'comedy',
    'artwalk', 'gallery', 'localartists', 'art', 'arts', 'theater', 'theatre', 'film', 'poetry', 'dance',
    'photography', 'crafts', 'murals',
  ],
  tech: ['techmeetup', 'tech', 'kotlin', 'gis', 'coding', 'hackathon', 'makers', 'maker', 'startup', 'ai', 'robotics', 'gamedev'],
  food: [
    'foodtrucks', 'tacotuesday', 'farmersmarket', 'localfood', 'tasting', 'food', 'brewery', 'beer', 'craftbeer',
    'coffee', 'wine', 'winetasting', 'happyhour', 'brunch', 'cocktails', 'popupdinner', 'bakery',
  ],
};

const norm = (tag: string) => tag.replace(/^#/, '').toLowerCase();

/** Whether a channel with these #tags belongs under the chip. 'all' always matches. */
export function channelInCategory(tags: readonly string[] | undefined, category: ChannelCategory): boolean {
  if (category === 'all') return true;
  const wanted = CATEGORY_TAGS[category];
  return (tags ?? []).some((tag) => wanted.includes(norm(tag)));
}
