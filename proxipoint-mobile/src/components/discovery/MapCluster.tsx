import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, MessageCircle, Zap } from 'lucide-react-native';
import { CategoryBadge } from './CategoryBadge';
import { LiveBadge } from '../drops/LiveBadge';
import { timeAgo } from '../../lib/activity';
import { getChannel, type ChannelPost } from '../../lib/channels';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

const GOLD = '#f59e0b';
const GOLD_INK = '#1f1300';
/** How long each #tag shows on a bubble's label before the next one rolls up (2 seconds). */
const TAG_MS = 2000;

export interface ClusterMember {
  id: string;
  title?: string;
  tag?: string;
  tags?: string[];
  venue?: string;
  status?: string;
  coverPhotoUri?: string | null;
  locationPrivacy?: { regionName?: string } | null;
  x: number;
  y: number;
  live: boolean;
  boosted: boolean;
}

export interface MapClusterData {
  key: string;
  x: number;
  y: number;
  members: ClusterMember[];
  /** All members are at the same spot, so zooming can't split them: tapping shows a list. */
  samePlace: boolean;
  /** The selected Point is one of the members (same-spot bubbles keep it inside). */
  selected?: boolean;
}

export function mainTagOf(member: Pick<ClusterMember, 'tag' | 'tags'>): string {
  return (Array.isArray(member.tags) && member.tags[0]) || member.tag || '';
}

/** Each member's main #tag, once each (case-insensitive), boosted Points first. */
export function clusterTags(members: ClusterMember[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  members.forEach((member) => {
    const tag = mainTagOf(member);
    const key = tag.replace(/^#+/, '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    tags.push(tag.startsWith('#') ? tag : `#${tag}`);
  });
  return tags;
}

/**
 * Bubble for several Points that would overlap: count inside, gold (boosted inside) / green
 * (live inside) / cyan, and a #tag label that rolls through each Point's main tag, one a second.
 */
export const ClusterBubble: React.FC<{
  cluster: MapClusterData;
  selected?: boolean;
  /** False when the label would collide with something more important (it's hidden). */
  showLabel?: boolean;
  /** Pinned channel posts absorbed into this bubble: shown as a purple badge with the count. */
  postCount?: number;
  onPress: () => void;
}> = ({ cluster, selected = false, showLabel = true, postCount = 0, onPress }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const boosted = cluster.members.some((m) => m.boosted);
  const live = cluster.members.some((m) => m.live);
  const tags = clusterTags(cluster.members);

  // Rolling #tag label.
  const [index, setIndex] = useState(0);
  const roll = useRef(new Animated.Value(1)).current;
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => mounted && setReduced(on));
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (tags.length < 2) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % tags.length);
      if (!reduced) {
        roll.setValue(0);
        Animated.timing(roll, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      }
    }, TAG_MS);
    return () => clearInterval(timer);
  }, [tags.length, reduced, roll]);
  const tag = tags[index % Math.max(1, tags.length)] ?? '';

  const fill = boosted ? GOLD : live ? c.greenDeep : c.accentDeep;
  const ink = boosted ? GOLD_INK : '#ffffff';
  const halo = boosted ? 'rgba(245, 158, 11, 0.18)' : live ? 'rgba(16, 185, 129, 0.2)' : 'rgba(34, 211, 238, 0.16)';

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.column}
      accessibilityRole="button"
      accessibilityLabel={`${cluster.members.length} Points${boosted ? ', includes boosted' : ''}${live ? ', includes live' : ''}${
        postCount ? `, ${postCount} ${postCount === 1 ? 'post' : 'posts'}` : ''
      }: ${tags.join(', ')}. ${cluster.samePlace ? 'Show the list' : 'Zoom in'}`}
    >
      <View style={[styles.halo, { backgroundColor: halo }, selected && [styles.haloSelected, { borderColor: boosted ? GOLD : live ? c.green : c.accent }]]}>
        <View style={[styles.bubble, { backgroundColor: fill }]}>
          <Text style={[styles.count, { color: ink }]}>{cluster.members.length}</Text>
        </View>
        {/* Posts pinned here: purple speech badge at the upper right. (Boosted bubbles show it
            through their gold fill and label instead of a bolt, so this corner stays for posts.) */}
        {postCount ? (
          <View style={styles.postBadge} testID="cluster-post-badge">
            <MessageCircle size={9} color="#ffffff" fill="#ffffff" strokeWidth={2} />
            <Text style={styles.postBadgeText}>{postCount}</Text>
          </View>
        ) : null}
      </View>
      {tag && showLabel ? (
        <View style={[styles.label, boosted ? styles.labelBoosted : live ? styles.labelLive : null]}>
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.labelText,
              {
                opacity: roll,
                transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [9, 0] }) }],
              },
            ]}
          >
            <Text style={styles.labelHash}>#</Text>
            {tag.replace(/^#+/, '')}
          </Animated.Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

/** List for a bubble whose Points share one spot. Boosted first, then live, then by time. */
export const ClusterPickSheet: React.FC<{
  cluster: MapClusterData | null;
  /** The Point that was selected (e.g. its card was tapped): marked and listed first. */
  highlightId?: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
  /** Channel posts pinned at this spot: listed under the Points as post cards. */
  posts?: ChannelPost[];
  onPickPost?: (id: string) => void;
}> = ({ cluster, highlightId = null, onPick, onClose, posts = [], onPickPost }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  if (!cluster) return null;
  const members = [...cluster.members].sort(
    (a, b) =>
      Number(b.id === highlightId) - Number(a.id === highlightId) ||
      Number(b.boosted) - Number(a.boosted) ||
      Number(b.live) - Number(a.live),
  );
  const first = members[0];
  const place = first?.locationPrivacy?.regionName ? `somewhere in ${first.locationPrivacy.regionName}` : first?.venue;
  const sortedPosts = [...posts].sort(
    (a, b) => b.upvotes - a.upvotes || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const now = Date.now();
  const postsLabel = sortedPosts.length ? ` · ${sortedPosts.length} ${sortedPosts.length === 1 ? 'post' : 'posts'}` : '';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="cluster-pick-sheet">
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>
            {members.length} Points{postsLabel}{cluster.samePlace && place ? ` at ${place}` : ' here'}
          </Text>
          <Text style={styles.sheetSub}>
            {cluster.samePlace ? 'Same spot' : 'Right next to each other'} · tap one to see it
          </Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {members.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.row, m.boosted && styles.rowBoosted, m.id === highlightId && styles.rowSelected]}
                onPress={() => onPick(m.id)}
                accessibilityRole="button"
                testID={`cluster-pick-${m.id}`}
              >
                <CategoryBadge tag={mainTagOf(m)} title={m.title} photoUri={m.coverPhotoUri ?? null} size={42} />
                <View style={styles.rowCopy}>
                  <View style={styles.tagLine}>
                    <Text style={styles.rowTag}>{mainTagOf(m)}</Text>
                    {m.id === highlightId ? <Text style={styles.selectedTag}>SELECTED</Text> : null}
                    {m.boosted ? (
                      <View style={styles.boostChip}>
                        <Zap size={9} color={GOLD} fill={GOLD} strokeWidth={2} />
                        <Text style={styles.boostChipText}>BOOSTED</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {m.title}
                  </Text>
                  {m.live ? <LiveBadge label="LIVE NOW" /> : <Text style={styles.rowWhen}>{m.status}</Text>}
                </View>
                <ChevronRight size={18} color={c.iconFaint} strokeWidth={2.25} />
              </TouchableOpacity>
            ))}

            {sortedPosts.length ? <Text style={styles.postsLabel}>POSTS HERE</Text> : null}
            {sortedPosts.map((post) => {
              const channel = getChannel(post.channelId);
              return (
                <TouchableOpacity
                  key={post.id}
                  style={styles.postRow}
                  onPress={() => onPickPost?.(post.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Post in ${channel?.handle ?? 'a channel'} by ${post.author}: ${post.body}`}
                  testID={`cluster-post-${post.id}`}
                >
                  <View style={styles.postHeader}>
                    {channel ? <CategoryBadge tag={channel.tags[0]} title={channel.name} size={20} /> : null}
                    <Text style={styles.postChannel} numberOfLines={1}>
                      {channel?.handle ?? ''}
                    </Text>
                    <Text style={styles.postMeta} numberOfLines={1}>
                      {post.author} · {timeAgo(post.createdAt, now)}
                    </Text>
                  </View>
                  <Text style={styles.postBody} numberOfLines={3}>
                    {post.body}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export const BUBBLE_SIZE = 44;

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    column: { alignItems: 'center' },
    halo: {
      width: BUBBLE_SIZE + 12,
      height: BUBBLE_SIZE + 12,
      borderRadius: (BUBBLE_SIZE + 12) / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Selected: a solid ring around the bubble (same idea as a selected pin).
    haloSelected: { borderWidth: 2.5, transform: [{ scale: 1.12 }] },
    bubble: {
      width: BUBBLE_SIZE - 6,
      height: BUBBLE_SIZE - 6,
      borderRadius: (BUBBLE_SIZE - 6) / 2,
      borderWidth: 2.5,
      borderColor: '#ffffff',
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
    },
    count: { fontSize: 16, fontWeight: '900' },
    label: {
      marginTop: 2,
      height: 20,
      minWidth: 70,
      paddingHorizontal: 9,
      borderRadius: 10,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.glassStrong,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    labelBoosted: { borderColor: GOLD, borderWidth: 1.5 },
    labelLive: { borderColor: 'rgba(52, 211, 153, 0.55)' },
    // Cyan like the single pins' labels; live / boosted show in the border.
    labelText: { color: c.accent, fontSize: 10.5, fontWeight: '800' },
    // Quiet "#" so the eye goes to the word.
    labelHash: { fontSize: 8.5, fontWeight: '600', opacity: 0.55 },

    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 6, 23, 0.55)' },
    sheet: {
      maxHeight: '70%',
      backgroundColor: c.sheet,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1.5,
      borderColor: c.accent,
      paddingHorizontal: 16,
      paddingTop: 10,
    },
    handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: 'center', marginBottom: 10 },
    sheetTitle: { color: c.text, fontSize: 17, fontWeight: '800' },
    sheetSub: { color: c.textMuted, fontSize: 12, marginTop: 2, marginBottom: 10 },
    list: { flexGrow: 0 },
    listContent: { gap: 8, paddingBottom: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      padding: 10,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowBoosted: { borderColor: GOLD, borderWidth: 1.5 },
    rowSelected: { backgroundColor: c.surfaceSelected, borderColor: c.accent, borderWidth: 2 },
    selectedTag: { color: c.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
    rowCopy: { flex: 1, gap: 2, alignItems: 'flex-start' },
    tagLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowTag: { color: c.accentDeep, fontSize: 11, fontWeight: '800' },
    boostChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
      backgroundColor: 'rgba(245, 158, 11, 0.14)',
      borderWidth: 1,
      borderColor: 'rgba(245, 158, 11, 0.55)',
    },
    boostChipText: { color: GOLD, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
    rowTitle: { color: c.text, fontSize: 14, fontWeight: '800', alignSelf: 'stretch' },
    rowWhen: { color: c.accentSoft, fontSize: 12, fontWeight: '700' },
    postBadge: {
      position: 'absolute',
      top: 0,
      right: -4,
      minWidth: 22,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      backgroundColor: c.violet,
      borderWidth: 1.5,
      borderColor: '#ffffff',
      elevation: 5,
    },
    postBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '900' },
    postsLabel: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 8 },
    // Same look as a post card in Channels: channel, author and time, then the text.
    postRow: {
      gap: 8,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    postHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    postChannel: { color: c.accent, fontSize: 13, fontWeight: '800', flexShrink: 1 },
    postMeta: { color: c.textFaint, fontSize: 12, flexShrink: 1 },
    postBody: { color: c.text, fontSize: 14, lineHeight: 20 },
  });
