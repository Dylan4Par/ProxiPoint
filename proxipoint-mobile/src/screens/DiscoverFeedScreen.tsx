import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, ChevronDown, ChevronRight, Hash, Map as MapIcon, MapPin, Search, Users, X } from 'lucide-react-native';
import { CategoryBadge } from '../components/discovery/CategoryBadge';
import { useBoosts } from '../lib/boost';
import { canSeePoint, setJoined, useChannels, useVisibleComments, useVisiblePosts, type Channel } from '../lib/channels';
import { strongestSignals } from '../lib/signalScore';
import { StrongestSignalCard } from '../components/profile/Signal';
import {
  DEFAULT_RANGE_METERS,
  SEARCH_RANGES,
  distanceFrom,
  formatCount,
  formatDistance,
  groupByDay,
  inRange,
  isChannelQuery,
  recommendChannels,
  searchChannels,
  searchPoints,
  splitFeed,
  suggestTags,
  timeLabel,
  type ChannelPick,
  type FeedNode,
} from '../lib/discoverFeed';
import { isLiveNode } from '../lib/liveStatus';
import { isNodeAllowed, useModeration } from '../lib/moderation';
import { useDiscoveryStore, type DiscoveryNode } from '../stores/useDiscoveryStore';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme/ThemeContext';

interface DiscoverFeedScreenProps {
  interestTags: string[];
  /** e.g. "Erie, CO" — the area Discover (and Explore Map) is looking at. */
  placeLabel: string;
  /** Pick a different area (the same city picker Explore Map uses). */
  onPickLocation: () => void;
  /** Show the Point on Explore Map with its details open. */
  onOpenPoint: (id: string) => void;
  onToggleRsvp: (id: string) => void;
  /** Open a channel's page in the Channels tab. */
  onOpenChannel: (id: string) => void;
  /** Channels tab, on the list of channels to join. */
  onBrowseChannels: () => void;
  onOpenMap: () => void;
  /** Explore Map filtered to this #tag. */
  onShowTagOnMap: (tag: string) => void;
  /** Open search from elsewhere (e.g. Channels' search button): focuses the box. New key = new request. */
  searchRequest?: { key: number; text?: string } | null;
  /** Someone's @handle (Strongest Signal): their profile. */
  onOpenProfile: (handle: string) => void;
}

const tagKey = (tag: string) => tag.replace(/^#+/, '').trim().toLowerCase();
/** Channel rows shown above the Points for a plain search ("All" shows the rest). */
const MAX_CHANNEL_ROWS = 3;

/**
 * Discover tab: a search bar (#tags or words, an area and a range), then a feed of channels to
 * join, what's happening nearby now, and what's coming up. Built from the same Points as
 * Explore Map (useDiscoveryStore), so the two always agree. The range applies to the feed too.
 */
export const DiscoverFeedScreen: React.FC<DiscoverFeedScreenProps> = ({
  interestTags,
  placeLabel,
  onPickLocation,
  onOpenPoint,
  onToggleRsvp,
  onOpenChannel,
  onBrowseChannels,
  onOpenMap,
  onShowTagOnMap,
  searchRequest = null,
  onOpenProfile,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const nodes = useDiscoveryStore((state) => state.nodes) as unknown as Record<string, DiscoveryNode>;
  const viewPlace = useDiscoveryStore((state) => state.viewPlace);
  const headerTags = useDiscoveryStore((state) => state.tags) as string[];
  const channels = useChannels();
  const now = useBoosts(); // ticks every 30s, so "live" and "starts in" stay current
  const moderation = useModeration();

  const [query, setQuery] = useState('');
  const searchInput = useRef<TextInput | null>(null);
  // Opened from another tab's search button: fill in any starting text and focus the box.
  useEffect(() => {
    if (!searchRequest) return;
    setQuery(searchRequest.text ?? '');
    const timer = setTimeout(() => searchInput.current?.focus(), 250); // after the tab has laid out
    return () => clearTimeout(timer);
  }, [searchRequest?.key]);
  const [rangeMeters, setRangeMeters] = useState<number | null>(DEFAULT_RANGE_METERS);
  const center = { latitude: viewPlace.latitude, longitude: viewPlace.longitude };
  const searching = query.trim().length > 0;
  const rangeLabel = SEARCH_RANGES.find((r) => r.meters === rangeMeters)?.label ?? 'Any';
  const visible = (node: FeedNode) => isNodeAllowed(node) && canSeePoint(node);
  const allowed = (node: FeedNode) => visible(node) && inRange(center, node, rangeMeters);

  // ---- Feed (no search) ----
  const { nearby, upcoming } = useMemo(
    () => splitFeed(nodes, now, allowed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, now, moderation, viewPlace.latitude, viewPlace.longitude, rangeMeters],
  );
  const upcomingDays = useMemo(() => groupByDay(upcoming, now), [upcoming, now]);
  // Strongest Signal around here: top contributors across local channels, last 30 days.
  const posts = useVisiblePosts();
  const comments = useVisibleComments();
  const strongest = useMemo(() => strongestSignals(posts, comments, { now, limit: 3 }), [posts, comments, now]);
  const channelPicks = useMemo(
    () => recommendChannels(channels, nodes, interestTags, now),
    [channels, nodes, interestTags, now],
  );

  // ---- Search ----
  const results = useMemo(
    () => (searching ? searchPoints(nodes, query, center, rangeMeters, now, visible) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searching, nodes, query, viewPlace.latitude, viewPlace.longitude, rangeMeters, now, moderation],
  );
  const suggestions = useMemo(
    () => (searching ? suggestTags(nodes, query, headerTags) : []),
    [searching, nodes, query, headerTags],
  );
  const channelResults = useMemo(() => (searching ? searchChannels(channels, query) : []), [searching, channels, query]);
  const channelSearch = isChannelQuery(query);
  // A one-word search that is exactly a #tag can be shown on the map with that tag's filter.
  const words = query.trim().split(/\s+/);
  const exactTag =
    words.length === 1 ? suggestions.find((s) => tagKey(s.tag) === tagKey(words[0]))?.tag ?? null : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="discover-feed"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <TouchableOpacity
          style={styles.mapBtn}
          onPress={onOpenMap}
          accessibilityRole="button"
          accessibilityLabel="Open Explore Map"
          testID="discover-open-map"
        >
          <MapIcon size={14} color={c.accent} strokeWidth={2.5} />
          <Text style={styles.mapBtnText}>Map</Text>
        </TouchableOpacity>
      </View>

      {/* ---- Search bar ---- */}
      <View style={styles.searchBox}>
        <Search size={18} color={c.textMuted} strokeWidth={2.25} />
        <TextInput
          ref={searchInput}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search #tags, c/channels or events"
          placeholderTextColor={c.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search Discover"
          testID="discover-search"
        />
        {searching ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
            <X size={18} color={c.textMuted} strokeWidth={2.25} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ---- Where and how far ---- */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.placeChip}
          onPress={onPickLocation}
          accessibilityRole="button"
          accessibilityLabel={`Searching near ${placeLabel || 'your area'}. Change location`}
          testID="discover-location"
        >
          <MapPin size={14} color={c.accent} strokeWidth={2.5} />
          <Text style={styles.placeChipText} numberOfLines={1}>
            {placeLabel || 'Your area'}
          </Text>
          <ChevronDown size={14} color={c.accent} strokeWidth={2.5} />
        </TouchableOpacity>
        {SEARCH_RANGES.map((range) => {
          const active = range.meters === rangeMeters;
          return (
            <TouchableOpacity
              key={range.label}
              style={[styles.rangeChip, active && styles.rangeChipActive]}
              onPress={() => setRangeMeters(range.meters)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={range.meters == null ? 'Any distance' : `Within ${range.label}`}
              testID={`discover-range-${range.label.replace(' ', '')}`}
            >
              <Text style={[styles.rangeText, active && styles.rangeTextActive]}>{range.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {searching ? (
        <>
          {/* #tag suggestions for what's typed */}
          {suggestions.length && !exactTag ? (
            <View style={styles.suggestRow}>
              {suggestions.map((s) => (
                <TouchableOpacity
                  key={s.tag}
                  style={styles.suggestChip}
                  onPress={() => setQuery(s.tag)}
                  accessibilityRole="button"
                  accessibilityLabel={`Search ${s.tag}`}
                >
                  <Hash size={12} color={c.accent} strokeWidth={2.5} />
                  <Text style={styles.suggestText}>{s.tag.replace(/^#/, '')}</Text>
                  {s.count ? <Text style={styles.suggestCount}>{s.count}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {/* Channels first, like communities at the top of a search; "c/…" searches only them. */}
          {channelResults.length ? (
            <>
              <SectionHeader
                label={`${channelResults.length} ${channelResults.length === 1 ? 'CHANNEL' : 'CHANNELS'}`}
                action={!channelSearch && channelResults.length > MAX_CHANNEL_ROWS ? 'All' : undefined}
                onAction={() => setQuery(`c/${query.trim().replace(/^#+/, '')}`)}
              />
              <View style={styles.list}>
                {(channelSearch ? channelResults : channelResults.slice(0, MAX_CHANNEL_ROWS)).map((channel) => (
                  <ChannelResultRow key={channel.id} channel={channel} onOpen={() => onOpenChannel(channel.id)} />
                ))}
              </View>
            </>
          ) : channelSearch ? (
            <Text style={styles.emptyText}>No channels match “{query.trim()}”. Try a #tag or a word.</Text>
          ) : null}

          {channelSearch ? null : (
            <>
            <SectionHeader
              label={`${results.length} ${results.length === 1 ? 'POINT' : 'POINTS'}${
                rangeMeters == null ? '' : ` WITHIN ${rangeLabel.toUpperCase()}`
              }`}
              action={exactTag ? 'Show on map' : undefined}
              onAction={exactTag ? () => onShowTagOnMap(exactTag) : undefined}
            />
            {results.length ? (
              <View style={styles.list}>
                {results.map((node) => (
                  <EventRow
                    key={node.id}
                    node={node}
                    distanceMeters={distanceFrom(center, node)}
                    onOpen={() => onOpenPoint(node.id)}
                    onToggleRsvp={() => onToggleRsvp(node.id)}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.noResults}>
                <Text style={styles.emptyText}>
                  No Points match “{query.trim()}”
                  {rangeMeters == null ? '' : ` within ${rangeLabel} of ${placeLabel || 'here'}`}.
                </Text>
                {rangeMeters != null ? (
                  <TouchableOpacity onPress={() => setRangeMeters(null)} accessibilityRole="button" style={styles.widenBtn}>
                    <Text style={styles.widenText}>Search any distance</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
            </>
          )}
        </>
      ) : (
        <>
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

          {/* ---- Strongest Signal ---- */}
          {strongest.length ? (
            <>
              <SectionHeader label="STRONGEST SIGNAL NEARBY" />
              <StrongestSignalCard ranks={strongest} scopeLabel="Local channels · 30 days" onOpenProfile={onOpenProfile} />
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
            <Text style={styles.emptyText}>
              Nothing live or starting in the next two hours
              {rangeMeters == null ? ' around here' : ` within ${rangeLabel}`}.
            </Text>
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
            <Text style={styles.emptyText}>No upcoming Points in range yet. Try a wider range, or drop one from the map.</Text>
          )}
        </>
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

/** One channel in search results: badge, name, handle and members, with Join. */
const ChannelResultRow: React.FC<{ channel: Channel; onOpen: () => void }> = ({ channel, onOpen }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity
      style={styles.resultRow}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open ${channel.name}`}
      testID={`search-channel-${channel.id}`}
    >
      <CategoryBadge tag={channel.tags[0]} title={channel.name} size={34} />
      <View style={styles.resultCopy}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {channel.name}
        </Text>
        <Text style={styles.resultMeta} numberOfLines={1}>
          {channel.handle} · {formatCount(channel.memberCount)} members
          {channel.auto && !channel.owner ? ' · Unclaimed' : ''}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.joinBtnSmall, channel.joined && styles.joinBtnJoined]}
        onPress={() => setJoined(channel.id, !channel.joined)}
        accessibilityRole="button"
        accessibilityLabel={channel.joined ? `Leave ${channel.name}` : `Join ${channel.name}`}
      >
        {channel.joined ? <Check size={13} color={c.accent} strokeWidth={3} /> : null}
        <Text style={[styles.joinText, channel.joined && styles.joinTextJoined]}>{channel.joined ? 'JOINED' : 'JOIN'}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
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
  /** Distance to show instead of the distance from you (search: from the searched area). */
  distanceMeters?: number | null;
  onOpen: () => void;
  onToggleRsvp: () => void;
}> = ({ node, showTime = false, distanceMeters, onOpen, onToggleRsvp }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const live = isLiveNode(node);
  const tag = node.tags?.[0] ?? node.tag;
  const where = node.locationPrivacy?.regionName ? `In ${node.locationPrivacy.regionName}` : node.venue;
  const distance = formatDistance(distanceMeters ?? node.distanceMeters);
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
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
      paddingHorizontal: 14,
      minHeight: 46,
      borderRadius: 23,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    searchInput: { flex: 1, color: c.text, fontSize: 15, paddingVertical: 10 },
    filterScroll: { marginHorizontal: -16, marginTop: 10 },
    filterRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
    placeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      maxWidth: 180,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.accentBorder,
      backgroundColor: c.accentTint,
    },
    placeChipText: { color: c.accent, fontSize: 13, fontWeight: '800', flexShrink: 1 },
    rangeChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      backgroundColor: c.border,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    rangeChipActive: { backgroundColor: c.accentDeep, borderColor: c.accent },
    rangeText: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
    rangeTextActive: { color: c.white, fontWeight: '800' },
    suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
    suggestChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    suggestText: { color: c.accent, fontSize: 13, fontWeight: '700' },
    suggestCount: { color: c.textFaint, fontSize: 11, fontWeight: '700', marginLeft: 3 },
    noResults: { gap: 10, alignItems: 'flex-start' },
    widenBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    widenText: { color: c.accent, fontSize: 13, fontWeight: '800' },
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
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
    },
    resultCopy: { flex: 1, gap: 2 },
    resultTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
    resultMeta: { color: c.textMuted, fontSize: 12 },
    joinBtnSmall: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: 32,
      paddingHorizontal: 14,
      borderRadius: 16,
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
