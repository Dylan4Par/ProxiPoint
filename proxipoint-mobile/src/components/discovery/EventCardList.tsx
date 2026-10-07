import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Animated,
  PanResponder,
} from 'react-native';
import { presentAssignedTag } from '../../lib/beaconDrop';
import { formatDuration, formatStartLabel } from '../../lib/beaconSchedule';
import type { AppearancePalette } from '../../lib/appearance';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useDiscoveryStore, DiscoveryNode } from '../../stores/useDiscoveryStore';

const EXPANDED_HEIGHT = 360;
const COLLAPSED_HEIGHT = 96;

export const EventCardList: React.FC = () => {
  const getVisibleNodes = useDiscoveryStore((s) => s.getVisibleNodes);
  const toggleRsvp = useDiscoveryStore((s) => s.toggleRsvp);
  const selectedNodeId = useDiscoveryStore((s) => s.selectedNodeId);
  const focusCard = useDiscoveryStore((s) => s.focusCard);
  const selectedTag = useDiscoveryStore((s) => s.selectedTag);
  useDiscoveryStore((s) => s.nodes);
  useDiscoveryStore((s) => s.activeTab);
  useDiscoveryStore((s) => s.viewportBounds);
  useDiscoveryStore((s) => s.selfCoordinates);
  const colors = useAppearanceStore((s) => s.colors);
  const styles = useMemo(() => createCardStyles(colors), [colors]);

  const visibleNodes = getVisibleNodes();
  const tagFor = (node: { tags?: string[]; tag?: string }) =>
    presentAssignedTag(node.tags, selectedTag, node.tag ?? '');

  const [isExpanded, setIsExpanded] = useState(true);
  const animatedHeight = useRef(new Animated.Value(EXPANDED_HEIGHT)).current;

  const selectedNode =
    visibleNodes.find((e) => e.id === selectedNodeId) ||
    visibleNodes[0] || {
      id: 'none',
      tag: '#Perimeter',
      tags: ['#Perimeter'],
      title: 'No viewable nodes in sector',
      distanceMeters: 0,
      attendeeCount: 0,
      status: 'SEARCHING',
      eta: '--',
      venue: 'Pan map to scan',
      isRsvpd: false,
      startsAt: undefined,
      durationMinutes: undefined,
      visibility: undefined,
    };

  const animateDrawer = (toExpanded: boolean) => {
    Animated.spring(animatedHeight, {
      toValue: toExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT,
      useNativeDriver: false,
      friction: 8,
      tension: 50,
    }).start();
    setIsExpanded(toExpanded);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 8;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 30) {
          animateDrawer(false);
        } else if (gestureState.dy < -30) {
          animateDrawer(true);
        }
      },
    })
  ).current;

  const renderCard = ({ item }: { item: DiscoveryNode }) => {
    const isSelected = item.id === selectedNodeId;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => focusCard(item.id)}
        style={[styles.card, isSelected && styles.cardSelected]}
      >
        <Text style={styles.tagText}>{tagFor(item)}</Text>
        <Text style={styles.titleText}>{item.title}</Text>
        {item.regionName ? (
          <Text style={styles.regionText} numberOfLines={2}>
            {item.regionChain || item.regionName}
          </Text>
        ) : null}
        <Text style={styles.hostText} numberOfLines={2}>{item.venue}</Text>
        {item.startsAt ? (
          <Text style={styles.scheduleText} numberOfLines={1}>
            {item.visibility === 'private' ? 'Private' : 'Public'}
            {' · '}
            {formatStartLabel(new Date(item.startsAt), new Date())}
            {' · '}
            {formatDuration(item.durationMinutes ?? 60)}
          </Text>
        ) : null}

        <View style={styles.statusRow}>
          <View style={styles.badgeRow}>
            <View style={styles.distanceBadge}>
              <View style={styles.greenDot} />
              <Text style={styles.distanceText}>{item.distanceMeters}m away</Text>
            </View>
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>{item.status}</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <View style={styles.avatarStack}>
              <View style={[styles.avatar, { backgroundColor: '#f97316' }]} />
              <View style={[styles.avatar, { backgroundColor: '#3b82f6', marginLeft: -8 }]} />
              <View style={[styles.avatarCount, { marginLeft: -8 }]}>
                <Text style={styles.avatarCountText}>{item.attendeeCount}+</Text>
              </View>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: item.isRsvpd }}
              style={[styles.rsvpBtn, item.isRsvpd && styles.rsvpBtnActive]}
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

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => animateDrawer(!isExpanded)}
          style={styles.collapsedHeaderRow}
        >
          <View style={styles.collapsedMeta}>
            <Text style={styles.collapsedTag}>{tagFor(selectedNode)}</Text>
            <Text numberOfLines={1} style={styles.collapsedTitle}>
              {selectedNode.title}
            </Text>
            {selectedNode.regionName ? (
              <Text numberOfLines={1} style={styles.collapsedRegion}>
                {selectedNode.regionName}
              </Text>
            ) : null}
            {selectedNode.startsAt ? (
              <Text numberOfLines={1} style={styles.collapsedSchedule}>
                {selectedNode.visibility === 'private' ? 'Private' : 'Public'}
                {' · '}
                {formatStartLabel(new Date(selectedNode.startsAt), new Date())}
                {' · '}
                {formatDuration(selectedNode.durationMinutes ?? 60)}
              </Text>
            ) : null}
          </View>
          <Text style={styles.chevronToggle}>{isExpanded ? '▾' : '▴'}</Text>
        </TouchableOpacity>
      </View>

      {isExpanded && (
        <FlatList
          testID="event-card-list"
          style={styles.list}
          data={visibleNodes}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>NO VIEWABLE EVENTS IN SECTOR</Text>
              <Text style={styles.emptySubtitle}>Drag the map to scan adjacent sectors</Text>
            </View>
          }
        />
      )}
    </Animated.View>
  );
};

function createCardStyles(c: AppearancePalette) {
  return StyleSheet.create({
  drawerContainer: {
    backgroundColor: c.drawer,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  headerDraggable: {
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 16,
    backgroundColor: c.drawer,
  },
  pullBar: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.pull,
    alignSelf: 'center',
    marginBottom: 6,
  },
  collapsedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  collapsedMeta: {
    flex: 1,
    marginRight: 10,
  },
  collapsedTag: {
    color: c.accent,
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
  collapsedRegion: {
    color: c.region,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  collapsedSchedule: {
    color: c.schedule,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  chevronToggle: {
    color: c.textMuted,
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardSelected: {
    borderColor: c.accent,
    backgroundColor: c.cardSelected,
  },
  tagText: {
    color: c.accent,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  titleText: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
  },
  regionText: {
    color: c.region,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  hostText: {
    color: c.textDim,
    fontSize: 11,
    marginTop: 2,
    marginBottom: 4,
  },
  scheduleText: {
    color: c.schedule,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
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
    backgroundColor: c.badge,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  distanceText: {
    color: c.badgeText,
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
    color: '#10b981',
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
    borderColor: c.card,
  },
  avatarCount: {
    width: 24,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.pull,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: c.card,
  },
  avatarCountText: {
    color: c.text,
    fontSize: 8,
    fontWeight: '700',
  },
  rsvpBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 62,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderRadius: 10,
    borderColor: c.textMuted,
  },
  rsvpBtnActive: {
    borderColor: c.accentBright,
  },
  rsvpIcon: {
    color: c.textMuted,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '700',
  },
  rsvpIconActive: {
    color: c.accent,
  },
  rsvpLabel: {
    color: c.textDim,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  rsvpLabelActive: {
    color: c.accent,
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
    color: c.textDim,
    fontSize: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
  },
  emptyTitle: {
    color: c.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  emptySubtitle: {
    color: c.textDim,
    fontSize: 11,
    marginTop: 4,
  },
});
}
