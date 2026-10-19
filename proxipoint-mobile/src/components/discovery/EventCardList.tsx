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
import { PointCard } from './PointCard';
import { matchesDiscoverFilters } from '../../lib/discoverFilters';
import { useTimeWindow } from '../../lib/timeWindow';
import { useModeration } from '../../lib/moderation';
import { isBoosted, useBoosts } from '../../lib/boost';
import { useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

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

  const renderCard = ({ item }: { item: DiscoveryNode }) => (
    <PointCard
      node={item}
      boosted={isBoosted(item.id, boostClock)}
      selected={item.id === selectedNodeId}
      onOpen={() => {
        setSelectedNodeId(item.id);
        // From the full list, drop back to the map so the Point can be shown on it.
        if (modeRef.current === 'full') animateDrawer('half');
        onOpenDetails?.(item.id);
      }}
      onToggleRsvp={() => toggleRsvp(item.id)}
    />
  );

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
    paddingHorizontal: 14,
    paddingBottom: 24,
    gap: 12,
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
