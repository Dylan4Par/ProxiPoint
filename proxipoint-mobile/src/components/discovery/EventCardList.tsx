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
import { presentAssignedTag } from '../../lib/beaconDrop';
import type { AppearancePalette } from '../../lib/appearance';
import { chunkChronologicalFeed, formatFeedMeta, isLiveFeedItem, type FeedSection } from '../../lib/feedSections';
import { coordinatorBadgeLabel, hostReputation } from '../../lib/trust';
import { resolveTagAnchor } from '../../lib/tagIcons';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useDiscoveryStore, DiscoveryNode } from '../../stores/useDiscoveryStore';
import { ChannelBadge } from './ChannelBadge';
import { EventDetailPanel } from './EventDetailPanel';
import { PulsingDot } from './PulsingDot';

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
  const focusCard = useDiscoveryStore((s) => s.focusCard);
  const openCardDetail = useDiscoveryStore((s) => s.openCardDetail);
  const closeCardDetail = useDiscoveryStore((s) => s.closeCardDetail);
  const detailNodeId = useDiscoveryStore((s) => s.detailNodeId);
  const colors = useAppearanceStore((s) => s.colors);
  const night = useAppearanceStore((s) => s.mode) === 'night';
  const styles = useMemo(() => createCardStyles(colors, night), [colors, night]);

  const visibleNodes = useMemo(
    () => getVisibleNodes(),
    [getVisibleNodes, nodes, viewportBounds, activeTab, selectedTag],
  );
  const sections = chunkChronologicalFeed(visibleNodes);
  const tagFor = (node: { tags?: string[]; tag?: string }) =>
    presentAssignedTag(node.tags, selectedTag, node.tag ?? '');

  const [isExpanded, setIsExpanded] = useState(true);
  const animatedHeight = useRef(new Animated.Value(EXPANDED_HEIGHT)).current;
  const detailNode = detailNodeId ? nodes[detailNodeId] : undefined;
  const detailOpenRef = useRef(false);
  detailOpenRef.current = Boolean(detailNode);

  const selectedNode =
    visibleNodes.find((event) => event.id === selectedNodeId) ||
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
      hostCallsign: 'Unassigned',
    };

  const selectedTagLabel = tagFor(selectedNode);
  const selectedAnchor = resolveTagAnchor(selectedTagLabel);
  const selectedLive = isLiveFeedItem(selectedNode);

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
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 8,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 30) {
          if (detailOpenRef.current) {
            useDiscoveryStore.getState().closeCardDetail();
            animatedHeight.setValue(EXPANDED_HEIGHT);
            setIsExpanded(true);
            return;
          }
          animateDrawer(false);
        } else if (gestureState.dy < -30) {
          animateDrawer(true);
        }
      },
    }),
  ).current;

  const selectCard = (id: string) => {
    if (id === selectedNodeId) openCardDetail(id);
    else focusCard(id);
  };

  const renderCard = ({ item, section }: { item: DiscoveryNode; section: FeedListSection }) => {
    const isSelected = item.id === selectedNodeId;
    const isLive = section.tone === 'live';
    const label = tagFor(item);
    const anchor = resolveTagAnchor(label);
    const meta = formatFeedMeta(item);
    const reputation = hostReputation(item.hostDrops ?? 0, item.hostUpvotes ?? 0);
    const trustLabel = reputation.isVerifiedCoordinator
      ? coordinatorBadgeLabel(item.hostDrops ?? 0, item.hostUpvotes ?? 0)
      : '';
    const callsign = item.hostCallsign || item.hostName || 'Unassigned';

    return (
      <View style={[styles.card, isSelected && styles.cardSelected]}>
        <TouchableOpacity
          activeOpacity={0.9}
          testID={`event-card-${item.id}`}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={`${item.title}, ${meta}`}
          onPress={() => selectCard(item.id)}
          style={styles.cardHit}
        >
          <ChannelBadge tag={label} />
          <View style={styles.cardBody}>
            <Text style={[styles.channelLabel, { color: anchor.accent }]} numberOfLines={1}>
              {label}
            </Text>
            <Text style={styles.titleText} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.hostCallsign} numberOfLines={1}>
              {callsign}
            </Text>
            {trustLabel ? (
              <Text style={styles.verifiedBadge} numberOfLines={2}>
                {trustLabel}
              </Text>
            ) : null}
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
            accessibilityState={{ selected: item.isRsvpd }}
            accessibilityLabel={item.isRsvpd ? `Cancel RSVP for ${item.title}` : `RSVP to ${item.title}`}
            testID={`rsvp-button-${item.id}`}
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

  const showList = () => {
    animatedHeight.setValue(EXPANDED_HEIGHT);
    setIsExpanded(true);
    closeCardDetail();
  };

  return (
    <Animated.View style={[styles.drawerContainer, detailNode ? styles.drawerDetail : { height: animatedHeight }]}>
      <View {...panResponder.panHandlers} style={styles.headerDraggable}>
        <View style={styles.pullBar} />
        {detailNode ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back to events"
            testID="event-detail-back"
            activeOpacity={0.8}
            onPress={showList}
            style={styles.collapsedHeaderRow}
          >
            <Text style={styles.backLabel}>Events</Text>
            <Text style={styles.chevronToggle}>▾</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => animateDrawer(!isExpanded)}
            style={styles.collapsedHeaderRow}
          >
            <ChannelBadge tag={selectedTagLabel} size={36} />
            <View style={styles.collapsedMeta}>
              <Text style={[styles.collapsedTag, { color: selectedAnchor.accent }]}>{selectedTagLabel}</Text>
              <Text numberOfLines={1} style={styles.collapsedTitle}>
                {selectedNode.title}
              </Text>
            </View>
            {selectedLive ? <PulsingDot size={7} /> : null}
            <Text style={styles.chevronToggle}>{isExpanded ? '▾' : '▴'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {detailNode ? (
        <EventDetailPanel
          node={detailNode}
          tagLabel={tagFor(detailNode)}
          colors={colors}
          onRsvp={() => toggleRsvp(detailNode.id)}
        />
      ) : isExpanded ? (
        <SectionList
          testID="event-card-list"
          style={styles.list}
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>NO VIEWABLE EVENTS IN SECTOR</Text>
              <Text style={styles.emptySubtitle}>Drag the map to scan adjacent sectors</Text>
            </View>
          }
        />
      ) : null}
    </Animated.View>
  );
};

function createCardStyles(c: AppearancePalette, night: boolean) {
  const hairline = night ? '#1e293b' : c.border;
  const sheet = night ? '#090f1d' : c.drawer;
  const card = night ? '#0f172a' : c.card;
  const cardSelected = night ? '#0b1629' : c.cardSelected;
  const selectedBorder = night ? '#22d3ee' : c.accent;
  const title = night ? '#f8fafc' : c.text;
  const host = night ? '#e2e8f0' : c.text;
  const venue = night ? '#64748b' : c.textDim;
  const meta = night ? '#cbd5e1' : c.textMuted;
  const section = night ? '#94a3b8' : c.textMuted;
  const rsvpText = night ? '#94a3b8' : c.textMuted;
  const rsvpFill = night ? '#020617' : c.inset;
  const chevron = night ? '#94a3b8' : c.textMuted;

  return StyleSheet.create({
    drawerContainer: {
      backgroundColor: sheet,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderTopWidth: 1,
      borderColor: hairline,
      overflow: 'hidden',
      flexDirection: 'column',
    },
    drawerDetail: {
      flex: 1,
      minHeight: 0,
    },
    headerDraggable: {
      paddingTop: 8,
      paddingBottom: 8,
      paddingHorizontal: 16,
      backgroundColor: sheet,
    },
    pullBar: {
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: night ? '#334155' : c.pull,
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
      color: title,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 1,
    },
    backLabel: {
      color: title,
      fontSize: 15,
      fontWeight: '800',
      flex: 1,
    },
    chevronToggle: {
      color: chevron,
      fontSize: 18,
      fontWeight: '700',
      paddingHorizontal: 2,
    },
    list: {
      flex: 1,
      minHeight: 0,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 20,
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
      color: section,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.1,
    },
    sectionTitleLive: {
      color: '#6ee7b7',
    },
    sectionDivider: {
      height: 1,
      backgroundColor: hairline,
    },
    dateTick: {
      width: 7,
      height: 7,
      borderRadius: 2,
      marginHorizontal: 5,
      backgroundColor: night ? '#334155' : c.pull,
      borderWidth: 1,
      borderColor: night ? '#64748b' : c.textMuted,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: hairline,
      shadowColor: '#020617',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
      elevation: 3,
    },
    cardSelected: {
      borderColor: selectedBorder,
      backgroundColor: cardSelected,
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
      color: title,
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 18,
    },
    hostCallsign: {
      color: host,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 3,
    },
    verifiedBadge: {
      alignSelf: 'flex-start',
      color: '#facc15',
      backgroundColor: 'rgba(34, 211, 238, 0.12)',
      borderColor: 'rgba(250, 204, 21, 0.55)',
      borderWidth: 1,
      borderRadius: 999,
      overflow: 'hidden',
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginTop: 4,
      fontSize: 9,
      fontWeight: '800',
    },
    subline: {
      color: venue,
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
      color: meta,
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
      borderColor: hairline,
      backgroundColor: rsvpFill,
    },
    rsvpBtnActive: {
      borderColor: 'rgba(34, 211, 238, 0.55)',
      backgroundColor: 'rgba(34, 211, 238, 0.12)',
    },
    rsvpLabel: {
      color: rsvpText,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    rsvpLabelActive: {
      color: '#22d3ee',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 36,
    },
    emptyTitle: {
      color: venue,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
    },
    emptySubtitle: {
      color: venue,
      fontSize: 11,
      marginTop: 4,
    },
  });
}
