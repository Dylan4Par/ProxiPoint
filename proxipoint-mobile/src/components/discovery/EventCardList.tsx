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
import { tourTarget } from '../tour/tourTargets';
import { useDiscoveryStore, DiscoveryNode } from '../../stores/useDiscoveryStore';
import { PointCard } from './PointCard';
import { sortPoints, usePointSort } from '../../lib/pointSort';
import { useChannels } from '../../lib/channels';
import { matchesDiscoverFilters, useMapRange, useMyChannelsOnly } from '../../lib/discoverFilters';
import { useTimeWindow } from '../../lib/timeWindow';
import { useModeration } from '../../lib/moderation';
import { isBoosted, useBoosts } from '../../lib/boost';
import { useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

const EXPANDED_HEIGHT = 360;
/** Smallest default size: the header plus the top of the first card. */
const MIN_HALF_HEIGHT = 120;
/**
 * The sheet's top corner radius. The sheet overlaps the map by this much so the map shows
 * behind the rounded corners (instead of square patches of background).
 */
export const CARD_SHEET_RADIUS = 28;
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
  /** Height the list is settling to (it sits over the map's bottom), as soon as a slide starts. */
  onCoverChange?: (height: number) => void;
}> = ({ liveOnly = false, onOpenDetails, fullHeight = null, resetSignal = 0, onFullChange, onCoverChange }) => {
  const styles = useThemedStyles(createStyles);
  const getVisibleNodes = useDiscoveryStore((s) => s.getVisibleNodes);
  const allNodes = useDiscoveryStore((s) => s.nodes);
  const toggleRsvp = useDiscoveryStore((s) => s.toggleRsvp);
  const selectedNodeId = useDiscoveryStore((s) => s.selectedNodeId);
  // The city / metro being explored: the list (even the full one) stays inside it.
  const viewPlace = useDiscoveryStore((s) => s.viewPlace);
  const setSelectedNodeId = useDiscoveryStore((s) => s.setSelectedNodeId);

  const selectedTag = useDiscoveryStore((s) => s.selectedTag);
  const activeTab = useDiscoveryStore((s) => s.activeTab);
  useModeration(); // re-filter when you report or block someone
  const boostClock = useBoosts(); // re-render when a boost starts or runs out
  useTimeWindow(); // re-filter when the date window changes (3 days, or Calendar dates)
  const myChannelsOnly = useMyChannelsOnly(); // Filter & sort → Show only → My channels
  const rangeMeters = useMapRange(); // Filter & sort → Distance
  useChannels(); // re-filter when you join or leave a channel
  const sort = usePointSort(); // Filter & sort sheet: closest, soonest or most going
  const [mode, setMode] = useState<DrawerMode>('half');
  const isExpanded = mode !== 'collapsed';
  const isFull = mode === 'full';

  // Half: what's in view on the map (the store limits it). Full: every Point.
  // Both use the order picked in Filter & sort (closest by default); Boosted Points lead.
  const source: DiscoveryNode[] = isFull
    ? (Object.values(allNodes || {}) as DiscoveryNode[]).sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
    : getVisibleNodes();
  const visibleNodes = sortPoints(
    source.filter((node) => matchesDiscoverFilters(node, { selectedTag, liveOnly, activeTab, myChannelsOnly, area: viewPlace, rangeMeters })),
    sort,
  )
    .map((node, index) => ({ node, index, boosted: isBoosted(node.id, boostClock) }))
    .sort((a, b) => Number(b.boosted) - Number(a.boosted) || a.index - b.index)
    .map((entry) => entry.node);

  const animatedHeight = useRef(new Animated.Value(EXPANDED_HEIGHT)).current;
  // Default size: up to 360, but never more than half the map + cards area (a phone held sideways
  // has little height). The full list covers the whole area.
  const halfHeight =
    fullHeight != null ? Math.min(EXPANDED_HEIGHT, Math.max(MIN_HALF_HEIGHT, Math.round(fullHeight * 0.5))) : EXPANDED_HEIGHT;
  const heights = useRef({ half: halfHeight, full: fullHeight ?? EXPANDED_HEIGHT });
  heights.current.half = halfHeight;
  heights.current.full = Math.max(halfHeight, fullHeight ?? EXPANDED_HEIGHT);

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
    next === 'full' ? heights.current.full : next === 'half' ? heights.current.half : COLLAPSED_HEIGHT;

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

  // Keep the list the right height when the screen size changes (e.g. rotating the phone).
  useEffect(() => {
    animatedHeight.setValue(heightFor(modeRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  useEffect(() => {
    onCoverChange?.(heightFor(mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, halfHeight, fullHeight, onCoverChange]);

  // Android back: full list → back to the map.
  useEffect(() => {
    if (!isFull) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      animateDrawer('half');
      return true;
    });
    return () => sub.remove();
  }, [isFull]);

  // Picking a pin on the map scrolls its card to the middle of the list (opening the list if it's
  // collapsed). The map also slides to the pin, which can reorder the list, so keep following the
  // pick for a moment. A card tapped in the list stays where it is.
  const listRef = useRef<FlatList<DiscoveryNode>>(null);
  const pickedInList = useRef<string | null>(null);
  const pickedAt = useRef(0);
  const lastPick = useRef<string | null>(null);
  const visibleKey = visibleNodes.map((node) => node.id).join(',');
  useEffect(() => {
    if (!selectedNodeId) {
      lastPick.current = null;
      return;
    }
    if (selectedNodeId !== lastPick.current) {
      lastPick.current = selectedNodeId;
      pickedAt.current = Date.now();
      if (pickedInList.current === selectedNodeId) return;
      pickedInList.current = null; // picked on the map
    } else if (pickedInList.current === selectedNodeId || Date.now() - pickedAt.current > 1500) {
      return;
    }
    const index = visibleNodes.findIndex((node) => node.id === selectedNodeId);
    if (index < 0) return;
    const wasCollapsed = modeRef.current === 'collapsed';
    if (wasCollapsed) animateDrawer('half');
    const timer = setTimeout(
      () => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }),
      wasCollapsed ? 260 : 60,
    );
    return () => clearTimeout(timer);
  }, [selectedNodeId, visibleKey]);

  const renderCard = ({ item }: { item: DiscoveryNode }) => (
    <PointCard
      node={item}
      boosted={isBoosted(item.id, boostClock)}
      selected={item.id === selectedNodeId}
      onOpen={() => {
        pickedInList.current = item.id;
        setSelectedNodeId(item.id);
        // From the full list, drop back to the map so the Point can be shown on it.
        if (modeRef.current === 'full') animateDrawer('half');
        onOpenDetails?.(item.id);
      }}
      onToggleRsvp={() => toggleRsvp(item.id)}
    />
  );

  return (
    <Animated.View ref={tourTarget('map-cards')} style={[styles.drawerContainer, { height: animatedHeight }]}>
      <View {...panResponder.panHandlers} style={styles.headerDraggable}>
        {/* Tap the grab bar: minimize the list (tap again to bring the cards back). */}
        <TouchableOpacity
          style={styles.pullBarTap}
          onPress={() => animateDrawer(mode === 'collapsed' ? 'half' : 'collapsed')}
          hitSlop={{ top: 10, bottom: 6, left: 40, right: 40 }}
          accessibilityRole="button"
          accessibilityLabel={mode === 'collapsed' ? 'Show the cards' : 'Minimize the cards'}
          testID="cards-grab-bar"
        >
          <View style={styles.pullBar} />
        </TouchableOpacity>

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
                <Text style={styles.collapsedTag} numberOfLines={1}>
                  {viewPlace.name ? `ALL POINTS · ${viewPlace.name.toUpperCase()} AREA` : 'ALL POINTS NEARBY'}
                </Text>
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
          ref={listRef}
          // Cards not drawn yet: jump near it by the average card height, then center it.
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
            setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }), 80);
          }}
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
  // Over the map's bottom edge (the map fills the whole area and never resizes).
  drawerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    backgroundColor: c.sheet,
    borderTopLeftRadius: CARD_SHEET_RADIUS,
    borderTopRightRadius: CARD_SHEET_RADIUS,
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
  pullBarTap: { alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 4, marginBottom: 2 },
  pullBar: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.borderStrong,
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
