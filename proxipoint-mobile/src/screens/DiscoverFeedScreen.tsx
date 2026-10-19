import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Linking, Platform, ScrollView, useWindowDimensions, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CalendarCheck, CalendarDays, Check, ChevronDown, ChevronRight, Hash, Info, Map as MapIcon, MapPin, Search, Store, Users, X, Zap } from 'lucide-react-native';
import { CategoryBadge } from '../components/discovery/CategoryBadge';
import { PointCard } from '../components/discovery/PointCard';
import { getHiddenBoosts, hideBoost, isBoosted, useBoosts } from '../lib/boost';
import { localSpots, matchesInterests, placeBoosts, spotsLabel, upNextPlans, type PlanRole } from '../lib/discoverSlots';
import { inTimeWindow, timeWindowLabel, useTimeWindow } from '../lib/timeWindow';
import { formatRange } from '../lib/calendarRange';
import { MapFilterSheet } from '../components/discovery/MapFilterSheet';
import { useMapPostFilter } from '../lib/mapFilters';
import { isBusinessHost } from '../lib/hostProfiles';
import { canSeePoint, toggleMembership, useChannels, useVisiblePosts, type Channel } from '../lib/channels';
import { MEMBERSHIP_LABEL, accessOf, membershipAction } from '../lib/channelAccess';
import { PLACE_ICON, placeMeta, usePlaceIndex } from '../components/channels/PlacePicker';
import { searchLocalPlaces, type LocalPlace } from '../lib/localPlaces';
import { kindInfo, searchPosts } from '../lib/postKinds';
import { countInterested, interestLine, useInterestMembers } from '../lib/nearbyInterest';
import { timeAgo } from '../lib/activity';
import type { ChannelPost } from '../lib/channels';
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
  /** A post from search: its page (with comments) in Channels. */
  onOpenPost: (id: string) => void;
  /** A place from search: its page (everything said about it). */
  onOpenPlace: (id: string) => void;
  /** When → Pick dates: the Calendar (its button sets the dates and comes back here). */
  onPickDates: () => void;
  /** Up next → Manage: the Manage sheet for a Point you're hosting. */
  onManagePoint: (id: string) => void;
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
  onOpenPost,
  onOpenPlace,
  onPickDates,
  onManagePoint,
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
  // When: the same time window as Explore Map (next 3 days by default, a preset, or Calendar dates).
  const timeWindow = useTimeWindow();
  const postFilter = useMapPostFilter();
  const [whenOpen, setWhenOpen] = useState(false);
  const whenLabel = timeWindowLabel(timeWindow) ?? formatRange({ start: new Date(timeWindow.start), end: new Date(timeWindow.end) });
  // Only times that reach now count as "happening nearby" (Tomorrow or This weekend skip it).
  const windowIncludesNow = timeWindow.start <= now + 60000;
  const allowed = (node: FeedNode) => visible(node) && inRange(center, node, rangeMeters) && inTimeWindow(node, timeWindow);

  // ---- Feed (no search) ----
  const { nearby, upcoming } = useMemo(
    () => splitFeed(nodes, now, allowed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, now, moderation, viewPlace.latitude, viewPlace.longitude, rangeMeters, timeWindow.start, timeWindow.end],
  );
  const upcomingDays = useMemo(() => groupByDay(upcoming, now), [upcoming, now]);
  // Businesses on Discover: Boosted Points in fixed, labeled slots (never re-ranking the rest), and
  // one card per business venue with something on today (discoverSlots.ts).
  const hiddenBoosts = getHiddenBoosts();
  const nearbyPlaced = useMemo(
    () => placeBoosts(nearby as DiscoveryNode[], (node) => isBoosted(node.id, now), { interestTags, hidden: hiddenBoosts }),
    [nearby, now, interestTags, hiddenBoosts],
  );
  const spots = useMemo(
    () =>
      localSpots((Object.values(nodes || {}) as DiscoveryNode[]).filter(allowed), {
        now,
        isBusiness: isBusinessHost,
        isBoosted: (node) => isBoosted(node.id, now),
        hidden: hiddenBoosts,
        window: timeWindow.custom ? timeWindow : null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, now, moderation, viewPlace.latitude, viewPlace.longitude, rangeMeters, hiddenBoosts, timeWindow.start, timeWindow.end],
  );
  // Up next: your own plans that are live or start within 3 hours (any distance, any When).
  const plans = useMemo(
    () => upNextPlans((Object.values(nodes || {}) as DiscoveryNode[]).filter((node) => isNodeAllowed(node)), now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, now, moderation],
  );
  const whyBoosted = (node: DiscoveryNode) => showBoostInfo(node, matchesInterests(node, interestTags));
  const posts = useVisiblePosts();
  const channelPicks = useMemo(
    () => recommendChannels(channels, nodes, interestTags, now),
    [channels, nodes, interestTags, now],
  );

  // ---- Search ----
  const results = useMemo(
    () =>
      searching
        ? searchPoints(nodes, query, center, rangeMeters, now, (node) => visible(node) && inTimeWindow(node, timeWindow))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searching, nodes, query, viewPlace.latitude, viewPlace.longitude, rangeMeters, now, moderation, timeWindow.start, timeWindow.end],
  );
  const suggestions = useMemo(
    () => (searching ? suggestTags(nodes, query, headerTags) : []),
    [searching, nodes, query, headerTags],
  );
  const channelResults = useMemo(() => (searching ? searchChannels(channels, query) : []), [searching, channels, query]);
  // Places and posts: the local knowledge (tips, answers, heads-ups) people left behind.
  const places = usePlaceIndex();
  const placeResults = useMemo(
    () =>
      searching
        ? searchLocalPlaces(places, query, center, 12).filter((place) => inRange(center, place, rangeMeters)).slice(0, 4)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searching, places, query, viewPlace.latitude, viewPlace.longitude, rangeMeters],
  );
  const postResults = useMemo(
    () => (searching ? searchPosts(posts, query, { center, rangeMeters, limit: 10 }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searching, posts, query, viewPlace.latitude, viewPlace.longitude, rangeMeters],
  );
  const channelSearch = isChannelQuery(query);
  // A one-word search that is exactly a #tag can be shown on the map with that tag's filter.
  const words = query.trim().split(/\s+/);
  const exactTag =
    words.length === 1 ? suggestions.find((s) => tagKey(s.tag) === tagKey(words[0]))?.tag ?? null : null;
  // Searching one #tag: how many people around here are into it (rounded; hidden under 10).
  const interestMembers = useInterestMembers();
  const tagWord = words.length === 1 && words[0].replace(/^#+/, '').length >= 2 ? words[0] : null;
  const nearbyInterest =
    searching && tagWord && !channelSearch
      ? interestLine(
          countInterested(interestMembers, exactTag ?? tagWord, center, rangeMeters ?? 25000),
          (exactTag ?? `#${tagWord.replace(/^#+/, '')}`).replace(/^#+/, ''),
          rangeMeters ?? 25000,
        )
      : null;

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
          placeholder="Search #tags, places, posts or c/channels"
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
          style={[styles.placeChip, !timeWindow.custom && styles.whenChipQuiet]}
          onPress={() => setWhenOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Showing ${whenLabel}. Change when`}
          testID="discover-when"
        >
          <CalendarDays size={14} color={c.accent} strokeWidth={2.5} />
          <Text style={styles.placeChipText} numberOfLines={1}>
            {whenLabel}
          </Text>
          <ChevronDown size={14} color={c.accent} strokeWidth={2.5} />
        </TouchableOpacity>
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

      <MapFilterSheet
        visible={whenOpen}
        title="When"
        showPostFilters={false}
        window={timeWindow}
        postFilter={postFilter}
        onClose={() => setWhenOpen(false)}
        onPickDates={() => {
          setWhenOpen(false);
          onPickDates();
        }}
      />

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

          {nearbyInterest ? (
            <View style={styles.interestRow} testID="discover-nearby-interest">
              <Users size={14} color={c.violet} strokeWidth={2.25} />
              <Text style={styles.interestText}>{nearbyInterest}</Text>
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

          {/* Places: parks, venues, trails, intersections. */}
          {!channelSearch && placeResults.length ? (
            <>
              <SectionHeader label={placeResults.length === 1 ? 'PLACE' : 'PLACES'} />
              <View style={styles.list}>
                {placeResults.map((place) => (
                  <PlaceResultRow key={place.id} place={place} from={center} onOpen={() => onOpenPlace(place.id)} />
                ))}
              </View>
            </>
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

          {/* Posts: tips and answers first, then the rest. */}
          {!channelSearch && postResults.length ? (
            <>
              <SectionHeader label={`${postResults.length} ${postResults.length === 1 ? 'POST' : 'POSTS'}`} />
              <View style={styles.list}>
                {postResults.map((post) => (
                  <PostResultRow
                    key={post.id}
                    post={post}
                    channel={channels.find((channel) => channel.id === post.channelId) ?? null}
                    now={now}
                    onOpen={() => onOpenPost(post.id)}
                  />
                ))}
              </View>
            </>
          ) : null}
        </>
      ) : (
        <>
          {/* ---- Up next: your plan, only when it's close ---- */}
          {plans.length ? (
            <UpNextCards plans={plans} now={now} onOpenPoint={onOpenPoint} onManagePoint={onManagePoint} />
          ) : null}

          {/* ---- Local spots: businesses with something on today ---- */}
          {spots.length ? (
            <>
              <SectionHeader label={timeWindow.custom ? `LOCAL SPOTS · ${whenLabel.toUpperCase()}` : spotsLabel(now)} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.channelRow}
                style={styles.channelScroll}
                testID="discover-local-spots"
              >
                {spots.map(({ node, boosted, live }) => (
                  <SpotCard
                    key={node.id}
                    node={node}
                    boosted={boosted}
                    live={live}
                    onOpen={() => onOpenPoint(node.id)}
                    onWhyBoosted={() => whyBoosted(node)}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          {/* ---- Nearby now (only when the chosen time reaches now) ---- */}
          {windowIncludesNow ? (
          <>
          <SectionHeader label="HAPPENING NEARBY" action="Map" onAction={onOpenMap} />
          {nearby.length ? (
            <View style={styles.list}>
              {nearbyPlaced.map(({ item: node, boosted }) => (
                <EventRow
                  key={node.id}
                  node={node}
                  boosted={boosted}
                  onWhyBoosted={() => whyBoosted(node)}
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

          </>
          ) : null}

          {/* ---- Upcoming ---- */}
          <SectionHeader label={timeWindow.custom ? whenLabel.toUpperCase() : 'UPCOMING'} />
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
            <Text style={styles.emptyText}>
              {timeWindow.custom
                ? `Nothing scheduled for ${whenLabel.toLowerCase()} in range yet. Try other dates or a wider range.`
                : 'No upcoming Points in range yet. Try a wider range, or drop one from the map.'}
            </Text>
          )}

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
          {accessOf(channel) === 'private' ? ' · Private' : accessOf(channel) === 'restricted' ? ' · Restricted' : ''}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.joinBtnSmall, membershipAction(channel) !== 'join' && membershipAction(channel) !== 'request' && styles.joinBtnJoined]}
        onPress={() => toggleMembership(channel.id)}
        disabled={membershipAction(channel) === 'moderator'}
        accessibilityRole="button"
        accessibilityLabel={`${MEMBERSHIP_LABEL[membershipAction(channel)]} ${channel.name}`}
      >
        {channel.joined ? <Check size={13} color={c.accent} strokeWidth={3} /> : null}
        <Text style={[styles.joinText, membershipAction(channel) !== 'join' && membershipAction(channel) !== 'request' && styles.joinTextJoined]}>
          {MEMBERSHIP_LABEL[membershipAction(channel)]}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const PlaceResultRow: React.FC<{ place: LocalPlace; from: { latitude: number; longitude: number }; onOpen: () => void }> = ({
  place,
  from,
  onOpen,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity
      style={styles.resultRow}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${placeMeta(place, from)}. Open place`}
      testID={`search-place-${place.id}`}
    >
      <View style={styles.placeResultIcon}>
        {React.createElement(PLACE_ICON[place.kind], { size: 17, color: c.violet, strokeWidth: 2.25 })}
      </View>
      <View style={styles.resultCopy}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={styles.resultMeta} numberOfLines={1}>
          {placeMeta(place, from)}
        </Text>
      </View>
      <ChevronRight size={16} color={c.iconFaint} strokeWidth={2.25} />
    </TouchableOpacity>
  );
};

const PostResultRow: React.FC<{ post: ChannelPost; channel: Channel | null; now: number; onOpen: () => void }> = ({
  post,
  channel,
  now,
  onOpen,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const kind = post.kind && post.kind !== 'chat' ? kindInfo(post.kind).label.toUpperCase() : null;
  return (
    <TouchableOpacity
      style={styles.postResult}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${kind ? `${kind}: ` : ''}${post.body}. Open post`}
      testID={`search-post-${post.id}`}
    >
      <Text style={styles.postResultBody} numberOfLines={2}>
        {kind ? <Text style={styles.postResultKind}>{kind} </Text> : null}
        {post.body || 'Photo post'}
      </Text>
      <Text style={styles.resultMeta} numberOfLines={1}>
        {[channel?.handle, post.place?.label, timeAgo(post.createdAt, now), post.upvotes ? `♥ ${post.upvotes}` : null].filter(Boolean).join(' · ')}
      </Text>
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
        onPress={() => toggleMembership(channel.id)}
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

/** "in 1h 20m", "in 15m" */
function startsIn(startsAt: string | undefined, now: number): string {
  if (!startsAt) return 'soon';
  const minutes = Math.max(1, Math.round((new Date(startsAt).getTime() - now) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `in ${h}h${m ? ` ${m}m` : ''}` : `in ${m}m`;
}

/**
 * Your next plan, when it's live or within 3 hours: hosting (with Manage) or going (with
 * Directions). Hidden the rest of the time, so Discover stays about discovering.
 */
const UpNextBar: React.FC<{
  node: DiscoveryNode;
  role: PlanRole;
  live: boolean;
  now: number;
  onOpen: () => void;
  onManage: () => void;
  /** Card width when several are side by side (the next one peeks in). */
  width?: number;
}> = ({ node, role, live, now, onOpen, onManage, width }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const hosting = role === 'hosting';
  const when = live ? 'Live now' : `Starts ${startsIn(node.startsAt, now)}`;
  const detail = hosting ? `${node.attendeeCount ?? 0} going` : node.venue;
  const directions = async () => {
    const label = encodeURIComponent(node.venue || node.title);
    const url =
      Platform.OS === 'ios'
        ? `maps://?q=${label}&ll=${node.latitude},${node.longitude}`
        : `geo:${node.latitude},${node.longitude}?q=${node.latitude},${node.longitude}(${label})`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Couldn’t open your maps app.');
    }
  };
  return (
    <View style={[styles.upNext, live && styles.upNextLive, width ? { width, marginTop: 0 } : null]} testID="discover-up-next">
      <TouchableOpacity style={styles.upNextMain} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${hosting ? 'Hosting' : 'Going'}: ${node.title}, ${when}`}>
        <View style={[styles.upNextIcon, live && styles.upNextIconLive]}>
          <CalendarCheck size={18} color={live ? c.green : c.accent} strokeWidth={2.25} />
        </View>
        <View style={styles.eventCopy}>
          <Text style={[styles.upNextKicker, live && styles.upNextKickerLive]}>
            UP NEXT · {hosting ? 'HOSTING' : 'GOING'}
          </Text>
          <Text style={styles.upNextTitle} numberOfLines={1}>
            {node.title}
          </Text>
          <Text style={styles.eventMeta} numberOfLines={1}>
            {[when, detail].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </TouchableOpacity>
      <View style={styles.upNextActions}>
        <TouchableOpacity
          style={styles.upNextBtn}
          onPress={hosting ? onManage : () => void directions()}
          accessibilityRole="button"
          testID="discover-up-next-action"
        >
          <Text style={styles.upNextBtnText}>{hosting ? 'Manage' : 'Directions'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

/**
 * Your plans that are close, as cards you swipe through: one card each, the next one peeking in
 * from the right, and dots for where you are. A single plan is one full-width card.
 */
const UpNextCards: React.FC<{
  plans: Array<{ node: DiscoveryNode; role: PlanRole; live: boolean }>;
  now: number;
  onOpenPoint: (id: string) => void;
  onManagePoint: (id: string) => void;
}> = ({ plans, now, onOpenPoint, onManagePoint }) => {
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const card = (plan: (typeof plans)[number], cardWidth?: number) => (
    <UpNextBar
      key={plan.node.id}
      node={plan.node}
      role={plan.role}
      live={plan.live}
      now={now}
      width={cardWidth}
      onOpen={() => onOpenPoint(plan.node.id)}
      onManage={() => onManagePoint(plan.node.id)}
    />
  );
  if (plans.length === 1) return card(plans[0]);
  // Content is 16 in from each side; leave 28 so the next card shows behind this one.
  const gap = 10;
  const cardWidth = width - 32 - 28;
  return (
    <View style={styles.upNextStack} testID="discover-up-next-cards">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + gap}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={{ gap, paddingRight: 28 }}
        onScroll={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / (cardWidth + gap)))}
        scrollEventThrottle={32}
        accessibilityLabel={`Your next ${plans.length} plans. Swipe for more`}
      >
        {plans.map((plan) => card(plan, cardWidth))}
      </ScrollView>
      <View style={styles.upNextDots} accessibilityElementsHidden>
        {plans.map((plan, i) => (
          <View key={plan.node.id} style={[styles.upNextDot, i === Math.min(page, plans.length - 1) && styles.upNextDotOn]} />
        ))}
      </View>
    </View>
  );
};

/** "Why am I seeing this?" for a Boosted Point, with Hide. */
function showBoostInfo(node: DiscoveryNode, matchesYourTags: boolean) {
  const host = node.host ? node.host : 'The host';
  Alert.alert(
    'Why am I seeing this?',
    `${host} paid to Boost this Point, so it's shown in a labeled spot. It's happening within your area and range` +
      `${matchesYourTags ? ' and matches your #tags' : ''}. Boosts never change how posts, channels or Signal are ranked.`,
    [
      { text: 'Hide this Boost', style: 'destructive', onPress: () => hideBoost(node.id) },
      { text: 'OK', style: 'cancel' },
    ],
  );
}

/** Gold "BOOSTED" label; tap for why. */
const BoostedLabel: React.FC<{ onWhy?: () => void }> = ({ onWhy }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity
      style={styles.boostedLabel}
      onPress={onWhy}
      disabled={!onWhy}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Boosted. Why am I seeing this?"
      testID="discover-boosted-why"
    >
      <Zap size={10} color={c.amber} fill={c.amber} strokeWidth={2.5} />
      <Text style={styles.boostedText}>BOOSTED</Text>
      {onWhy ? <Info size={11} color={c.amber} strokeWidth={2.5} /> : null}
    </TouchableOpacity>
  );
};

/** A business with something on today: venue, what's on, when. */
const SpotCard: React.FC<{
  node: DiscoveryNode;
  boosted: boolean;
  live: boolean;
  onOpen: () => void;
  onWhyBoosted: () => void;
}> = ({ node, boosted, live, onOpen, onWhyBoosted }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const when = live ? 'LIVE NOW' : node.startsAt ? timeLabel(node.startsAt) : node.status;
  return (
    <TouchableOpacity
      style={[styles.spotCard, boosted && styles.spotCardBoosted]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${node.venue}: ${node.title}, ${when}${boosted ? '. Boosted' : ''}`}
      testID={`discover-spot-${node.id}`}
    >
      {node.coverPhotoUri ? (
        <Image source={{ uri: node.coverPhotoUri }} style={styles.spotPhoto} resizeMode="cover" />
      ) : (
        <View style={[styles.spotPhoto, styles.spotPhotoEmpty]}>
          <Store size={26} color={c.textFaint} strokeWidth={2} />
        </View>
      )}
      <View style={styles.spotBody}>
        {boosted ? <BoostedLabel onWhy={onWhyBoosted} /> : null}
        <Text style={styles.spotVenue} numberOfLines={1}>
          {node.venue}
        </Text>
        <Text style={styles.spotTitle} numberOfLines={2}>
          {node.title}
        </Text>
        <View style={[styles.whenChip, live && styles.whenChipLive]}>
          {live ? <View style={styles.liveDot} /> : null}
          <Text style={[styles.whenText, live && styles.whenTextLive]}>{when}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

/** A Point on Discover: the shared card (same as the Explore Map list). */
const EventRow: React.FC<{
  node: DiscoveryNode;
  /** Kept for callers; the card shows "Starts in …" or the start time on its own. */
  showTime?: boolean;
  /** Distance to show instead of the distance from you (search: from the searched area). */
  distanceMeters?: number | null;
  onOpen: () => void;
  onToggleRsvp: () => void;
  /** Paid Boost: labeled, with "Why am I seeing this?". */
  boosted?: boolean;
  onWhyBoosted?: () => void;
}> = ({ node, distanceMeters, onOpen, onToggleRsvp, boosted = false, onWhyBoosted }) => (
  <PointCard
    node={node}
    distanceMeters={distanceMeters}
    boosted={boosted}
    onWhyBoosted={onWhyBoosted}
    onOpen={onOpen}
    onToggleRsvp={onToggleRsvp}
    testID={`discover-event-${node.id}`}
  />
);

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
    whenChipQuiet: { backgroundColor: c.surface, borderColor: c.border },
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
    interestRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 12,
      backgroundColor: c.violetTint,
    },
    interestText: { flex: 1, color: c.violetText, fontSize: 13, fontWeight: '700' },
    placeResultIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.violetTint,
    },
    postResult: {
      gap: 4,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    postResultBody: { color: c.textBody, fontSize: 14, lineHeight: 19 },
    postResultKind: { color: c.violetText, fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
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
    eventRowBoosted: { borderColor: c.amberBorder },
    upNext: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 14,
      padding: 12,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: c.accent,
      backgroundColor: c.accentTint,
    },
    upNextLive: { borderColor: c.green, backgroundColor: c.greenTint },
    upNextMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    upNextIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    upNextIconLive: { borderWidth: 1, borderColor: c.green },
    upNextKicker: { color: c.accent, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 },
    upNextKickerLive: { color: c.green },
    upNextTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
    upNextActions: { alignItems: 'flex-end', gap: 6 },
    upNextBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    upNextBtnText: { color: c.text, fontSize: 12, fontWeight: '800' },
    upNextStack: { marginTop: 14 },
    upNextDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
    upNextDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.borderStrong },
    upNextDotOn: { width: 16, backgroundColor: c.accent },
    eventTagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    boostedLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: c.amberTint,
      borderWidth: 1,
      borderColor: c.amberBorder,
    },
    boostedText: { color: c.amber, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.6 },
    spotCard: {
      width: 176,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    spotCardBoosted: { borderColor: c.amber },
    spotPhoto: { width: '100%', height: 92 },
    spotPhotoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceDim },
    spotBody: { padding: 10, gap: 4 },
    spotVenue: { color: c.textMuted, fontSize: 12, fontWeight: '800' },
    spotTitle: { color: c.text, fontSize: 14, fontWeight: '800', lineHeight: 18 },
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
