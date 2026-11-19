import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Heart, MapPin } from 'lucide-react-native';
import { timeAgo } from '../../lib/activity';
import { getChannel, type ChannelPost } from '../../lib/channels';
import { pinTimeLeft } from '../../lib/postRanking';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * A grouped post bubble on the map was tapped: list its posts (best first) to pick one.
 * Same idea as ClusterPickSheet for Points.
 */
export const PostPickSheet: React.FC<{
  posts: ChannelPost[] | null;
  now: number;
  onPick: (id: string) => void;
  onClose: () => void;
}> = ({ posts, now, onPick, onClose }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  if (!posts) return null;
  const sorted = [...posts].sort(
    (a, b) => b.upvotes - a.upvotes || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const places = [...new Set(sorted.map((post) => post.place?.label).filter(Boolean))];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} testID="post-pick-sheet">
        <View style={styles.handle} />
        <Text style={styles.title}>{sorted.length} posts here</Text>
        {places.length ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {places.join(' · ')}
          </Text>
        ) : null}
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {sorted.map((post) => {
            const channel = getChannel(post.channelId);
            const left = pinTimeLeft(post, now);
            return (
              <TouchableOpacity
                key={post.id}
                style={styles.row}
                onPress={() => onPick(post.id)}
                accessibilityRole="button"
                accessibilityLabel={`${channel?.handle ?? ''} ${post.body}`}
                testID={`post-pick-${post.id}`}
              >
                <View style={styles.copy}>
                  <Text style={styles.meta} numberOfLines={1}>
                    <Text style={styles.channel}>{channel?.handle ?? ''}</Text> · {post.author} · {timeAgo(post.createdAt, now)}
                  </Text>
                  <Text style={styles.body} numberOfLines={2}>
                    {post.body}
                  </Text>
                  <View style={styles.footer}>
                    <View style={styles.footerItem}>
                      <Heart size={12} color={c.textMuted} strokeWidth={2} />
                      <Text style={styles.footerText}>{post.upvotes}</Text>
                    </View>
                    {post.place ? (
                      <View style={styles.footerItem}>
                        <MapPin size={12} color={c.violet} strokeWidth={2.5} />
                        <Text style={styles.footerText} numberOfLines={1}>
                          {post.place.label}
                          {left ? ` · ${left}` : ''}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <ChevronRight size={16} color={c.iconFaint} strokeWidth={2.25} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.55)' },
    sheet: {
      maxHeight: '70%',
      backgroundColor: c.sheet,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingTop: 8,
      paddingHorizontal: 16,
      borderTopWidth: 1,
      borderColor: c.border,
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: 12 },
    title: { color: c.text, fontSize: 17, fontWeight: '800' },
    subtitle: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    list: { marginTop: 12 },
    listContent: { gap: 10, paddingBottom: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
    },
    copy: { flex: 1, gap: 4 },
    meta: { color: c.textFaint, fontSize: 12 },
    channel: { color: c.accent, fontWeight: '800' },
    body: { color: c.text, fontSize: 14, lineHeight: 19 },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    footerItem: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
    footerText: { color: c.textMuted, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  });
