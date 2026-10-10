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
import { getChannelStyle, type ChannelIconName } from '../../lib/tagIcons';

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
  const channel = getChannelStyle(tag);
  const Icon = ICONS[channel.iconName];
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
          backgroundColor: channel.bgTint,
          borderColor: channel.borderColor,
        },
      ]}
    >
      <Icon color={channel.accent} size={iconSize} strokeWidth={2.25} />
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
