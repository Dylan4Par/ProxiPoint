import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Animated,
  PanResponder,
} from 'react-native';
import { useDiscoveryStore, DiscoveryNode } from '../../stores/useDiscoveryStore';

const EXPANDED_HEIGHT = 360;
const COLLAPSED_HEIGHT = 64;

export const EventCardList: React.FC = () => {
  const getVisibleNodes = useDiscoveryStore((s) => s.getVisibleNodes);
  const toggleRsvp = useDiscoveryStore((s) => s.toggleRsvp);
  const selectedNodeId = useDiscoveryStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useDiscoveryStore((s) => s.setSelectedNodeId);

  const visibleNodes = getVisibleNodes();

  const [isExpanded, setIsExpanded] = useState(true);
  const animatedHeight = useRef(new Animated.Value(EXPANDED_HEIGHT)).current;

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
        onPress={() => setSelectedNodeId(item.id)}
        style={[styles.card, isSelected && styles.cardSelected]}
      >
        <Text style={styles.tagText}>{item.tag}</Text>
        <Text style={styles.titleText}>{item.title}</Text>
        <Text style={styles.hostText}>{item.venue}</Text>

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

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => animateDrawer(!isExpanded)}
          style={styles.collapsedHeaderRow}
        >
          <View style={styles.collapsedMeta}>
            <Text style={styles.collapsedTag}>{selectedNode.tag}</Text>
            <Text numberOfLines={1} style={styles.collapsedTitle}>
              {selectedNode.title}
            </Text>
          </View>
          <Text style={styles.chevronToggle}>{isExpanded ? '▾' : '▴'}</Text>
        </TouchableOpacity>
      </View>

      {isExpanded && (
        <FlatList
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

const styles = StyleSheet.create({
  drawerContainer: {
    backgroundColor: '#090f1d',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  headerDraggable: {
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 16,
    backgroundColor: '#090f1d',
  },
  pullBar: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
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
    color: '#06b6d4',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  collapsedTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  chevronToggle: {
    color: '#94a3b8',
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
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  cardSelected: {
    borderColor: '#06b6d4',
    backgroundColor: '#0b1629',
  },
  tagText: {
    color: '#06b6d4',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  titleText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  hostText: {
    color: '#64748b',
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
    backgroundColor: '#172554',
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
    color: '#38bdf8',
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
    borderColor: '#0f172a',
  },
  avatarCount: {
    width: 24,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0f172a',
  },
  avatarCountText: {
    color: '#f8fafc',
    fontSize: 8,
    fontWeight: '700',
  },
  rsvpBtn: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  rsvpIcon: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
  },
  rsvpIconActive: {
    color: '#06b6d4',
  },
  rsvpLabel: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
  },
  rsvpLabelActive: {
    color: '#06b6d4',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 6,
  },
  etaText: {
    color: '#94a3b8',
    fontSize: 10,
  },
  activeReadout: {
    color: '#64748b',
    fontSize: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
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
