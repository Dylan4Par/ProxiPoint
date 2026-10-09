import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Compass,
  Flame,
  Music,
  PersonStanding,
  Radio,
  Terminal,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native';
import { resolveTagAnchor, type ChannelIconName } from '../../lib/tagIcons';

const ICONS: Record<ChannelIconName, LucideIcon> = {
  note: Music,
  terminal: Terminal,
  flame: Flame,
  utensils: Utensils,
  runner: PersonStanding,
  compass: Compass,
  beacon: Radio,
};

interface Props {
  tag: string;
  size?: number;
}

export const ChannelBadge: React.FC<Props> = ({ tag, size = 44 }) => {
  const anchor = resolveTagAnchor(tag);
  const Icon = ICONS[anchor.icon];
  const iconSize = Math.round(size * 0.48);

  return (
    <View
      accessibilityLabel={`${tag} channel`}
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.32),
          backgroundColor: anchor.surface,
          borderColor: anchor.border,
        },
      ]}
    >
      <Icon color={anchor.accent} size={iconSize} strokeWidth={2.25} />
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
