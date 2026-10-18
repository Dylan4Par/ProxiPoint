import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronRight, Map as MapIcon, Users } from 'lucide-react-native';
import { CategoryBadge } from '../components/discovery/CategoryBadge';
import { useBoosts } from '../lib/boost';
import { setJoined, useChannels } from '../lib/channels';
import {
  formatCount,
  formatDistance,
  groupByDay,
  recommendChannels,
  splitFeed,
  timeLabel,
  type ChannelPick,
} from '../lib/discoverFeed';
import { isLiveNode } from '../lib/liveStatus';
import { isNodeAllowed, useModeration } from '../lib/moderation';
import { useDiscoveryStore, type DiscoveryNode } from '../stores/useDiscoveryStore';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme/ThemeContext';

interface DiscoverFeedScreenProps {
  interestTags: string[];
  /** e.g. "Erie, CO" — the area the feed is about. */
  placeLabel: string;
  /** Show the Point on Explore Map with its details open. */
  onOpenPoint: (id: string) => void;
  onToggleRsvp: (id: string) => void;
  /** Open a channel's page in the Channels tab. */
  onOpenChannel: (id: string) => void;
  /** Channels tab, on the list of channels to join. */
  onBrowseChannels: () => void;
  onOpenMap: () => void;
}

/**
 * Discover tab: a feed of channels to join, what's happening near you now, and what's coming up.
 * Built from the same Points as Explore Map (useDiscoveryStore), so the two always agree.
 */
export const DiscoverFeedScreen: React.FC<DiscoverFeedScreenProps> = ({
  interestTags,
  placeLabel,
  onOpenPoint,
  onToggleRsvp,
  onOpenChannel,
  onBrowseChannels,
  onOpenMap,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const nodes = useDiscoveryStore((state) => state.nodes) as unknown as Record<string, DiscoveryNode>;
  const channels = useChannels();
  const now = useBoosts(); // ticks every 30s, so "live" and "starts in" stay current
  const moderation = useModeration();

  const { nearby, upcoming } = useMemo(
    () => splitFeed(nodes, now, isNodeAllowed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, now, moderation],
  );
  const upcomingDays = useMemo(() => groupByDay(upcoming, now), [upcoming, now]);
  const channelPicks = useMemo(
    () => recommendChannels(channels, nodes, interestTags, now),
    [channels, nodes, interestTags, now],
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="discover-feed">
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <TouchableOpacity
          style={styles.mapBtn}
          onPress={onOpenMap}
          accessibilityRole="button"
          accessibilityLabel={`Open Explore Map${placeLabel ? ` for ${placeLabel}` : ''}`}
          testID="discover-open-map"
        >
          <MapIcon size={14} color={c.accent} strokeWidth={2.5} />
          <Text style={styles.mapBtnText} numberOfLines={1}>
            {placeLabel || 'Map'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ---- Channel recommendations ---- */}
      {channelPicks.length ? (
        <>
          <SectionHeader label="CHANNELS FOR YOU" action="See all" onAction={onBrowseChannels} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.channelRow}
            style={styles.channelScroll}
          >
            {channelPicks.map((pick) => (
              <ChannelCard key={pick.channel.id} pick={pick} onOpen={() => onOpenChannel(pick.channel.id)} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* ---- Nearby now ---- */}
      <SectionHeader label="HAPPENING NEARBY" action="Map" onAction={onOpenMap} />
      {nearby.length ? (
        <View style={styles.list}>
          {nearby.map((node) => (
            <EventRow
              key={node.id}
              node={node as DiscoveryNode}
              onOpen={() => onOpenPoint(node.id)}
              onToggleRsvp={() => onToggleRsvp(node.id)}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>Nothing live or starting in the next two hours around here.</Text>
      )}

      {/* ---- Upcoming ---- */}
      <SectionHeader label="UPCOMING" />
      {upcomingDays.length ? (
        upcomingDays.map((group) => (
          <View key={group.label} style={styles.dayGroup}>
            <Text style={styles.dayLabel}>{group.label}</Text>
            <View style={styles.list}>
              {group.items.map((node) => (
                <EventRow
                  key={node.id}
                  node={node as DiscoveryNode}
                  showTime
                  onOpen={() => onOpenPoint(node.id)}
                  onToggleRsvp={() => onToggleRsvp(node.id)}
                />
              ))}
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>No upcoming Points yet. Check back soon, or drop one from the map.</Text>
      )}
    </ScrollView>
  );
};

const SectionHeader: React.FC<{ label: string; action?: string; onAction?: () => void }> = ({
  label,
  action,
  onAction,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} style={styles.sectionAction} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.sectionActionText}>{action}</Text>
          <ChevronRight size={14} color={c.accent} strokeWidth={2.5} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const ChannelCard: React.FC<{ pick: ChannelPick; onOpen: () => void }> = ({ pick, onOpen }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const { channel } = pick;
  return (
    <TouchableOpacity
      style={styles.channelCard}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${channel.name}. ${pick.reason}`}
      testID={`discover-channel-${channel.id}`}
    >
      <View style={styles.channelTop}>
        <CategoryBadge tag={channel.tags[0]} title={channel.name} size={34} />
        <View style={styles.channelCopy}>
          <Text style={styles.channelName} numberOfLines={2}>
            {channel.name}
          </Text>
          <View style={styles.channelMetaRow}>
            <Users size={11} color={c.textFaint} strokeWidth={2.25} />
            <Text style={styles.channelMeta}>{formatCount(channel.memberCount)}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.channelReason} numberOfLines={1}>
        {pick.reason}
      </Text>
      <TouchableOpacity
        style={[styles.joinBtn, channel.joined && styles.joinBtnJoined]}
        onPress={() => setJoined(channel.id, !channel.joined)}
        accessibilityRole="button"
        accessibilityLabel={channel.joined ? `Leave ${channel.name}` : `Join ${channel.name}`}
        testID={`discover-join-${channel.id}`}
      >
        {channel.joined ? <Check size={14} color={c.accent} strokeWidth={3} /> : null}
        <Text style={[styles.joinText, channel.joined && styles.joinTextJoined]}>
          {channel.joined ? 'JOINED' : 'JOIN'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const EventRow: React.FC<{
  node: DiscoveryNode;
  /** Upcoming list: show the start time instead of the status text. */
  showTime?: boolean;
  onOpen: () => void;
  onToggleRsvp: () => void;
}> = ({ node, showTime = false, onOpen, onToggleRsvp }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const live = isLiveNode(node);
  const tag = node.tags?.[0] ?? node.tag;
  const where = node.locationPrivacy?.regionName ? `In ${node.locationPrivacy.regionName}` : node.venue;
  const distance = formatDistance(node.distanceMeters);
  const when = live ? 'LIVE NOW' : showTime && node.startsAt ? timeLabel(node.startsAt) : node.status;

  return (
    <TouchableOpacity
      style={[styles.eventRow, live && styles.eventRowLive]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${node.title}. ${when}. ${where}`}
      testID={`discover-event-${node.id}`}
    >
      <CategoryBadge tag={tag} title={node.title} photoUri={node.coverPhotoUri} size={38} />
      <View style={styles.eventCopy}>
        {tag ? (
          <Text style={styles.eventTag} numberOfLines={1}>
            {tag}
          </Text>
        ) : null}
        <Text style={styles.eventTitle} numberOfLines={1}>
          {node.title}
        </Text>
        <Text style={styles.eventMeta} numberOfLines={1}>
          {[where, distance ? `${distance} away` : null].filter(Boolean).join(' · ')}
        </Text>
        {when ? (
          <View style={[styles.whenChip, live && styles.whenChipLive]}>
            {live ? <View style={styles.liveDot} /> : null}
            <Text style={[styles.whenText, live && styles.whenTextLive]}>{when}</Text>
          </View>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.rsvpBtn}
        onPress={onToggleRsvp}
        accessibilityRole="button"
        accessibilityState={{ selected: node.isRsvpd }}
        accessibilityLabel={node.isRsvpd ? `Cancel RSVP for ${node.title}` : `RSVP to ${node.title}`}
        hitSlop={6}
      >
        {node.isRsvpd ? (
          <View style={styles.rsvpDone}>
            <Check size={16} color={c.onAccent} strokeWidth={3} />
          </View>
        ) : (
          <Check size={18} color={c.textMuted} strokeWidth={2.5} />
        )}
        <Text style={[styles.rsvpText, node.isRsvpd && styles.rsvpTextDone]}>{node.isRsvpd ? 'GOING' : 'RSVP'}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: c.base },
    content: { paddingHorizontal: 16, paddingBottom: 28 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingTop: 16,
      paddingBottom: 4,
    },
    title: { color: c.text, fontSize: 24, fontWeight: '800' },
    mapBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flexShrink: 1,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.accentBorder,
      backgroundColor: c.accentTint,
    },
    mapBtnText: { color: c.accent, fontSize: 12, fontWeight: '800' },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 20,
      marginBottom: 8,
    },
    sectionLabel: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
    sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    sectionActionText: { color: c.accent, fontSize: 12, fontWeight: '700' },
    emptyText: { color: c.textFaint, fontSize: 13, lineHeight: 19 },
    list: { gap: 10 },
    dayGroup: { marginBottom: 12 },
    dayLabel: { color: c.textBody, fontSize: 14, fontWeight: '800', marginBottom: 8 },

    // Channel cards (horizontal)
    channelScroll: { marginHorizontal: -16 },
    channelRow: { paddingHorizontal: 16, gap: 10 },
    channelCard: {
      width: 200,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      gap: 8,
    },
    channelTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    channelCopy: { flex: 1, gap: 2 },
    channelName: { color: c.text, fontSize: 14, fontWeight: '800', lineHeight: 18 },
    channelMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    channelMeta: { color: c.textFaint, fontSize: 11, fontWeight: '600' },
    channelReason: { color: c.textSecondary, fontSize: 12 },
    joinBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: 34,
      borderRadius: 17,
      backgroundColor: c.accent,
    },
    joinBtnJoined: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.accentBorder },
    joinText: { color: c.onAccent, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
    joinTextJoined: { color: c.accent },

    // Event rows
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
    },
    eventRowLive: { borderColor: c.accentBorder },
    eventCopy: { flex: 1, gap: 2 },
    eventTag: { color: c.accent, fontSize: 12, fontWeight: '800' },
    eventTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
    eventMeta: { color: c.textMuted, fontSize: 12 },
    whenChip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: c.surfaceDim,
      borderWidth: 1,
      borderColor: c.border,
    },
    whenChipLive: { backgroundColor: c.greenTint, borderColor: c.greenDeep },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.green },
    whenText: { color: c.textSecondary, fontSize: 11, fontWeight: '700' },
    whenTextLive: { color: c.green, fontWeight: '900', letterSpacing: 0.8 },
    rsvpBtn: { alignItems: 'center', gap: 2, minWidth: 44, paddingVertical: 4 },
    rsvpDone: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
    },
    rsvpText: { color: c.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
    rsvpTextDone: { color: c.accent },
  });
