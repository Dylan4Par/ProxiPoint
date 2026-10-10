import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SectionList,
  StyleSheet,
  Animated,
  PanResponder,
} from 'react-native';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { groupProxiEvents, type FeedSection } from '../../lib/feedSections';
import { type ProxiEvent } from '../../lib/trust';
import { resolveTagAnchor } from '../../lib/tagIcons';
import { ChannelBadge } from './ChannelBadge';
import { EventCard } from './EventCard';
import { PulsingDot } from './PulsingDot';
import { RadarEmptyState, RADAR_EMPTY_MESSAGE } from './RadarEmptyState';

const EXPANDED_HEIGHT = 420;
const COLLAPSED_HEIGHT = 72;

type FeedListSection = FeedSection<ProxiEvent>;

interface Props {
  events?: ProxiEvent[];
  onSelect?: (id: string) => void;
  onSelectEvent?: (event: ProxiEvent) => void;
  onToggleRsvp?: (id: string) => void;
}

export const EventCardList: React.FC<Props> = ({ events, onSelect, onSelectEvent, onToggleRsvp }) => {
  const nodes = useDiscoveryStore((s) => s.nodes);
  const viewportBounds = useDiscoveryStore((s) => s.viewportBounds);
  const activeTab = useDiscoveryStore((s) => s.activeTab);
  const selectedTag = useDiscoveryStore((s) => s.selectedTag);
  const getVisibleNodes = useDiscoveryStore((s) => s.getVisibleNodes);
  const toggleRsvp = useDiscoveryStore((s) => s.toggleRsvp);
  const selectedNodeId = useDiscoveryStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useDiscoveryStore((s) => s.setSelectedNodeId);

  const visibleNodes = useMemo(
    () => events ?? getVisibleNodes(),
    [events, getVisibleNodes, nodes, viewportBounds, activeTab, selectedTag],
  );
  const sections = groupProxiEvents(visibleNodes);

  const [isExpanded, setIsExpanded] = useState(true);
  const animatedHeight = useRef(new Animated.Value(EXPANDED_HEIGHT)).current;

  const selectedNode =
    (events
      ? visibleNodes.find((event) => event.selected)
      : visibleNodes.find((event) => event.id === selectedNodeId)) ||
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
      startsAt: null,
      hostId: '',
      hostCallsign: 'Unassigned',
      hostUpvotes: 0,
      hostDrops: 0,
      isVerifiedCoordinator: false,
    };

  const selectedAnchor = resolveTagAnchor(selectedNode.tag);
  const selectedLive = /live\s*now/i.test(selectedNode.status);

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
    }),
  ).current;

  const renderCard = ({ item, section }: { item: ProxiEvent; section: FeedListSection }) => {
    const isLive = section.tone === 'live';
    const isSelected = events ? Boolean(item.selected) : item.id === selectedNodeId;
    return (
      <EventCard
        event={item}
        live={isLive}
        selected={isSelected}
        onPress={() => {
          if (onSelectEvent) onSelectEvent(item);
          else if (onSelect) onSelect(item.id);
          else if (!events) setSelectedNodeId(item.id);
        }}
        onToggleRsvp={() => {
          if (onToggleRsvp) onToggleRsvp(item.id);
          else toggleRsvp(item.id);
        }}
      />
    );
  };

  const renderSectionHeader = ({ section }: { section: FeedListSection }) => {
    const isLive = section.tone === 'live';
    return (
      <View style={styles.sectionHeader} accessibilityRole="header">
        <View style={styles.sectionLabelRow}>
          {isLive ? <PulsingDot color="#10b981" size={7} /> : <View style={styles.dateTick} />}
          <Text style={[styles.sectionTitle, isLive && styles.sectionTitleLive]}>{section.title}</Text>
        </View>
        <View style={styles.sectionDivider} />
      </View>
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
          <ChannelBadge tag={selectedNode.tag} size={36} />
          <View style={styles.collapsedMeta}>
            <Text style={[styles.collapsedTag, { color: selectedAnchor.accent }]}>{selectedNode.tag}</Text>
            <Text numberOfLines={1} style={styles.collapsedTitle}>
              {selectedNode.title}
            </Text>
          </View>
          {selectedLive ? <PulsingDot size={7} /> : null}
          <Text style={styles.chevronToggle}>{isExpanded ? '▾' : '▴'}</Text>
        </TouchableOpacity>
      </View>

      {isExpanded && (
        <SectionList
          style={styles.list}
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.listContent, visibleNodes.length === 0 && styles.listEmpty]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <RadarEmptyState
              kicker={activeTab === 'RSVPd' ? "RSVP'D" : 'DISCOVER'}
              message={RADAR_EMPTY_MESSAGE}
            />
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
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: '#090f1d',
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
    minWidth: 0,
  },
  collapsedTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
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
    paddingHorizontal: 2,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  sectionHeader: {
    marginTop: 6,
    marginBottom: 8,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  sectionTitleLive: {
    color: '#6ee7b7',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#1e293b',
  },
  dateTick: {
    width: 7,
    height: 7,
    borderRadius: 2,
    marginHorizontal: 5,
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: '#64748b',
  },
});
