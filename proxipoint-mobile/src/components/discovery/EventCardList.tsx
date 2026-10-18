import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Animated,
  BackHandler,
  PanResponder,
} from 'react-native';
import { useDiscoveryStore, DiscoveryNode } from '../../stores/useDiscoveryStore';
import { LiveBadge } from '../drops/LiveBadge';
import { CategoryBadge } from './CategoryBadge';
import { isLiveStatus } from '../../lib/liveStatus';
import { matchesDiscoverFilters } from '../../lib/discoverFilters';
import { useTimeWindow } from '../../lib/timeWindow';
import { useModeration } from '../../lib/moderation';
import { isBoosted, useBoosts } from '../../lib/boost';
import { BoostedChip } from '../drops/BoostCard';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/** Cover photo, if the node carries one under any of the usual names. */
function photoOf(node: DiscoveryNode): string | null {
  const n = node as unknown as Record<string, unknown>;
  for (const key of ['coverPhotoUri', 'coverPhoto', 'photoUri', 'imageUrl', 'image']) {
    const value = n[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

const EXPANDED_HEIGHT = 360;
const COLLAPSED_HEIGHT = 64;

/**
 * collapsed: just the header bar. half: cards under the map (default).
 * full: the list fills the whole area under the filter chips and shows every Point, not just
 * the ones in view on the map.
 */
type DrawerMode = 'collapsed' | 'half' | 'full';

export const EventCardList: React.FC<{
  liveOnly?: boolean;
  /** Tapping a card selects it and opens its public detail sheet. */
  onOpenDetails?: (id: string) => void;
  /** Height of the map + list area, so the list can grow to cover all of it. */
  fullHeight?: number | null;
  /** Change this number to send the list back to its default size (e.g. the Discover tab was tapped). */
  resetSignal?: number;
  /** Tells the screen when the list covers the whole map (so it can hide things on the map). */
  onFullChange?: (full: boolean) => void;
}> = ({ liveOnly = false, onOpenDetails, fullHeight = null, resetSignal = 0, onFullChange }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const getVisibleNodes = useDiscoveryStore((s) => s.getVisibleNodes);
  const allNodes = useDiscoveryStore((s) => s.nodes);
  const toggleRsvp = useDiscoveryStore((s) => s.toggleRsvp);
  const selectedNodeId = useDiscoveryStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useDiscoveryStore((s) => s.setSelectedNodeId);

  const selectedTag = useDiscoveryStore((s) => s.selectedTag);
  const activeTab = useDiscoveryStore((s) => s.activeTab);
  useModeration(); // re-filter when you report or block someone
  const boostClock = useBoosts(); // re-render when a boost starts or runs out
  useTimeWindow(); // re-filter when the date window changes (3 days, or Calendar dates)
  const [mode, setMode] = useState<DrawerMode>('half');
  const isExpanded = mode !== 'collapsed';
  const isFull = mode === 'full';

  // Half: what's in view on the map (the store limits it), in the store's order.
  // Full: every Point, closest first. Boosted Points lead in both.
  const source: DiscoveryNode[] = isFull
    ? (Object.values(allNodes || {}) as DiscoveryNode[]).sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
    : getVisibleNodes();
  const visibleNodes = source
    .filter((node) => matchesDiscoverFilters(node, { selectedTag, liveOnly, activeTab }))
    .map((node, index) => ({ node, index, boosted: isBoosted(node.id, boostClock) }))
    .sort((a, b) => Number(b.boosted) - Number(a.boosted) || a.index - b.index)
    .map((entry) => entry.node);

  const animatedHeight = useRef(new Animated.Value(EXPANDED_HEIGHT)).current;
  const heights = useRef({ full: fullHeight ?? EXPANDED_HEIGHT });
  heights.current.full = Math.max(EXPANDED_HEIGHT, fullHeight ?? EXPANDED_HEIGHT);

  const selectedNode =
    visibleNodes.find((e) => e.id === selectedNodeId) ||
    visibleNodes[0] || {
      id: 'none',
      tag: '#Perimeter',
      title: 'No viewable nodes in sector',
      distanceMeters: 0,
      attendeeCount: 0,
      status: 'SEARCHING',
      eta: '--',
      venue: 'Pan map to scan',
      isRsvpd: false,
    };

  const modeRef = useRef<DrawerMode>('half');
  const heightFor = (next: DrawerMode) =>
    next === 'full' ? heights.current.full : next === 'half' ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;

  const animateDrawer = (next: DrawerMode) => {
    modeRef.current = next;
    setMode(next);
    Animated.spring(animatedHeight, {
      toValue: heightFor(next),
      useNativeDriver: false,
      friction: 9,
      tension: 50,
    }).start();
  };

  // Swipe up: collapsed → half → full. Swipe down: full → half → collapsed.
  const step = (direction: 1 | -1) => {
    const order: DrawerMode[] = ['collapsed', 'half', 'full'];
    const i = order.indexOf(modeRef.current);
    const next = order[Math.max(0, Math.min(order.length - 1, i + direction))];
    if (next !== modeRef.current) animateDrawer(next);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 8,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 30) step(-1);
        else if (gestureState.dy < -30) step(1);
      },
    }),
  ).current;

  // Keep the full list the right height if the screen size changes (e.g. rotation).
  useEffect(() => {
    if (modeRef.current === 'full') animatedHeight.setValue(heights.current.full);
  }, [fullHeight, animatedHeight]);

  // Discover tab tapped again: back to the default size (cards under the map).
  const lastReset = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === lastReset.current) return;
    lastReset.current = resetSignal;
    if (modeRef.current !== 'half') animateDrawer('half');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    onFullChange?.(isFull);
  }, [isFull, onFullChange]);

  // Android back: full list → back to the map.
  useEffect(() => {
    if (!isFull) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      animateDrawer('half');
      return true;
    });
    return () => sub.remove();
  }, [isFull]);

  const renderCard = ({ item }: { item: DiscoveryNode }) => {
    const isSelected = item.id === selectedNodeId;
    const boosted = isBoosted(item.id, boostClock);

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          setSelectedNodeId(item.id);
          // From the full list, drop back to the map so the Point can be shown on it.
          if (modeRef.current === 'full') animateDrawer('half');
          onOpenDetails?.(item.id);
        }}
        style={[styles.card, boosted && styles.cardBoosted, isSelected && styles.cardSelected, isSelected && boosted && styles.cardBoosted]}
        accessibilityRole="button"
        accessibilityHint="Opens the details"
      >
        <View style={styles.cardTop}>
          <CategoryBadge tag={item.tag} title={item.title} photoUri={photoOf(item)} />
          <View style={styles.cardMeta}>
            <View style={styles.tagLine}>
              <Text style={styles.tagText}>{item.tag}</Text>
              {boosted ? <BoostedChip /> : null}
            </View>
            <Text style={styles.titleText}>{item.title}</Text>
            <Text style={styles.hostText}>{item.venue}</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.badgeRow}>
            <View style={styles.distanceBadge}>
              <View style={styles.greenDot} />
              <Text style={styles.distanceText}>{item.distanceMeters}m away</Text>
            </View>
            {isLiveStatus(item.status) ? (
              // Same pulsing badge as My Drops (holds still with Reduce Motion on).
              <LiveBadge label="LIVE NOW" />
            ) : (
              <View style={styles.liveBadge}>
                <Text style={styles.liveText}>{item.status}</Text>
              </View>
            )}
          </View>

          <View style={styles.actionRow}>
            <View style={styles.avatarStack}>
              <View style={[styles.avatar, { backgroundColor: c.orange }]} />
              <View style={[styles.avatar, { backgroundColor: c.blue, marginLeft: -8 }]} />
              <View style={[styles.avatarCount, { marginLeft: -8 }]}>
                <Text style={styles.avatarCountText}>{item.attendeeCount}+</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.rsvpBtn}
              onPress={() => toggleRsvp(item.id)}
            >
              <Text style={[styles.rsvpIcon, item.isRsvpd && styles.rsvpIconActive]}>✓</Text>
              <Text style={[styles.rsvpLabel, item.isRsvpd && styles.rsvpLabelActive]}>
                RSVP
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.etaText}>🚶 {item.eta}</Text>
          <Text style={styles.activeReadout}>{item.attendeeCount} active</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Animated.View style={[styles.drawerContainer, { height: animatedHeight }]}>
      <View {...panResponder.panHandlers} style={styles.headerDraggable}>
        <View style={styles.pullBar} />

        <View style={styles.collapsedHeaderRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            // Tap the header: collapsed → cards, cards → full list, full list → back to the map.
            onPress={() => animateDrawer(mode === 'half' ? 'full' : 'half')}
            style={styles.collapsedMeta}
            accessibilityRole="button"
            accessibilityLabel={isFull ? 'Show the map' : 'Show the full list'}
            testID="cards-header"
          >
            {isFull ? (
              <>
                <Text style={styles.collapsedTag}>ALL POINTS</Text>
                <Text numberOfLines={1} style={styles.collapsedTitle}>
                  {visibleNodes.length} {visibleNodes.length === 1 ? 'Point' : 'Points'}
                  {selectedTag && selectedTag !== 'All' ? ` · ${selectedTag}` : ''}
                  {liveOnly ? ' · Live now' : ''}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.collapsedTag}>{selectedNode.tag}</Text>
                <Text numberOfLines={1} style={styles.collapsedTitle}>
                  {selectedNode.title}
                </Text>
              </>
            )}
          </TouchableOpacity>
          {/* Up: one step taller (to the full list). Down: one step shorter. */}
          {mode !== 'full' ? (
            <TouchableOpacity
              onPress={() => step(1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={mode === 'collapsed' ? 'Show cards' : 'Expand to full list'}
              testID="cards-expand"
            >
              <Text style={styles.chevronToggle}>▴</Text>
            </TouchableOpacity>
          ) : null}
          {mode !== 'collapsed' ? (
            <TouchableOpacity
              onPress={() => step(-1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={mode === 'full' ? 'Show the map' : 'Collapse cards'}
              testID="cards-collapse"
            >
              <Text style={styles.chevronToggle}>▾</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {isExpanded && (
        <FlatList
          style={styles.list}
          data={visibleNodes}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>
                {isFull
                  ? 'NO POINTS MATCH THESE FILTERS'
                  : liveOnly
                    ? 'NOTHING LIVE IN SECTOR'
                    : 'NO VIEWABLE EVENTS IN SECTOR'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {isFull
                  ? 'Try another #tag, or turn off Live Now'
                  : liveOnly
                    ? 'Drag the map, or turn off Live Now to see upcoming Points'
                    : 'Drag the map to scan adjacent sectors'}
              </Text>
            </View>
          }
        />
      )}
    </Animated.View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  drawerContainer: {
    backgroundColor: c.sheet,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  headerDraggable: {
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 16,
    backgroundColor: c.sheet,
  },
  pullBar: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.borderStrong,
    alignSelf: 'center',
    marginBottom: 6,
  },
  collapsedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
    gap: 10,
  },
  collapsedMeta: {
    flex: 1,
    marginRight: 10,
  },
  collapsedTag: {
    color: c.accentDeep,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  collapsedTitle: {
    color: c.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  chevronToggle: {
    color: c.textMuted,
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardSelected: {
    borderColor: c.accentDeep,
    backgroundColor: c.surfaceSelected,
  },
  // Boosted: gold border (kept when selected too).
  cardBoosted: {
    borderColor: '#f59e0b',
    borderWidth: 1.5,
  },
  tagLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
  },
  tagText: {
    color: c.accentDeep,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  titleText: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
  },
  hostText: {
    color: c.textFaint,
    fontSize: 11,
    marginTop: 2,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.chipBlue,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.greenDeep,
  },
  distanceText: {
    color: c.sky,
    fontSize: 10,
    fontWeight: '700',
  },
  liveBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
  },
  liveText: {
    color: c.greenDeep,
    fontSize: 9,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: c.surface,
  },
  avatarCount: {
    width: 24,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: c.surface,
  },
  avatarCountText: {
    color: c.text,
    fontSize: 8,
    fontWeight: '700',
  },
  rsvpBtn: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  rsvpIcon: {
    color: c.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  rsvpIconActive: {
    color: c.accentDeep,
  },
  rsvpLabel: {
    color: c.textFaint,
    fontSize: 9,
    fontWeight: '700',
  },
  rsvpLabelActive: {
    color: c.accentDeep,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 6,
  },
  etaText: {
    color: c.textMuted,
    fontSize: 10,
  },
  activeReadout: {
    color: c.textFaint,
    fontSize: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
  },
  emptyTitle: {
    color: c.textFaint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  emptySubtitle: {
    color: c.iconFaint,
    fontSize: 11,
    marginTop: 4,
  },
});
