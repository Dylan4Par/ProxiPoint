import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  Beer,
  Bike,
  BookOpen,
  Camera,
  Coffee,
  Dumbbell,
  Flame,
  Gamepad2,
  Mic,
  Music,
  Palette,
  PartyPopper,
  Terminal,
  Trees,
  Trophy,
  HandHeart,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Round badge on Discover cards. Shows the event's cover photo when it has one; otherwise an
 * icon picked from its tag, tinted by category. Unknown tags fall back to the title's first
 * letter (the same fallback My Drops uses).
 */

/** Palette names (see src/theme/palette.ts), so each tint has a day and a night version. */
interface Tint {
  color: keyof ThemeColors;
  fill: keyof ThemeColors;
}

const TINTS = {
  cyan: { color: 'accent', fill: 'accentTint' },
  amber: { color: 'amber', fill: 'amberTint' },
  blue: { color: 'sky', fill: 'blueTint' },
  green: { color: 'green', fill: 'greenTint' },
  violet: { color: 'violet', fill: 'violetTint' },
  pink: { color: 'pink', fill: 'pinkTint' },
} satisfies Record<string, Tint>;

interface CategoryRule {
  /** Matched against the tag with "#" removed, lowercased. First matching rule wins. */
  keywords: string[];
  Icon: LucideIcon;
  tint: Tint;
}

/** Add rules here as new tags show up. Put specific words before general ones. */
export const CATEGORY_RULES: CategoryRule[] = [
  { keywords: ['foodtruck', 'bbq', 'grill', 'taco'], Icon: Flame, tint: TINTS.amber },
  { keywords: ['coffee', 'cafe', 'brunch'], Icon: Coffee, tint: TINTS.amber },
  { keywords: ['beer', 'brew', 'pub', 'wine', 'happyhour'], Icon: Beer, tint: TINTS.amber },
  { keywords: ['food', 'farmers', 'market', 'dinner', 'potluck', 'eat'], Icon: Utensils, tint: TINTS.amber },
  { keywords: ['music', 'band', 'concert', 'jazz', 'dj', 'gig'], Icon: Music, tint: TINTS.cyan },
  { keywords: ['comedy', 'openmic', 'karaoke', 'poetry'], Icon: Mic, tint: TINTS.pink },
  { keywords: ['party', 'nightlife', 'club', 'dance'], Icon: PartyPopper, tint: TINTS.pink },
  { keywords: ['tech', 'code', 'dev', 'gis', 'hack', 'kotlin', 'python', 'startup'], Icon: Terminal, tint: TINTS.blue },
  { keywords: ['game', 'gaming', 'boardgame', 'trivia'], Icon: Gamepad2, tint: TINTS.violet },
  { keywords: ['art', 'paint', 'craft', 'gallery', 'design'], Icon: Palette, tint: TINTS.violet },
  { keywords: ['photo', 'film', 'movie'], Icon: Camera, tint: TINTS.violet },
  { keywords: ['book', 'read', 'study', 'class', 'workshop'], Icon: BookOpen, tint: TINTS.blue },
  { keywords: ['pickle', 'tennis', 'soccer', 'basket', 'volley', 'sport'], Icon: Trophy, tint: TINTS.green },
  { keywords: ['bike', 'cycling', 'ride'], Icon: Bike, tint: TINTS.green },
  { keywords: ['fitness', 'run', 'yoga', 'gym', 'workout', 'climb'], Icon: Dumbbell, tint: TINTS.green },
  { keywords: ['hike', 'hiking', 'outdoor', 'park', 'trail', 'camp', 'nature'], Icon: Trees, tint: TINTS.green },
  { keywords: ['volunteer', 'cleanup', 'charity', 'donate'], Icon: HandHeart, tint: TINTS.green },
  { keywords: ['meetup', 'social', 'network', 'community'], Icon: Users, tint: TINTS.cyan },
];

export function categoryFor(tag: string | undefined): CategoryRule | null {
  const key = (tag ?? '').replace(/^#+/, '').toLowerCase();
  if (!key) return null;
  return CATEGORY_RULES.find((rule) => rule.keywords.some((word) => key.includes(word))) ?? null;
}

const SIZE = 46;

export const CategoryBadge: React.FC<{
  tag?: string;
  title?: string;
  photoUri?: string | null;
  size?: number;
}> = ({ tag, title, photoUri, size = SIZE }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const rule = categoryFor(tag);
  const tintNames: Tint = rule?.tint ?? TINTS.cyan;
  const tint = { color: c[tintNames.color], fill: c[tintNames.fill] };
  const ring = { width: size, height: size, borderRadius: size / 2 };
  const halo = { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 };

  return (
    <View style={[styles.wrap, halo]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Soft glow ring (a plain view, so it looks the same on Android as on iOS). */}
      <View style={[styles.halo, halo, { borderColor: tint.color }]} />
      <View style={[styles.circle, ring, { borderColor: tint.color, backgroundColor: tint.fill }]}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} />
        ) : rule ? (
          <rule.Icon size={Math.round(size * 0.46)} color={tint.color} strokeWidth={2} />
        ) : (
          <Text style={[styles.initial, { color: tint.color, fontSize: Math.round(size * 0.4) }]}>
            {(title ?? '').trim().charAt(0).toUpperCase() || '•'}
          </Text>
        )}
      </View>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    borderWidth: 3,
    opacity: 0.18,
  },
  circle: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  initial: {
    fontWeight: '800',
  },
});
