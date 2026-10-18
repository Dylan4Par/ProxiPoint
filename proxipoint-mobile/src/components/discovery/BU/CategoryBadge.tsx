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
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * Round badge on Discover cards. Shows the event's cover photo when it has one; otherwise an
 * icon picked from its tag, tinted by category. Unknown tags fall back to the title's first
 * letter (the same fallback My Drops uses).
 */

interface Tint {
  color: string;
  fill: string;
}

const TINTS = {
  cyan: { color: '#22d3ee', fill: '#082f3a' },
  amber: { color: '#f59e0b', fill: '#2a1a06' },
  blue: { color: '#38bdf8', fill: '#0b2440' },
  green: { color: '#34d399', fill: '#062a1f' },
  violet: { color: '#a78bfa', fill: '#1e1340' },
  pink: { color: '#f472b6', fill: '#33102a' },
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
  { keywords: ['bike', 'cycling', 'ride'], Icon: Bike, tint: TINTS.green },
  { keywords: ['fitness', 'run', 'yoga', 'gym', 'workout', 'climb'], Icon: Dumbbell, tint: TINTS.green },
  { keywords: ['hike', 'outdoor', 'park', 'trail', 'camp', 'nature'], Icon: Trees, tint: TINTS.green },
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
  const rule = categoryFor(tag);
  const tint = rule?.tint ?? TINTS.cyan;
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

const styles = StyleSheet.create({
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
