import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Globe, Lock, Plus } from 'lucide-react-native';
import { CategoryBadge } from '../discovery/CategoryBadge';
import { useChannels } from '../../lib/channels';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Profile → MY CHANNELS: the channels you've joined, with a Public / Private switch
 * (same look as MY #TAGS). Public: listed on your public profile. Private: only you see them;
 * you're still a member either way.
 * Server side later: PATCH /me { channelsPublic }, and GET /users/:handle/channels returns the
 * list only when it's public.
 */
export const MyChannelsTile: React.FC<{
  isPublic: boolean;
  onChangePublic: (isPublic: boolean) => void;
  onOpenChannel: (id: string) => void;
  /** Channels tab → My Channels, to join more. */
  onBrowse: () => void;
}> = ({ isPublic, onChangePublic, onOpenChannel, onBrowse }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const joined = useChannels().filter((channel) => channel.joined);

  return (
    <View style={styles.tile} testID="profile-channels">
      <View style={styles.visibilityRow}>
        {isPublic ? (
          <Globe size={16} color={c.green} strokeWidth={2.25} />
        ) : (
          <Lock size={16} color={c.textMuted} strokeWidth={2.25} />
        )}
        <View style={styles.visibilityCopy}>
          <Text style={styles.visibilityLabel}>{isPublic ? 'Public' : 'Private'}</Text>
          <Text style={styles.hint}>
            {isPublic ? 'Shown on your public profile.' : 'Only you can see which channels you’re in.'}
          </Text>
        </View>
        <Switch
          value={isPublic}
          onValueChange={onChangePublic}
          trackColor={{ false: c.borderStrong, true: c.accentTrack }}
          thumbColor={isPublic ? c.accent : c.textMuted}
          accessibilityLabel="Show my channels on my public profile"
          testID="profile-channels-public"
        />
      </View>

      {joined.length ? (
        <View style={styles.chips}>
          {joined.map((channel) => (
            <TouchableOpacity
              key={channel.id}
              style={styles.chip}
              onPress={() => onOpenChannel(channel.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${channel.name}`}
              testID={`profile-channel-${channel.id}`}
            >
              <CategoryBadge tag={channel.tags[0]} title={channel.name} size={20} />
              <Text style={styles.chipText} numberOfLines={1}>
                {channel.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>No channels yet.</Text>
      )}

      <TouchableOpacity
        style={styles.findBtn}
        onPress={onBrowse}
        accessibilityRole="button"
        testID="profile-find-channels"
      >
        <Plus size={15} color={c.accent} strokeWidth={2.5} />
        <Text style={styles.findText}>Find channels</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    tile: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      gap: 12,
    },
    visibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    visibilityCopy: { flex: 1, gap: 1 },
    visibilityLabel: { color: c.text, fontSize: 14, fontWeight: '700' },
    hint: { flex: 1, color: c.textMuted, fontSize: 12, lineHeight: 17 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingLeft: 4,
      paddingRight: 12,
      paddingVertical: 4,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.accentBorder,
      backgroundColor: c.accentTint,
    },
    chipText: { color: c.accent, fontSize: 13, fontWeight: '800', flexShrink: 1 },
    empty: { color: c.textFaint, fontSize: 13 },
    findBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    findText: { color: c.accent, fontSize: 14, fontWeight: '800' },
  });
