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
import { useDiscoveryStore, DiscoveryNode } from '../../stores/useDiscoveryStore';
import { chunkChronologicalFeed, formatFeedMeta, type FeedSection } from '../../lib/feedSections';
import { resolveTagAnchor } from '../../lib/tagIcons';
import { ChannelBadge } from './ChannelBadge';
import { PulsingDot } from './PulsingDot';
import { RadarEmptyState, RADAR_EMPTY_MESSAGE } from './RadarEmptyState';

const EXPANDED_HEIGHT = 420;
const COLLAPSED_HEIGHT = 72;

type FeedListSection = FeedSection<DiscoveryNode>;

export const EventCardList: React.FC = () => {
  const nodes = useDiscoveryStore((s) => s.nodes);
  const viewportBounds = useDiscoveryStore((s) => s.viewportBounds);
  const activeTab = useDiscoveryStore((s) => s.activeTab);
  const selectedTag = useDiscoveryStore((s) => s.selectedTag);
  const getVisibleNodes = useDiscoveryStore((s) => s.getVisibleNodes);
  const toggleRsvp = useDiscoveryStore((s) => s.toggleRsvp);
  const selectedNodeId = useDiscoveryStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useDiscoveryStore((s) => s.setSelectedNodeId);

  const visibleNodes = useMemo(
    () => getVisibleNodes(),
    [getVisibleNodes, nodes, viewportBounds, activeTab, selectedTag],
  );
  const sections = chunkChronologicalFeed(visibleNodes);

  const [isExpanded, setIsExpanded] = useState(true);
  const animatedHeight = useRef(new Animated.Value(EXPANDED_HEIGHT)).current;

  const selectedNode =
    visibleNodes.find((event) => event.id === selectedNodeId) ||
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

  const renderCard = ({ item, section }: { item: DiscoveryNode; section: FeedListSection }) => {
    const isSelected = item.id === selectedNodeId;
    const isLive = section.tone === 'live';
    const anchor = resolveTagAnchor(item.tag);
    const meta = formatFeedMeta(item);

    return (
      <View style={[styles.card, isSelected && styles.cardSelected]}>
        <TouchableOpacity
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={`${item.title}, ${meta}`}
          onPress={() => setSelectedNodeId(item.id)}
          style={styles.cardHit}
        >
          <ChannelBadge tag={item.tag} />
          <View style={styles.cardBody}>
            <Text style={[styles.channelLabel, { color: anchor.accent }]} numberOfLines={1}>
              {item.tag}
            </Text>
            <Text style={styles.titleText} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.subline} numberOfLines={1}>
              {item.venue} · {item.attendeeCount} going
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.trailing}>
          {isLive ? <PulsingDot size={7} /> : <View style={styles.dotSpacer} />}
          <Text style={[styles.metaText, isLive && styles.metaLive]}>{meta}</Text>
          <TouchableOpacity
            style={[styles.rsvpBtn, item.isRsvpd && styles.rsvpBtnActive]}
            accessibilityRole="button"
            accessibilityLabel={item.isRsvpd ? `Cancel RSVP for ${item.title}` : `RSVP to ${item.title}`}
            onPress={() => toggleRsvp(item.id)}
          >
            <Text style={[styles.rsvpLabel, item.isRsvpd && styles.rsvpLabelActive]}>
              {item.isRsvpd ? "RSVP'd" : 'RSVP'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 3,
  },
  cardSelected: {
    borderColor: '#22d3ee',
    backgroundColor: '#0b1629',
  },
  cardHit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  channelLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  titleText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  subline: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 3,
  },
  trailing: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 72,
    gap: 2,
  },
  dotSpacer: {
    height: 18,
  },
  metaText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  metaLive: {
    color: '#6ee7b7',
  },
  rsvpBtn: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#020617',
  },
  rsvpBtnActive: {
    borderColor: 'rgba(34, 211, 238, 0.55)',
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
  },
  rsvpLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  rsvpLabelActive: {
    color: '#22d3ee',
  },
});
