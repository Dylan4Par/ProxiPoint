import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Animated,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import {
  DRAWER_COLLAPSED,
  heightForSnap,
  resolveDrawerSnap,
  type DrawerSnap,
} from '../../lib/drawerSnap';
import { DiscoveryNode, filterVisibleNodes, useDiscoveryStore } from '../../stores/useDiscoveryStore';

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function isLiveNode(node: DiscoveryNode): boolean {
  return node.status.toUpperCase().includes('LIVE') || node.distanceMeters <= 350;
}

const ProximityPulse: React.FC<{ active: boolean; color: string; duration: number }> = ({
  active,
  color,
  duration,
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      opacity.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 2.4, duration, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.55, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, duration, opacity, scale]);

  return (
    <View style={styles.pulseSlot}>
      {active ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            { backgroundColor: color, opacity, transform: [{ scale }] },
          ]}
        />
      ) : null}
      <View style={[styles.pulseCore, { backgroundColor: color }]} />
    </View>
  );
};

export const EventCardList: React.FC = () => {
  const { height: windowHeight } = useWindowDimensions();
  const nodes = useDiscoveryStore((state) => state.nodes);
  const viewportBounds = useDiscoveryStore((state) => state.viewportBounds);
  const activeTab = useDiscoveryStore((state) => state.activeTab);
  const selectedTag = useDiscoveryStore((state) => state.selectedTag);
  const toggleRsvp = useDiscoveryStore((state) => state.toggleRsvp);
  const selectedNodeId = useDiscoveryStore((state) => state.selectedNodeId);
  const selectNodeFromCard = useDiscoveryStore((state) => state.selectNodeFromCard);
  const drawerSnap = useDiscoveryStore((state) => state.drawerSnap);
  const setDrawerSnap = useDiscoveryStore((state) => state.setDrawerSnap);
  const setDrawerHeight = useDiscoveryStore((state) => state.setDrawerHeight);
  const setDrawerDragging = useDiscoveryStore((state) => state.setDrawerDragging);

  const visibleNodes = useMemo(
    () => filterVisibleNodes(Object.values(nodes), viewportBounds, activeTab, selectedTag),
    [nodes, viewportBounds, activeTab, selectedTag],
  );

  const orderedNodes = useMemo(() => {
    if (!selectedNodeId) return visibleNodes;
    const selected = visibleNodes.filter((node) => node.id === selectedNodeId);
    const rest = visibleNodes.filter((node) => node.id !== selectedNodeId);
    return [...selected, ...rest];
  }, [visibleNodes, selectedNodeId]);

  const fallbackNode: DiscoveryNode = {
    id: 'none',
    tag: '#Perimeter',
    title: 'No viewable nodes in sector',
    venue: 'Pan map to scan',
    latitude: 0,
    longitude: 0,
    distanceMeters: 0,
    status: 'SEARCHING',
    statusColor: '#64748b',
    eta: '--',
    etaMode: 'walk',
    attendeeCount: 0,
    isRsvpd: false,
    radii: [],
    x: 0,
    y: 0,
  };

  const selectedNode =
    orderedNodes.find((node) => node.id === selectedNodeId) || orderedNodes[0] || fallbackNode;

  const animatedHeight = useRef(new Animated.Value(heightForSnap(drawerSnap, windowHeight))).current;
  const dragStart = useRef(heightForSnap(drawerSnap, windowHeight));
  const heightRef = useRef(heightForSnap(drawerSnap, windowHeight));
  const windowHeightRef = useRef(windowHeight);
  windowHeightRef.current = windowHeight;

  useEffect(() => {
    const id = animatedHeight.addListener(({ value }) => {
      heightRef.current = value;
      setDrawerHeight(value);
    });
    return () => animatedHeight.removeListener(id);
  }, [animatedHeight, setDrawerHeight]);

  const grantDy = useRef(0);

  const springTo = (height: number) => {
    animatedHeight.stopAnimation();
    Animated.spring(animatedHeight, {
      toValue: height,
      useNativeDriver: false,
      friction: 9,
      tension: 48,
    }).start();
  };

  useEffect(() => {
    springTo(heightForSnap(drawerSnap, windowHeight));
  }, [drawerSnap, windowHeight]);

  const cycleSnap = () => {
    const current = useDiscoveryStore.getState().drawerSnap;
    const next: DrawerSnap =
      current === 'collapsed' ? 'peek' : current === 'peek' ? 'expanded' : 'collapsed';
    setDrawerSnap(next);
  };

  const dragApi = useRef({
    begin: (_dy: number) => {},
    move: (_dy: number) => {},
    end: (_dy: number, _vy: number, _tap: boolean) => {},
  });

  dragApi.current.begin = (dy: number) => {
    grantDy.current = dy;
    animatedHeight.stopAnimation();
    dragStart.current = heightRef.current;
    setDrawerDragging(true);
  };
  dragApi.current.move = (dy: number) => {
    const expanded = heightForSnap('expanded', windowHeightRef.current);
    const next = Math.min(
      expanded,
      Math.max(DRAWER_COLLAPSED, dragStart.current - (dy - grantDy.current)),
    );
    animatedHeight.setValue(next);
  };
  dragApi.current.end = (dy: number, vy: number, tap: boolean) => {
    setDrawerDragging(false);
    const delta = dy - grantDy.current;
    if (tap && Math.abs(delta) < 8) {
      cycleSnap();
      return;
    }
    const height = windowHeightRef.current;
    const expanded = heightForSnap('expanded', height);
    const current = Math.min(expanded, Math.max(DRAWER_COLLAPSED, dragStart.current - delta));
    const next = resolveDrawerSnap(current, vy, height);
    setDrawerSnap(next);
    springTo(heightForSnap(next, height));
  };

  const headerPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, gesture) => dragApi.current.begin(gesture.dy),
      onPanResponderMove: (_, gesture) => dragApi.current.move(gesture.dy),
      onPanResponderRelease: (_, gesture) => dragApi.current.end(gesture.dy, gesture.vy, true),
      onPanResponderTerminate: (_, gesture) => dragApi.current.end(gesture.dy, 0, false),
    }),
  ).current;

  const listPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        if (useDiscoveryStore.getState().drawerSnap === 'expanded') return false;
        return Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, gesture) => dragApi.current.begin(gesture.dy),
      onPanResponderMove: (_, gesture) => dragApi.current.move(gesture.dy),
      onPanResponderRelease: (_, gesture) => dragApi.current.end(gesture.dy, gesture.vy, false),
      onPanResponderTerminate: (_, gesture) => dragApi.current.end(gesture.dy, 0, false),
    }),
  ).current;

  const renderCard = (item: DiscoveryNode) => {
    const isSelected = item.id === selectedNodeId;
    const live = isLiveNode(item);
    const pulseDuration = Math.max(560, Math.min(1400, item.distanceMeters * 2));

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => selectNodeFromCard(item.id)}
        style={[styles.card, isSelected && styles.cardSelected]}
      >
        {isSelected ? <View style={styles.cardRail} /> : null}
        <Text style={styles.tagText}>{item.tag}</Text>
        <Text numberOfLines={1} style={styles.titleText}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.hostText}>
          {item.venue}
        </Text>

        <View style={styles.statusRow}>
          <View style={styles.badgeRow}>
            <View style={styles.distanceBadge}>
              <ProximityPulse active={live} color={item.statusColor} duration={pulseDuration} />
              <Text style={styles.distanceText}>{formatDistance(item.distanceMeters)}</Text>
            </View>
            <View style={[styles.liveBadge, { backgroundColor: `${item.statusColor}26` }]}>
              <Text style={[styles.liveText, { color: item.statusColor }]}>{item.status}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.rsvpBtn} onPress={() => toggleRsvp(item.id)}>
            <Text style={[styles.rsvpIcon, item.isRsvpd && styles.rsvpIconActive]}>✓</Text>
            <Text style={[styles.rsvpLabel, item.isRsvpd && styles.rsvpLabelActive]}>
              {item.isRsvpd ? 'Going' : 'RSVP'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.etaText}>{item.etaMode === 'drive' ? 'DRIVE' : 'WALK'} · {item.eta}</Text>
          <View style={styles.footerRight}>
            <View style={styles.avatarStack}>
              <View style={[styles.avatar, { backgroundColor: '#f97316' }]} />
              <View style={[styles.avatar, { backgroundColor: '#3b82f6', marginLeft: -8 }]} />
            </View>
            <Text style={styles.activeReadout}>{item.attendeeCount} active</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const liveSelected = isLiveNode(selectedNode);

  return (
    <Animated.View style={[styles.drawerContainer, { height: animatedHeight }]}>
      <View {...headerPan.panHandlers} style={styles.headerDraggable}>
        <View style={styles.pullBar} />
        <View style={styles.collapsedHeaderRow}>
          <ProximityPulse
            active={liveSelected && selectedNode.id !== 'none'}
            color={selectedNode.statusColor}
            duration={900}
          />
          <View style={styles.collapsedMeta}>
            <Text style={styles.collapsedTag}>{selectedNode.tag}</Text>
            <Text numberOfLines={1} style={styles.collapsedTitle}>
              {selectedNode.title}
            </Text>
          </View>
          <Text style={styles.collapsedDistance}>
            {selectedNode.id === 'none' ? '--' : formatDistance(selectedNode.distanceMeters)}
          </Text>
          <Text style={styles.chevronToggle}>{drawerSnap === 'expanded' ? '▾' : '▴'}</Text>
        </View>
      </View>

      <View
        pointerEvents={drawerSnap === 'collapsed' ? 'none' : 'auto'}
        style={styles.listWrap}
        {...listPan.panHandlers}
      >
        <FlatList
          data={orderedNodes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderCard(item)}
          extraData={selectedNodeId}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={drawerSnap === 'expanded'}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>NO VIEWABLE EVENTS IN SECTOR</Text>
              <Text style={styles.emptySubtitle}>Drag the map to scan adjacent sectors</Text>
            </View>
          }
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  drawerContainer: {
    backgroundColor: '#090f1d',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
    userSelect: 'none',
  },
  headerDraggable: {
    height: DRAWER_COLLAPSED,
    paddingTop: 8,
    paddingHorizontal: 16,
    backgroundColor: '#090f1d',
    cursor: 'pointer',
  },
  pullBar: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginBottom: 8,
  },
  collapsedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  collapsedMeta: {
    flex: 1,
  },
  collapsedTag: {
    color: '#22d3ee',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  collapsedTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 1,
  },
  collapsedDistance: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '700',
  },
  chevronToggle: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '700',
  },
  listWrap: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 10,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: '#22d3ee',
    backgroundColor: '#0b1b2e',
    shadowColor: '#22d3ee',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  cardRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#22d3ee',
  },
  tagText: {
    color: '#67e8f9',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  titleText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  hostText: {
    color: '#94a3b8',
    fontSize: 12,
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
    flex: 1,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#172554',
    paddingLeft: 6,
    paddingRight: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 6,
  },
  pulseSlot: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pulseCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  distanceText: {
    color: '#e0f2fe',
    fontSize: 11,
    fontWeight: '700',
  },
  liveBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  rsvpBtn: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rsvpIcon: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
  },
  rsvpIconActive: {
    color: '#22d3ee',
  },
  rsvpLabel: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  rsvpLabelActive: {
    color: '#22d3ee',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 6,
  },
  etaText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#0f172a',
  },
  activeReadout: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
  },
  emptyTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  emptySubtitle: {
    color: '#475569',
    fontSize: 11,
    marginTop: 4,
  },
});
