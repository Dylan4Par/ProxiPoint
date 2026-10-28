import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CampaignsView } from '../components/campaigns/CampaignsView';
import type { CampaignBuilderProps } from '../components/campaigns/CampaignBuilder';
import type { DroppedPoint } from '../lib/droppedPoint';
import { BadgeCheck, Bell, Flame, Newspaper, Check, ChevronLeft, ChevronRight, CornerDownRight, Flag, Heart, ImagePlus, Lock, SmilePlus, Sparkles, MapPin, MessageCircle, Plus, Search, Send, ShieldCheck, Users, X } from 'lucide-react-native';
import { PhotoRulesNote } from '../components/safety/PhotoRulesNote';
import { ReportSheet, type ReportTarget } from '../components/safety/ReportSheet';
import { pickRecapPhotos } from '../lib/profilePhotos';
import { CategoryBadge } from '../components/discovery/CategoryBadge';
import { CHANNEL_CATEGORIES, channelInCategory, type ChannelCategory } from '../lib/channelCategories';
import { suggestChannels } from '../lib/channelSuggest';
import { ActivityScreen } from './ActivityScreen';
import { timeAgo } from '../lib/activity';
import { useBoosts } from '../lib/boost';
import {
  addComment,
  POST_PHOTO_LIMIT,
  addPost,
  answerHeadsUp,
  canSeePoint,
  approveRequest,
  claimChannel,
  declineRequest,
  removeApproved,
  setAccess,
  setFollowed,
  setRequested,
  toggleMembership,
  reactToPost,
  setChannelReplies,
  toggleCommentLike,
  useChannels,
  useVisibleComments,
  useVisiblePosts,
  type Channel,
  type ChannelPost,
  type PostComment,
} from '../lib/channels';
import {
  POST_SORTS,
  buildThreads,
  countComments,
  isPinLive,
  pinTimeLeft,
  postDistance,
  sortPosts,
  type LatLon,
  type PostSort,
} from '../lib/postRanking';
import { channelNodes, formatCount, formatDistance, splitFeed } from '../lib/discoverFeed';
import { useUnits } from '../lib/units';
import { isLiveNode } from '../lib/liveStatus';
import { isNodeAllowed, useModeration } from '../lib/moderation';
import { useDiscoveryStore, type DiscoveryNode } from '../stores/useDiscoveryStore';
import { deckPicks, type RecNode } from '../lib/recommend';
import { RecommendationDeck } from '../components/activity/RecommendationDeck';
import { StrongestSignalCard } from '../components/profile/Signal';
import { strongestSignals } from '../lib/signalScore';
import {
  CHANNEL_ACCESS,
  MEMBERSHIP_LABEL,
  accessOf,
  canCommentIn,
  canPostIn,
  canViewChannel,
  membershipAction,
} from '../lib/channelAccess';
import { ACCESS_ICON, CreateChannelSheet } from '../components/channels/CreateChannelSheet';
import { PLACE_ICON, PlacePicker, placeMeta, usePlaceIndex } from '../components/channels/PlacePicker';
import { PLACE_KIND_LABEL, bestTips, placeRef, pointsAtPlace, postsAtPlace, type LocalPlace } from '../lib/localPlaces';
import { interestLine, topInterest, useInterestMembers } from '../lib/nearbyInterest';
import {
  CHANNEL_REPLY_OPTIONS,
  QUICK_REACTIONS,
  REACTION_GROUPS,
  channelAllowsReplies,
  defaultRepliesOn,
  repliesAllowed,
  topEmojis,
} from '../lib/postReactions';
import { POST_KINDS, asksStillHappening, defaultPinHours, kindInfo, pinChoices, type PostKind } from '../lib/postKinds';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme/ThemeContext';

export type ChannelsSegment = 'feed' | 'alerts' | 'manage' | 'campaigns';

interface ChannelsScreenProps {
  segment: ChannelsSegment;
  onChangeSegment: (segment: ChannelsSegment) => void;
  /** Channel page that's open, or null for the segment views. */
  channelId: string | null;
  onOpenChannel: (id: string | null) => void;
  /** Your handle, used as the author of new posts. */
  myHandle: string;
  /** Unread #tag alerts (the dot on the bell). */
  unreadAlerts: number;
  /** Bell in the header: Profile → Notifications & Proximity Alerts. */
  onOpenAlerts?: () => void;
  interestTags: string[];
  /** Show the Point on Explore Map with its details open. */
  onOpenPoint: (id: string) => void;
  onToggleRsvp: (id: string) => void;
  /** Go to Profile to add #tags. */
  onEditTags: () => void;
  /** Explore Map filtered to this #tag. */
  onOpenTag: (tag: string) => void;
  /** Post page (comments) that's open, or null. Opens over a channel page or the segment views. */
  postId: string | null;
  onOpenPost: (id: string | null) => void;
  /** Where you are (or your home city): the Near sort and "pin near me" use it. */
  myLocation: LatLon;
  /** Explore Map, slid to where this post is pinned. */
  onShowPostOnMap: (post: ChannelPost) => void;
  /** Search button: the Discover search, ready to type. */
  onOpenSearch: () => void;
  /** Someone's @handle on a post or comment: their profile (yours goes to the Profile tab). */
  onOpenProfile: (handle: string) => void;
  /** Place page that's open (all conversations about a park, venue, trail…), or null. */
  placeId: string | null;
  onOpenPlace: (id: string | null) => void;
  /** Explore Map, slid to this spot. */
  onShowSpotOnMap: (spot: LatLon) => void;
  /** Campaigns: your Points, turning new campaign events into Points, the announcement, and Manage. */
  myDrops: DroppedPoint[];
  onCreateCampaignPoints: CampaignBuilderProps['onCreatePoints'];
  onAnnounceCampaign: CampaignBuilderProps['onAnnounce'];
  /** The bottom bar's + → Series: open a new series on the Series tab. */
  newSeriesRequest?: number | null;
  onNewSeriesHandled?: () => void;
  onManagePoint: (id: string) => void;
}

/** Points listed on a channel page (a city channel can have many). */
const MAX_CHANNEL_POINTS = 8;
/** " · Unclaimed" / " · Private" after the member count. */
const channelStatus = (channel: Channel) => {
  if (channel.auto && !channel.owner) return ' · Unclaimed';
  const access = accessOf(channel);
  return access === 'public' ? '' : ` · ${access === 'private' ? 'Private' : 'Restricted'}`;
};

/** "2h", "3 days", "Not on map". */
const pinLabel = (hours: number) => (hours === 0 ? 'Not on map' : hours >= 48 ? `${hours / 24} days` : `${hours}h`);

/** Heads-up amber, question cyan, tip green. */
const kindBadgeStyle = (kind: PostKind, c: ThemeColors) =>
  kind === 'heads_up'
    ? { borderColor: c.amber, backgroundColor: c.amberTint }
    : kind === 'question'
      ? { borderColor: c.accent, backgroundColor: c.accentTint }
      : { borderColor: c.green, backgroundColor: c.greenTint };

/** Short label for the report sheet: the start of the text. */
const snippet = (text: string) => (text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text);
const sameHandle = (a: string, b: string) => a.replace(/^@+/, '').toLowerCase() === b.replace(/^@+/, '').toLowerCase();

const SEGMENTS: Array<{ id: ChannelsSegment; label: string }> = [
  // Alerts and Series live on the Profile tab (View alerts, Manage My Series).
  { id: 'feed', label: 'Feed' },
  { id: 'manage', label: 'My Channels' },
];

/**
 * Channels tab: groups you're in, like subreddits for your local scene.
 * - Feed: newest posts from every channel you've joined.
 * - Alerts: new Points and Boosts that match your #tags (what used to be the Activity tab).
 * - My Channels: join and leave channels.
 * Tapping a channel opens its page: its Points, its posts, and a box to post.
 */
export const ChannelsScreen: React.FC<ChannelsScreenProps> = (props) => {
  const { segment, onChangeSegment, channelId, onOpenChannel, unreadAlerts, postId, onOpenPost, placeId, onOpenPlace } = props;
  const styles = useThemedStyles(createStyles);
  useUnits(); // re-render when Settings switches km / miles
  const { colors: c } = useTheme();
  const channels = useChannels();
  const posts = useVisiblePosts();
  const open = channelId ? channels.find((channel) => channel.id === channelId) ?? null : null;
  const joinedCount = channels.filter((channel) => channel.joined).length;
  const openPost = postId ? posts.find((post) => post.id === postId) ?? null : null;

  // Android back: post page → whatever it was opened from; place page → the same; channel page → the list.
  useEffect(() => {
    if (!postId && !channelId && !placeId) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (postId) onOpenPost(null);
      else if (placeId) onOpenPlace(null);
      else onOpenChannel(null);
      return true;
    });
    return () => sub.remove();
  }, [postId, channelId, placeId, onOpenChannel, onOpenPost, onOpenPlace]);

  // The open post was reported (or its author blocked): close its page.
  useEffect(() => {
    if (postId && !openPost) onOpenPost(null);
  }, [postId, openPost, onOpenPost]);

  if (openPost) {
    return (
      <PostPage
        {...props}
        post={openPost}
        channel={channels.find((channel) => channel.id === openPost.channelId) ?? null}
      />
    );
  }
  if (placeId) return <PlacePage {...props} placeId={placeId} />;
  if (open) return <ChannelPage {...props} channel={open} />;

  return (
    <View style={styles.container} testID="channels-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Channels</Text>
        <View style={styles.headerActions}>
          {/* Same search as Discover (#tags, c/channels, events). */}
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={props.onOpenSearch}
            accessibilityRole="button"
            accessibilityLabel="Search channels, #tags and events"
            testID="channels-search"
          >
            <Search size={18} color={c.accent} strokeWidth={2.5} />
            <Text style={styles.searchBtnText}>Search</Text>
          </TouchableOpacity>
          {/* Bell: Notifications & Proximity Alerts (on Profile); the dot means unread alerts. */}
          {props.onOpenAlerts ? (
            <TouchableOpacity
              style={styles.bellBtn}
              onPress={props.onOpenAlerts}
              accessibilityRole="button"
              accessibilityLabel={unreadAlerts > 0 ? `Notifications, ${unreadAlerts} unread` : 'Notifications'}
              testID="channels-alerts"
            >
              <Bell size={18} color={c.text} strokeWidth={2.25} />
              {unreadAlerts > 0 ? <View style={styles.bellDot} /> : null}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {/* Feed | My Channels: one bar split in two, the open one filled in. */}
      <View style={styles.segmentBar} accessibilityRole="tablist">
        {SEGMENTS.map(({ id, label }) => {
          const active = segment === id;
          const Icon = id === 'feed' ? Newspaper : Users;
          const count = id === 'manage' ? joinedCount : 0;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.segmentHalf, active && styles.segmentHalfActive]}
              onPress={() => onChangeSegment(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={count ? `${label}, ${count} joined` : label}
              testID={`channels-segment-${id}`}
            >
              <Icon size={15} color={active ? c.onAccent : c.textMuted} strokeWidth={2.25} />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
              {count ? (
                <View style={[styles.segmentCount, active && styles.segmentCountActive]}>
                  <Text style={[styles.segmentCountText, active && styles.segmentCountTextActive]}>{count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {segment === 'feed' ? <FeedView {...props} channels={channels} /> : null}
      {segment === 'alerts' ? (
        <ActivityScreen
          embedded
          interestTags={props.interestTags}
          onOpenPoint={props.onOpenPoint}
          onEditTags={props.onEditTags}
          onToggleRsvp={props.onToggleRsvp}
          onOpenTag={props.onOpenTag}
        />
      ) : null}
      {segment === 'manage' ? (
        <ManageView channels={channels} onOpenChannel={onOpenChannel} myHandle={props.myHandle} myTags={props.interestTags} />
      ) : null}
      {segment === 'campaigns' ? (
        <CampaignsView
          drops={props.myDrops}
          onCreatePoints={props.onCreateCampaignPoints}
          onAnnounce={props.onAnnounceCampaign}
          onOpenPoint={props.onManagePoint}
          newRequest={props.newSeriesRequest}
          onNewHandled={props.onNewSeriesHandled}
        />
      ) : null}
    </View>
  );
};

// ---- Feed ------------------------------------------------------------------------------------

/**
 * Top of the Feed: RECOMMENDATIONS, the deck of Boosted (or most popular) Points nearby, your
 * #tags first. Moved here from Alerts.
 */
const FeedRecommendations: React.FC<Pick<ChannelsScreenProps, 'interestTags' | 'onOpenPoint' | 'onToggleRsvp'>> = ({
  interestTags,
  onOpenPoint,
  onToggleRsvp,
}) => {
  const styles = useThemedStyles(createStyles);
  const now = useBoosts();
  const moderation = useModeration();
  const units = useUnits(); // "316m away" or "0.2 mi away" on the cards
  const nodes = useDiscoveryStore((state) => state.nodes) as unknown as Record<string, RecNode>;
  const deck = useMemo(() => deckPicks(nodes, interestTags, now), [nodes, interestTags, now, moderation, units]);
  if (!deck.picks.length) return null;
  return (
    <View style={styles.recommendations} testID="feed-recommendations">
      <Text style={styles.sectionLabel}>RECOMMENDATIONS</Text>
      <RecommendationDeck picks={deck.picks} mode={deck.mode} onOpenPoint={onOpenPoint} onToggleRsvp={onToggleRsvp} />
    </View>
  );
};

const FeedView: React.FC<ChannelsScreenProps & { channels: Channel[] }> = ({
  channels,
  onOpenChannel,
  onChangeSegment,
  onOpenPost,
  onShowPostOnMap,
  myLocation,
  myHandle,
  onOpenProfile,
  onOpenPlace,
  interestTags,
  onOpenPoint,
  onToggleRsvp,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const recommendations = (
    <FeedRecommendations interestTags={interestTags} onOpenPoint={onOpenPoint} onToggleRsvp={onToggleRsvp} />
  );
  const posts = useVisiblePosts();
  const comments = useVisibleComments();
  const now = useBoosts();
  const [sort, setSort] = useState<PostSort>('new');
  const commentCounts = useMemo(() => countComments(comments), [comments]);
  const joined = channels.filter((channel) => channel.joined);
  const joinedIds = new Set(joined.map((channel) => channel.id));
  const feed = sortPosts(
    posts.filter((post) => joinedIds.has(post.channelId)),
    sort,
    { now, center: myLocation, commentCounts },
  );
  const byId = new Map(channels.map((channel) => [channel.id, channel]));

  if (!joined.length) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {recommendations}
      <View style={styles.empty} testID="channels-feed-empty">
        <View style={styles.emptyIcon}>
          <Users size={26} color={c.accent} strokeWidth={2} />
        </View>
        <Text style={styles.emptyTitle}>Join a channel</Text>
        <Text style={styles.emptyBody}>Channels are groups for your local scene. Posts from the ones you join show up here.</Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={() => onChangeSegment('manage')} accessibilityRole="button">
          <Text style={styles.emptyBtnText}>FIND CHANNELS</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="channels-feed">
      {/* Your channels, for jumping straight to one. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        {/* "+" first in the row: find more channels to join. */}
        <TouchableOpacity
          style={styles.channelChipAdd}
          onPress={() => onChangeSegment('manage')}
          accessibilityRole="button"
          accessibilityLabel="Find more channels"
          testID="channels-find-more"
        >
          <Plus size={18} color={c.accent} strokeWidth={2.5} />
        </TouchableOpacity>
        {joined.map((channel) => (
          <TouchableOpacity
            key={channel.id}
            style={styles.channelChip}
            onPress={() => onOpenChannel(channel.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${channel.name}`}
          >
            <CategoryBadge tag={channel.tags[0]} title={channel.name} size={22} />
            <Text style={styles.channelChipText} numberOfLines={1}>
              {channel.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {recommendations}

      <SortRow sort={sort} onChange={setSort} />

      {feed.length ? (
        <View style={styles.list}>
          {feed.map((post) => (
            <PostCard
              myHandle={myHandle}
              onOpenProfile={onOpenProfile}
              onOpenPlace={onOpenPlace}
              key={post.id}
              post={post}
              now={now}
              commentCount={commentCounts[post.id] ?? 0}
              distanceMeters={sort === 'near' ? postDistance(post, myLocation) : null}
              channel={byId.get(post.channelId) ?? null}
              onOpenChannel={() => onOpenChannel(post.channelId)}
              onOpen={() => onOpenPost(post.id)}
              onShowOnMap={() => onShowPostOnMap(post)}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>No posts yet in your channels.</Text>
      )}
    </ScrollView>
  );
};

// ---- Manage ----------------------------------------------------------------------------------

const ManageView: React.FC<{
  channels: Channel[];
  onOpenChannel: (id: string) => void;
  myHandle: string;
  /** Your followed #tags: For you matches channels to them. */
  myTags: string[];
}> = ({ channels, onOpenChannel, myHandle, myTags }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [creating, setCreating] = useState(false);
  const joined = channels.filter((channel) => channel.joined);
  const [category, setCategory] = useState<ChannelCategory>('all');
  const posts = useVisiblePosts();
  // For you (fits your #tags and channels) + Trending (busiest this week), inside the picked chip.
  const { forYou, trending } = useMemo(
    () =>
      suggestChannels(
        channels.filter((channel) => channel.joined || channelInCategory(channel.tags, category)),
        posts,
        myTags,
        Date.now(),
      ),
    [channels, posts, myTags, category],
  );
  const categoryLabel = CHANNEL_CATEGORIES.find((entry) => entry.id === category)?.label ?? '';
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="channels-manage">
      <TouchableOpacity
        style={styles.createChannelBtn}
        onPress={() => setCreating(true)}
        accessibilityRole="button"
        testID="channels-create"
      >
        <Plus size={16} color={c.violet} strokeWidth={2.5} />
        <Text style={styles.createChannelText}>Create a channel</Text>
      </TouchableOpacity>
      <CreateChannelSheet
        visible={creating}
        myHandle={myHandle}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          onOpenChannel(id);
        }}
      />
      <Text style={[styles.sectionLabel, styles.sectionSpaced]}>JOINED ({joined.length})</Text>
      {joined.length ? (
        <View style={styles.list}>
          {joined.map((channel) => (
            <ChannelRow key={channel.id} channel={channel} onOpen={() => onOpenChannel(channel.id)} />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>You haven’t joined any channels yet.</Text>
      )}
      {/* Narrow Find channels by kind (scrolls sideways when the chips don't all fit). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryRow}
        accessibilityRole="tablist"
        testID="channels-category-row"
      >
        {CHANNEL_CATEGORIES.map(({ id, label }) => {
          const active = category === id;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.categoryChip, active && styles.categoryChipActive]}
              onPress={() => setCategory(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              testID={`channels-category-${id}`}
            >
              <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {forYou.length ? (
        <>
          <View style={styles.findHeading}>
            <Sparkles size={13} color={c.violet} strokeWidth={2.5} />
            <Text style={[styles.sectionLabel, styles.findHeadingText]}>FOR YOU</Text>
          </View>
          <View style={styles.list}>
            {forYou.map(({ channel, reason }) => (
              <ChannelRow key={channel.id} channel={channel} reason={reason} reasonTone="forYou" onOpen={() => onOpenChannel(channel.id)} />
            ))}
          </View>
        </>
      ) : null}
      {trending.length ? (
        <>
          <View style={[styles.findHeading, forYou.length ? styles.sectionSpaced : null]}>
            <Flame size={13} color={c.orange} strokeWidth={2.5} />
            <Text style={[styles.sectionLabel, styles.findHeadingText]}>TRENDING</Text>
          </View>
          <View style={styles.list}>
            {trending.map(({ channel, reason }) => (
              <ChannelRow key={channel.id} channel={channel} reason={reason} reasonTone="trending" onOpen={() => onOpenChannel(channel.id)} />
            ))}
          </View>
        </>
      ) : null}
      {forYou.length || trending.length ? null : (
        <Text style={styles.emptyText}>
          {category === 'all' ? 'You’re in every channel around here.' : `No ${categoryLabel} channels to join yet.`}
        </Text>
      )}
    </ScrollView>
  );
};

const ChannelRow: React.FC<{
  channel: Channel;
  onOpen: () => void;
  /** Find channels: why it's suggested ("Because you follow #Hiking", "4 posts this week"). */
  reason?: string;
  reasonTone?: 'forYou' | 'trending';
}> = ({ channel, onOpen, reason, reasonTone = 'trending' }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open ${channel.name}`}
      testID={`channel-row-${channel.id}`}
    >
      <CategoryBadge tag={channel.tags[0]} title={channel.name} size={36} />
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {channel.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {channel.handle} · {formatCount(channel.memberCount)} members{channelStatus(channel)}
        </Text>
        {reason ? (
          <Text style={[styles.rowReason, reasonTone === 'forYou' ? styles.rowReasonForYou : styles.rowReasonTrending]} numberOfLines={1}>
            {reason}
          </Text>
        ) : null}
      </View>
      <JoinButton channel={channel} />
    </TouchableOpacity>
  );
};

/** Join / leave; on a private channel, request to join (tap again to take it back). */
const JoinButton: React.FC<{ channel: Channel; large?: boolean }> = ({ channel, large = false }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const action = membershipAction(channel);
  const settled = action === 'leave' || action === 'moderator' || action === 'requested';
  const a11y = {
    moderator: `You moderate ${channel.name}`,
    leave: `Leave ${channel.name}`,
    join: `Join ${channel.name}`,
    request: `Request to join ${channel.name}`,
    requested: `Join request sent. Tap to cancel`,
  }[action];
  return (
    <TouchableOpacity
      style={[styles.joinBtn, large && styles.joinBtnLarge, settled && styles.joinBtnJoined]}
      onPress={() => toggleMembership(channel.id)}
      disabled={action === 'moderator'}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      testID={`channel-join-${channel.id}`}
    >
      {action === 'leave' || action === 'moderator' ? <Check size={13} color={c.accent} strokeWidth={3} /> : null}
      {action === 'request' ? <Lock size={12} color={c.base} strokeWidth={2.75} /> : null}
      <Text style={[styles.joinText, settled && styles.joinTextJoined]}>{MEMBERSHIP_LABEL[action]}</Text>
    </TouchableOpacity>
  );
};

/** Follow: puts the channel's pinned posts on your map (violet, like the map's post bubbles). */
const FollowButton: React.FC<{ channel: Channel }> = ({ channel }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const on = Boolean(channel.followed);
  return (
    <TouchableOpacity
      style={[styles.followBtn, on && styles.followBtnOn]}
      onPress={() => setFollowed(channel.id, !on)}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? `Unfollow ${channel.name}` : `Follow ${channel.name}`}
      testID={`channel-follow-${channel.id}`}
    >
      {on ? <Check size={13} color={c.white} strokeWidth={3} /> : <MapPin size={13} color={c.violet} strokeWidth={2.5} />}
      <Text style={[styles.followText, on && styles.followTextOn]}>{on ? 'FOLLOWING' : 'FOLLOW'}</Text>
    </TouchableOpacity>
  );
};

// ---- Channel page ----------------------------------------------------------------------------

const ChannelPage: React.FC<ChannelsScreenProps & { channel: Channel }> = ({
  channel,
  onOpenChannel,
  onOpenPoint,
  onOpenPost,
  onShowPostOnMap,
  myHandle,
  onOpenProfile,
  myLocation,
  onOpenPlace,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const comments = useVisibleComments();
  const commentCounts = useMemo(() => countComments(comments), [comments]);
  const [sort, setSort] = useState<PostSort>('new');
  const allPosts = useVisiblePosts();
  const now = useBoosts();
  const posts = sortPosts(
    allPosts.filter((post) => post.channelId === channel.id),
    sort,
    { now, center: myLocation, commentCounts },
  );
  const nodes = useDiscoveryStore((state) => state.nodes) as unknown as Record<string, DiscoveryNode>;
  const moderation = useModeration();
  // Strongest Signal: who's contributed most here lately (upvotes, posts, comments).
  const strongest = useMemo(
    () => strongestSignals(allPosts, comments, { channelId: channel.id, now, limit: 3 }),
    [allPosts, comments, channel.id, now],
  );
  const points = useMemo(() => {
    const { nearby, upcoming } = splitFeed(nodes, now, (node) => isNodeAllowed(node) && canSeePoint(node));
    return channelNodes(channel, [...nearby, ...upcoming]) as DiscoveryNode[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, nodes, now, moderation]);
  const viewable = canViewChannel(channel);
  const canPost = canPostIn(channel);
  // "20+ people into #Pickleball within 5 km": its busiest #tag, counted privately (nearbyInterest.ts).
  const interestMembers = useInterestMembers();
  const nearbyInterest = useMemo(() => {
    const top = topInterest(interestMembers, channel.tags, myLocation);
    return top ? interestLine(top.count, top.tag) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interestMembers, channel.tags, myLocation.latitude, myLocation.longitude]);
  const access = accessOf(channel);
  const AccessIcon = ACCESS_ICON[access];
  const [draft, setDraft] = useState('');
  // What kind of post, and the place it's about. A post with a place stays on that place for
  // good; it's also on the map for a while (0 = not on the map).
  const [kind, setKind] = useState<PostKind>('chat');
  const [place, setPlace] = useState<LocalPlace | null>(null);
  const [pickingPlace, setPickingPlace] = useState(false);
  const [pinHours, setPinHours] = useState(defaultPinHours('chat'));
  const places = usePlaceIndex();
  // Allow replies: on by default for Questions and Chat, off for Heads-ups and Tips; the channel's
  // setting (moderator) can rule it out.
  const [repliesOn, setRepliesOn] = useState(defaultRepliesOn('chat'));
  const chooseKind = (next: PostKind) => {
    setKind(next);
    setPinHours(defaultPinHours(next));
    setRepliesOn(defaultRepliesOn(next));
  };
  const repliesPossible = channelAllowsReplies(kind, channel.replies);
  // Photos: same picker as recaps (photo rules first, multi-select, shrunk for upload).
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const addPhotos = async () => {
    if (photoBusy || photos.length >= POST_PHOTO_LIMIT) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const picked = await pickRecapPhotos(POST_PHOTO_LIMIT - photos.length);
      setPhotos((current) => [...current, ...picked].slice(0, POST_PHOTO_LIMIT));
    } catch {
      setPhotoError('Couldn’t load those photos. Try different ones.');
    } finally {
      setPhotoBusy(false);
    }
  };
  // A post needs text or at least one photo.
  const canSend = Boolean(draft.trim() || photos.length);
  // Only a place that's an event (a Point's venue) can put the post on the map, as a badge on it.
  const placePointId = place?.id.startsWith('venue-') ? place.id.slice('venue-'.length) : undefined;

  const post = () => {
    if (!canSend || !canPost) return;
    // Server side: upload the photos first, then POST the post with their URLs.
    addPost(
      channel.id,
      myHandle,
      draft,
      place ? { place: placeRef(place, placePointId), hours: placePointId ? pinHours : 0 } : null,
      photos,
      kind,
      repliesPossible && repliesOn,
    );
    setDraft('');
    setPlace(null);
    chooseKind('chat');
    setPhotos([]);
    setPhotoError('');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID={`channel-page-${channel.id}`}
    >
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => onOpenChannel(null)}
        accessibilityRole="button"
        accessibilityLabel="Back to Channels"
        testID="channel-back"
      >
        <ChevronLeft size={20} color={c.text} strokeWidth={2.5} />
        <Text style={styles.backText}>CHANNELS</Text>
      </TouchableOpacity>

      <View style={styles.pageHeader}>
        <CategoryBadge tag={channel.tags[0]} title={channel.name} size={52} />
        <View style={styles.rowCopy}>
          <Text style={styles.pageTitle}>{channel.name}</Text>
          <Text style={styles.rowMeta}>
            {channel.handle} · {formatCount(channel.memberCount)} members{channel.auto && !channel.owner ? ' · Unclaimed' : ''}
          </Text>
          <View style={styles.accessPill} testID="channel-access">
            <AccessIcon size={11} color={c.violetText} strokeWidth={2.5} />
            <Text style={styles.accessPillText}>{CHANNEL_ACCESS.find((option) => option.id === access)?.label}</Text>
          </View>
        </View>
      </View>
      {channel.description ? <Text style={styles.description}>{channel.description}</Text> : null}
      <View style={styles.tagRow}>
        {channel.tags.map((tag) => (
          <View key={tag} style={styles.tagPill}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
      {nearbyInterest ? (
        <View style={styles.interestRow} testID="channel-nearby-interest">
          <Users size={13} color={c.textMuted} strokeWidth={2.25} />
          <Text style={styles.interestText}>{nearbyInterest}</Text>
        </View>
      ) : null}
      {channel.auto && !channel.owner ? (
        // Started automatically: nobody moderates it yet. Claiming makes you its moderator.
        <View style={styles.claimBox} testID="channel-unclaimed">
          <View style={styles.claimHeader}>
            <Sparkles size={15} color={c.violet} strokeWidth={2.25} />
            <Text style={styles.claimTitle}>Unclaimed channel</Text>
          </View>
          <Text style={styles.claimBody}>
            This channel started on its own from what’s happening nearby. Claim it to set its rules and keep it tidy.
          </Text>
          <TouchableOpacity
            style={styles.claimBtn}
            onPress={() => claimChannel(channel.id, myHandle)}
            accessibilityRole="button"
            testID="channel-claim"
          >
            <Text style={styles.claimBtnText}>CLAIM CHANNEL</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {channel.owner ? (
        <View style={styles.ownerRow}>
          <BadgeCheck size={14} color={c.accent} strokeWidth={2.25} />
          <Text style={styles.ownerText}>
            {sameHandle(channel.owner, myHandle) ? 'You moderate this channel' : `Moderated by ${channel.owner}`}
          </Text>
        </View>
      ) : null}
      <View style={styles.membershipRow}>
        <JoinButton channel={channel} large />
        {viewable ? <FollowButton channel={channel} /> : null}
      </View>
      {viewable ? (
        <Text style={styles.followHint}>
          {channel.followed
            ? 'Its pinned posts show on your Explore Map.'
            : 'Follow to see its pinned posts on your Explore Map.'}
        </Text>
      ) : null}
      {channel.moderator ? <ModerationPanel channel={channel} onOpenProfile={onOpenProfile} /> : null}

      {!viewable ? (
        // Private and you're not approved: name and description only.
        <View style={styles.gateBox} testID="channel-private-gate">
          <View style={styles.claimHeader}>
            <Lock size={15} color={c.violet} strokeWidth={2.25} />
            <Text style={styles.claimTitle}>Private channel</Text>
          </View>
          <Text style={styles.claimBody}>
            {channel.requested
              ? 'Your request to join is waiting for the moderator. You’ll see its posts once you’re approved.'
              : 'Only approved members can see its posts, comments and Points. Request to join and the moderator will decide.'}
          </Text>
        </View>
      ) : (
      <>

      {strongest.length ? (
        <View style={styles.sectionSpaced}>
          <StrongestSignalCard
            ranks={strongest}
            scopeLabel={`${channel.handle} · 30 days`}
            onOpenProfile={onOpenProfile}
          />
        </View>
      ) : null}

      <Text style={[styles.sectionLabel, styles.sectionSpaced]}>
        {channel.tags.length ? 'POINTS IN THIS CHANNEL' : 'POINTS AROUND HERE'}
      </Text>
      {points.length ? (
        <View style={styles.list}>
          {points.slice(0, MAX_CHANNEL_POINTS).map((node) => {
            const live = isLiveNode(node);
            const distance = formatDistance(node.distanceMeters);
            return (
              <TouchableOpacity
                key={node.id}
                style={styles.row}
                onPress={() => onOpenPoint(node.id)}
                accessibilityRole="button"
                accessibilityLabel={`${node.title}, show on map`}
              >
                <CategoryBadge tag={node.tags?.[0] ?? node.tag} title={node.title} photoUri={node.coverPhotoUri} size={32} />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {node.title}
                  </Text>
                  <Text style={[styles.rowMeta, live && styles.liveMeta]} numberOfLines={1}>
                    {[live ? 'LIVE NOW' : node.status, distance].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <ChevronRight size={16} color={c.iconFaint} strokeWidth={2.25} />
              </TouchableOpacity>
            );
          })}
          {points.length > MAX_CHANNEL_POINTS ? (
            <Text style={styles.emptyText}>And {points.length - MAX_CHANNEL_POINTS} more on Explore Map.</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.emptyText}>Nothing scheduled with these #tags right now.</Text>
      )}

      <Text style={[styles.sectionLabel, styles.sectionSpaced]}>POSTS</Text>
      {canPost ? (
        <View style={styles.composer}>
          <View style={styles.kindRow} accessibilityRole="radiogroup">
            {POST_KINDS.map((info) => {
              const active = kind === info.id;
              return (
                <TouchableOpacity
                  key={info.id}
                  style={[styles.kindChip, active && styles.kindChipActive]}
                  onPress={() => chooseKind(info.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  testID={`post-kind-${info.id}`}
                >
                  <Text style={[styles.kindChipText, active && styles.kindChipTextActive]}>{info.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder={`${kindInfo(kind).prompt} ${channel.name}…`}
            placeholderTextColor={c.textFaint}
            multiline
            maxLength={500}
            accessibilityLabel={`Write a post in ${channel.name}`}
            testID="channel-composer"
          />
          {photos.length ? (
            <View style={styles.draftPhotos}>
              {photos.map((uri) => (
                <View key={uri} style={styles.draftPhoto}>
                  <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" />
                  <TouchableOpacity
                    style={styles.draftPhotoRemove}
                    onPress={() => setPhotos((current) => current.filter((item) => item !== uri))}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    hitSlop={8}
                  >
                    <X size={12} color="#ffffff" strokeWidth={3} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
          {photos.length ? <PhotoRulesNote /> : null}
          {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
          {place ? (
            <View style={styles.pinOptions}>
              <View style={styles.placeRow}>
                {React.createElement(PLACE_ICON[place.kind], { size: 14, color: c.violet, strokeWidth: 2.5 })}
                <TouchableOpacity
                  style={styles.rowCopy}
                  onPress={() => setPickingPlace(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`About ${place.name}. Change place`}
                >
                  <Text style={styles.placeRowText} numberOfLines={1}>
                    {place.name}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPlace(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove place">
                  <X size={15} color={c.textMuted} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
              {placePointId ? (
              <>
              <Text style={styles.pinOptionsLabel}>ON THE MAP FOR</Text>
              <View style={styles.pinChipRow}>
                {[...pinChoices(kind), 0].map((hours) => {
                  const active = pinHours === hours;
                  return (
                    <TouchableOpacity
                      key={hours}
                      style={[styles.pinChip, active && styles.pinChipActive]}
                      onPress={() => setPinHours(hours)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.pinChipText, active && styles.pinChipTextActive]}>{pinLabel(hours)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.pinNote}>
                Shows on this event on the map, and stays on {place.name}’s page after it leaves the map.
              </Text>
              </>
              ) : (
                <Text style={styles.pinNote}>
                  Shows on {place.kind === 'block' ? 'this block' : place.name}’s page. To put it on the map, pick an
                  event (a Point) so it shows on that event.
                </Text>
              )}
            </View>
          ) : null}
          <PlacePicker
            visible={pickingPlace}
            places={places}
            myLocation={myLocation}
            onClose={() => setPickingPlace(false)}
            onPick={(picked) => {
              setPlace(picked);
              setPickingPlace(false);
            }}
          />
          <TouchableOpacity
            style={styles.repliesToggle}
            onPress={() => setRepliesOn((on) => !on)}
            disabled={!repliesPossible}
            accessibilityRole="switch"
            accessibilityState={{ checked: repliesPossible && repliesOn, disabled: !repliesPossible }}
            testID="channel-allow-replies"
          >
            <View style={[styles.checkbox, repliesPossible && repliesOn && styles.checkboxOn]}>
              {repliesPossible && repliesOn ? <Check size={12} color={c.white} strokeWidth={3} /> : null}
            </View>
            <Text style={[styles.repliesToggleText, !repliesPossible && styles.repliesToggleOff]}>
              {repliesPossible
                ? 'Allow replies'
                : channel.replies === 'questions'
                  ? 'Replies are for Questions only in this channel'
                  : 'Replies are off in this channel'}
            </Text>
          </TouchableOpacity>
          <View style={styles.composerActions}>
            <TouchableOpacity
              style={[styles.photoBtn, photos.length >= POST_PHOTO_LIMIT && styles.postBtnDisabled]}
              onPress={() => void addPhotos()}
              disabled={photoBusy || photos.length >= POST_PHOTO_LIMIT}
              accessibilityRole="button"
              accessibilityLabel={`Add photos (${photos.length} of ${POST_PHOTO_LIMIT})`}
              testID="channel-add-photos"
            >
              <ImagePlus size={16} color={c.accent} strokeWidth={2.25} />
              {photos.length ? <Text style={styles.photoBtnText}>{photos.length}/{POST_PHOTO_LIMIT}</Text> : null}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pinToggle, place && styles.pinToggleOn]}
              onPress={() => setPickingPlace(true)}
              accessibilityRole="button"
              accessibilityLabel={place ? `About ${place.name}. Change place` : 'Add a place'}
              testID="channel-pin-toggle"
            >
              <MapPin size={14} color={place ? c.white : c.violet} strokeWidth={2.5} />
              <Text style={[styles.pinToggleText, place && styles.pinToggleTextOn]} numberOfLines={1}>
                {place ? (placePointId && pinHours ? `${pinLabel(pinHours)} on map` : 'Place only') : 'Add place'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.postBtn, !canSend && styles.postBtnDisabled]}
              onPress={post}
              disabled={!canSend}
              accessibilityRole="button"
              testID="channel-post"
            >
              <Text style={styles.postBtnText}>POST</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        // Restricted and you're not approved: read and comment, ask to post.
        <View style={styles.gateBox} testID="channel-restricted-gate">
          <View style={styles.claimHeader}>
            <ShieldCheck size={15} color={c.violet} strokeWidth={2.25} />
            <Text style={styles.claimTitle}>Approved posters only</Text>
          </View>
          <Text style={styles.claimBody}>
            {channel.requested
              ? 'Your request to post is waiting for the moderator. You can still comment on posts.'
              : 'Anyone can read and comment here, but the moderator approves who can post.'}
          </Text>
          <TouchableOpacity
            style={[styles.claimBtn, channel.requested && styles.gateBtnPending]}
            onPress={() => setRequested(channel.id, !channel.requested)}
            accessibilityRole="button"
            accessibilityLabel={channel.requested ? 'Cancel request to post' : 'Request to post'}
            testID="channel-request-post"
          >
            <Text style={[styles.claimBtnText, channel.requested && styles.gateBtnPendingText]}>
              {channel.requested ? 'REQUESTED · CANCEL' : 'REQUEST TO POST'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <SortRow sort={sort} onChange={setSort} />
      {posts.length ? (
        <View style={styles.list}>
          {posts.map((item) => (
            <PostCard
              myHandle={myHandle}
              onOpenProfile={onOpenProfile}
              onOpenPlace={onOpenPlace}
              key={item.id}
              post={item}
              now={now}
              commentCount={commentCounts[item.id] ?? 0}
              distanceMeters={sort === 'near' ? postDistance(item, myLocation) : null}
              channel={null}
              onOpen={() => onOpenPost(item.id)}
              onShowOnMap={() => onShowPostOnMap(item)}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>No posts yet. Start the conversation.</Text>
      )}
      </>
      )}
    </ScrollView>
  );
};

// ---- Place page --------------------------------------------------------------------------------

/**
 * A place's page: everything people have said about a park, venue, trail or street corner.
 * What's live there now, its best tips and answered questions (from the last year), Points
 * happening there, then every other conversation, newest first. Posts stay here after their map
 * pins expire, which is what makes a place worth opening months later.
 * Server side: GET /places/:id and GET /places/:id/posts?section=live|best|all.
 */
const PlacePage: React.FC<ChannelsScreenProps & { placeId: string }> = ({
  placeId,
  onOpenPlace,
  onOpenPost,
  onOpenChannel,
  onShowPostOnMap,
  onShowSpotOnMap,
  onOpenPoint,
  onOpenProfile,
  myHandle,
  myLocation,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const places = usePlaceIndex();
  const place = places.find((item) => item.id === placeId) ?? null;
  const channels = useChannels();
  const allPosts = useVisiblePosts();
  const comments = useVisibleComments();
  const commentCounts = useMemo(() => countComments(comments), [comments]);
  const now = useBoosts();
  const nodes = useDiscoveryStore((state) => state.nodes) as unknown as Record<string, DiscoveryNode>;
  const moderation = useModeration();
  const byId = new Map(channels.map((channel) => [channel.id, channel]));

  const here = useMemo(() => (place ? postsAtPlace(allPosts, place) : []), [allPosts, place]);
  const live = here.filter((post) => isPinLive(post, now));
  const best = bestTips(here.filter((post) => !isPinLive(post, now)), now);
  const shown = new Set([...live, ...best].map((post) => post.id));
  const rest = sortPosts(here.filter((post) => !shown.has(post.id)), 'new', { now, commentCounts });
  const points = useMemo(() => {
    if (!place) return [];
    const { nearby, upcoming } = splitFeed(nodes, now, (node) => isNodeAllowed(node) && canSeePoint(node));
    return pointsAtPlace([...nearby, ...upcoming] as DiscoveryNode[], place);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, nodes, now, moderation]);

  const card = (post: ChannelPost) => (
    <PostCard
      key={post.id}
      myHandle={myHandle}
      onOpenProfile={onOpenProfile}
      post={post}
      now={now}
      commentCount={commentCounts[post.id] ?? 0}
      channel={byId.get(post.channelId) ?? null}
      onOpenChannel={() => {
        onOpenPlace(null);
        onOpenChannel(post.channelId);
      }}
      onOpen={() => onOpenPost(post.id)}
      onShowOnMap={() => onShowPostOnMap(post)}
    />
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID={`place-page-${placeId}`}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => onOpenPlace(null)}
        accessibilityRole="button"
        accessibilityLabel="Back"
        testID="place-back"
      >
        <ChevronLeft size={20} color={c.text} strokeWidth={2.5} />
        <Text style={styles.backText}>BACK</Text>
      </TouchableOpacity>

      {!place ? (
        <Text style={styles.emptyText}>This place isn’t available.</Text>
      ) : (
        <>
          <View style={styles.pageHeader}>
            <View style={styles.placeIcon}>
              {React.createElement(PLACE_ICON[place.kind], { size: 24, color: c.violet, strokeWidth: 2.25 })}
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.pageTitle}>{place.name}</Text>
              <Text style={styles.rowMeta}>
                {[placeMeta(place, myLocation), place.area].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
          <Text style={styles.description}>
            {here.length
              ? `${here.length} ${here.length === 1 ? 'conversation' : 'conversations'} about this ${place.kind === 'block' ? 'block' : PLACE_KIND_LABEL[place.kind].toLowerCase()}.`
              : 'No conversations here yet. Post about it from any channel: tap Add place and pick it.'}
          </Text>
          <View style={styles.membershipRow}>
            <TouchableOpacity
              style={styles.followBtn}
              onPress={() => onShowSpotOnMap({ latitude: place.latitude, longitude: place.longitude })}
              accessibilityRole="button"
              testID="place-show-on-map"
            >
              <MapPin size={13} color={c.violet} strokeWidth={2.5} />
              <Text style={styles.followText}>SHOW ON MAP</Text>
            </TouchableOpacity>
          </View>

          {live.length ? (
            <>
              <Text style={[styles.sectionLabel, styles.sectionSpaced]}>ON THE MAP NOW</Text>
              <View style={styles.list}>{live.map(card)}</View>
            </>
          ) : null}

          {best.length ? (
            <>
              <Text style={[styles.sectionLabel, styles.sectionSpaced]}>BEST TIPS & ANSWERS</Text>
              <View style={styles.list}>{best.map(card)}</View>
            </>
          ) : null}

          {points.length ? (
            <>
              <Text style={[styles.sectionLabel, styles.sectionSpaced]}>POINTS HERE</Text>
              <View style={styles.list}>
                {points.map((node) => {
                  const isLive = isLiveNode(node);
                  return (
                    <TouchableOpacity
                      key={node.id}
                      style={styles.row}
                      onPress={() => onOpenPoint(node.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${node.title}, show on map`}
                    >
                      <CategoryBadge tag={node.tags?.[0] ?? node.tag} title={node.title} photoUri={node.coverPhotoUri} size={32} />
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {node.title}
                        </Text>
                        <Text style={[styles.rowMeta, isLive && styles.liveMeta]} numberOfLines={1}>
                          {isLive ? 'LIVE NOW' : node.status}
                        </Text>
                      </View>
                      <ChevronRight size={16} color={c.iconFaint} strokeWidth={2.25} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}

          {rest.length ? (
            <>
              <Text style={[styles.sectionLabel, styles.sectionSpaced]}>
                {live.length || best.length ? 'MORE CONVERSATIONS' : 'CONVERSATIONS'}
              </Text>
              <View style={styles.list}>{rest.map(card)}</View>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
};

// ---- Moderation ------------------------------------------------------------------------------

/**
 * Moderator tools on your own channel: who can view and post, requests waiting for approval,
 * and who's approved. Server side: PATCH /channels/:id, GET /channels/:id/requests, and the
 * approve / decline / remove routes in channels.ts.
 */
const ModerationPanel: React.FC<{ channel: Channel; onOpenProfile: (handle: string) => void }> = ({ channel, onOpenProfile }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const access = accessOf(channel);
  const requests = channel.requests ?? [];
  const approved = channel.approvedUsers ?? [];
  return (
    <View style={styles.modBox} testID="channel-moderation">
      <View style={styles.claimHeader}>
        <ShieldCheck size={15} color={c.violet} strokeWidth={2.25} />
        <Text style={styles.claimTitle}>Moderation</Text>
      </View>

      <Text style={styles.modLabel}>WHO CAN VIEW AND POST</Text>
      <View style={styles.pinChipRow}>
        {CHANNEL_ACCESS.map((option) => {
          const active = option.id === access;
          const Icon = ACCESS_ICON[option.id];
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.pinChip, styles.modChip, active && styles.pinChipActive]}
              onPress={() => {
                if (option.id === access) return;
                // Opening up a private channel shows its history to everyone: confirm first.
                if (access === 'private') {
                  Alert.alert(
                    `Make ${channel.name} ${option.label.toLowerCase()}?`,
                    'Everything posted here so far becomes visible to anyone.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: `Make ${option.label.toLowerCase()}`, onPress: () => setAccess(channel.id, option.id) },
                    ],
                  );
                  return;
                }
                setAccess(channel.id, option.id);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              testID={`channel-set-access-${option.id}`}
            >
              <Icon size={12} color={active ? c.white : c.violet} strokeWidth={2.5} />
              <Text style={[styles.pinChipText, active && styles.pinChipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.modHint}>{CHANNEL_ACCESS.find((option) => option.id === access)?.summary}</Text>

      <Text style={styles.modLabel}>REPLIES</Text>
      <View style={styles.pinChipRow}>
        {CHANNEL_REPLY_OPTIONS.map((option) => {
          const active = (channel.replies ?? 'on') === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.pinChip, active && styles.pinChipActive]}
              onPress={() => setChannelReplies(channel.id, option.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              testID={`channel-replies-${option.id}`}
            >
              <Text style={[styles.pinChipText, active && styles.pinChipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.modHint}>{CHANNEL_REPLY_OPTIONS.find((o) => o.id === (channel.replies ?? 'on'))?.summary}</Text>

      {access !== 'public' || requests.length ? (
        <>
          <Text style={styles.modLabel}>
            REQUESTS{requests.length ? ` · ${requests.length}` : ''}
          </Text>
          {requests.length ? (
            requests.map((request) => (
              <View key={request.handle} style={styles.modRow}>
                <TouchableOpacity style={styles.rowCopy} onPress={() => onOpenProfile(request.handle)} accessibilityRole="link">
                  <Text style={styles.modHandle}>{request.handle}</Text>
                  <Text style={styles.modMeta} numberOfLines={1}>
                    {[access === 'private' ? 'Wants to join' : 'Wants to post', timeAgo(request.at), request.note]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modApprove}
                  onPress={() => approveRequest(channel.id, request.handle)}
                  accessibilityRole="button"
                  accessibilityLabel={`Approve ${request.handle}`}
                  testID={`channel-approve-${request.handle}`}
                >
                  <Check size={15} color={c.white} strokeWidth={3} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modDecline}
                  onPress={() => declineRequest(channel.id, request.handle)}
                  accessibilityRole="button"
                  accessibilityLabel={`Decline ${request.handle}`}
                >
                  <X size={15} color={c.textMuted} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={styles.modHint}>No requests waiting.</Text>
          )}

          <Text style={styles.modLabel}>
            {access === 'private' ? 'APPROVED MEMBERS' : 'APPROVED POSTERS'}
            {approved.length ? ` · ${approved.length}` : ''}
          </Text>
          {approved.length ? (
            <View style={styles.pinChipRow}>
              {approved.map((handle) => (
                <TouchableOpacity
                  key={handle}
                  style={[styles.pinChip, styles.modChip]}
                  onPress={() => removeApproved(channel.id, handle)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove approval for ${handle}`}
                >
                  <Text style={styles.pinChipText}>{handle}</Text>
                  <X size={12} color={c.violet} strokeWidth={2.5} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={styles.modHint}>Just you so far.</Text>
          )}
        </>
      ) : null}
    </View>
  );
};

// ---- Sort pills ------------------------------------------------------------------------------

const SortRow: React.FC<{ sort: PostSort; onChange: (sort: PostSort) => void }> = ({ sort, onChange }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.sortRow} accessibilityRole="tablist">
      {POST_SORTS.map(({ id, label }) => {
        const active = sort === id;
        return (
          <TouchableOpacity
            key={id}
            style={[styles.sortPill, active && styles.sortPillActive]}
            onPress={() => onChange(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            testID={`posts-sort-${id}`}
          >
            <Text style={[styles.sortText, active && styles.sortTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// ---- Post card -------------------------------------------------------------------------------

const PostCard: React.FC<{
  post: ChannelPost;
  now: number;
  commentCount: number;
  /** Shown in the Near sort. */
  distanceMeters?: number | null;
  /** Show which channel it's from (combined feed). Null inside a channel page. */
  channel: Channel | null;
  onOpenChannel?: () => void;
  /** Opens the post page with its comments. Left out on the post page itself. */
  onOpen?: () => void;
  onShowOnMap?: () => void;
  /** You: your own posts get no Report button. */
  myHandle: string;
  onOpenProfile: (handle: string) => void;
  /** The place it's about: its page. Left out on that place's own page. */
  onOpenPlace?: (placeId: string) => void;
}> = ({ post, now, commentCount, distanceMeters = null, channel, onOpenChannel, onOpen, onShowOnMap, myHandle, onOpenProfile, onOpenPlace }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const mine = sameHandle(post.author, myHandle);
  const postChannel = useChannels().find((item) => item.id === post.channelId);
  const canReply = repliesAllowed(post, postChannel?.replies);
  const pinLeft = pinTimeLeft(post, now);
  const distance = formatDistance(distanceMeters ?? undefined);
  return (
    <View style={styles.post} testID={`post-${post.id}`}>
      <View style={styles.postHeader}>
        {channel ? (
          <TouchableOpacity onPress={onOpenChannel} accessibilityRole="button" style={styles.postChannel}>
            <CategoryBadge tag={channel.tags[0]} title={channel.name} size={20} />
            <Text style={styles.postChannelText} numberOfLines={1}>
              {channel.handle}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() => onOpenProfile(post.author)}
          accessibilityRole="link"
          accessibilityLabel={`${post.author}'s profile`}
          hitSlop={6}
          style={styles.authorLink}
          testID={`post-author-${post.id}`}
        >
          <Text style={styles.authorText} numberOfLines={1}>
            {post.author}
          </Text>
        </TouchableOpacity>
        <Text style={styles.postMeta} numberOfLines={1}>
          · {timeAgo(post.createdAt, now)}
          {distance ? ` · ${distance}` : ''}
        </Text>
        {post.kind && post.kind !== 'chat' ? (
          <View style={[styles.kindBadge, kindBadgeStyle(post.kind, c)]} testID={`post-kind-badge-${post.id}`}>
            <Text style={[styles.kindBadgeText, { color: kindBadgeStyle(post.kind, c).borderColor }]}>
              {kindInfo(post.kind).label.toUpperCase()}
            </Text>
          </View>
        ) : null}
        {mine ? null : (
          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() =>
              setReporting({ type: 'post', id: post.id, label: snippet(post.body), ownerHandle: post.author })
            }
            accessibilityRole="button"
            accessibilityLabel="Report this post"
            hitSlop={10}
            testID={`post-report-${post.id}`}
          >
            <Flag size={14} color={c.textFaint} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>
      {/* Reported (or its author blocked): it disappears for you right away. */}
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
      {onOpen ? (
        <TouchableOpacity onPress={onOpen} accessibilityRole="button" accessibilityHint="Opens the comments">
          <Text style={styles.postBody}>{post.body}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.postBody}>{post.body}</Text>
      )}
      {post.photos?.length ? <PostPhotos uris={post.photos} /> : null}
      {post.place ? (
        <View style={styles.placeLine}>
          {/* The place: its page (all its conversations). */}
          {onOpenPlace && post.place.placeId ? (
            <TouchableOpacity
              style={styles.pinBadge}
              onPress={() => onOpenPlace(post.place?.placeId as string)}
              accessibilityRole="button"
              accessibilityLabel={`About ${post.place.label}. Open place`}
              testID={`post-place-${post.id}`}
            >
              {React.createElement(PLACE_ICON[post.place.placeKind ?? 'block'], { size: 12, color: c.violet, strokeWidth: 2.5 })}
              <Text style={styles.pinBadgeText} numberOfLines={1}>
                {post.place.label}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.pinBadge}>
              <MapPin size={12} color={c.violet} strokeWidth={2.5} />
              <Text style={styles.pinBadgeText} numberOfLines={1}>
                {post.place.label}
              </Text>
            </View>
          )}
          {/* Still on the map: how long, and jump there. */}
          {pinLeft ? (
            <TouchableOpacity
              style={styles.onMapChip}
              onPress={onShowOnMap}
              disabled={!onShowOnMap}
              accessibilityRole="button"
              accessibilityLabel={`On the map, ${pinLeft}. Show on map`}
              testID={`post-pin-${post.id}`}
            >
              <MapPin size={11} color={c.textMuted} strokeWidth={2.5} />
              <Text style={styles.onMapText}>{pinLeft}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {asksStillHappening(post, now) || post.myAnswer ? (
        <View style={styles.stillRow} testID={`post-still-${post.id}`}>
          {post.myAnswer ? (
            <Text style={styles.stillText}>
              {post.myAnswer === 'yes' ? 'You said it’s still happening' : 'You said it’s over'}
              {post.confirmations ? ` · ${post.confirmations} confirmed` : ''}
            </Text>
          ) : (
            <>
              <Text style={styles.stillText}>
                Still happening?{post.confirmations ? ` · ${post.confirmations} said yes` : ''}
              </Text>
              <TouchableOpacity
                style={styles.stillBtn}
                onPress={() => answerHeadsUp(post.id, true)}
                accessibilityRole="button"
                accessibilityLabel="Yes, still happening"
                testID={`post-still-yes-${post.id}`}
              >
                <Text style={styles.stillBtnText}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stillBtn}
                onPress={() => answerHeadsUp(post.id, false)}
                accessibilityRole="button"
                accessibilityLabel="It's over"
                testID={`post-still-over-${post.id}`}
              >
                <Text style={styles.stillBtnText}>It’s over</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : null}
      <View style={styles.postFooter}>
        <PostReactions post={post} mine={mine} />
        {/* Replies: only where the poster and the channel allow them (old replies still count). */}
        {canReply || commentCount > 0 ? (
          <TouchableOpacity
            style={styles.voteBtn}
            onPress={onOpen}
            disabled={!onOpen}
            accessibilityRole="button"
            accessibilityLabel={`${commentCount} replies`}
          >
            <MessageCircle size={15} color={c.textMuted} strokeWidth={2} />
            <Text style={styles.footerText}>{commentCount}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

// ---- Reactions ------------------------------------------------------------------------------

/**
 * Likes as emoji reactions: one per person from an approved set grouped by mood. The summary shows
 * the most-used emojis and the total; the smiley (or your emoji) opens six quick picks, and "+"
 * opens the full set by mood (happy, so-so, sad, frustrated). Picking yours again takes it back.
 * Your own posts show the summary only.
 */
const PostReactions: React.FC<{ post: ChannelPost; mine: boolean }> = ({ post, mine }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [picking, setPicking] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const shown = topEmojis(post.reactions);
  const total = post.upvotes;
  const close = () => {
    setPicking(false);
    setShowAll(false);
  };
  const toggle = () => (picking ? close() : setPicking(true));
  const pick = (emoji: string) => {
    reactToPost(post.id, emoji);
    close();
  };
  const pickButton = (emoji: string) => (
    <TouchableOpacity
      key={emoji}
      style={[styles.reactPick, post.myReaction === emoji && styles.reactPickOn]}
      onPress={() => pick(emoji)}
      accessibilityRole="button"
      accessibilityLabel={post.myReaction === emoji ? `Remove ${emoji}` : `React ${emoji}`}
    >
      <Text style={styles.reactPickEmoji}>{emoji}</Text>
    </TouchableOpacity>
  );
  // Your reaction from the full set (not a quick pick) shows first so you can tap it off.
  const extraMine = post.myReaction && !QUICK_REACTIONS.includes(post.myReaction) ? post.myReaction : null;
  return (
    <View style={styles.reactWrap}>
      <View style={styles.reactRow}>
        {total ? (
          <TouchableOpacity
            style={styles.reactSummary}
            onPress={() => !mine && toggle()}
            disabled={mine}
            accessibilityRole={mine ? 'text' : 'button'}
            accessibilityLabel={`${total} ${total === 1 ? 'like' : 'likes'}: ${shown.join(' ')}`}
          >
            <Text style={styles.reactEmojis}>{shown.join('')}</Text>
            <Text style={styles.footerText}>{total}</Text>
          </TouchableOpacity>
        ) : null}
        {mine ? null : (
          <TouchableOpacity
            style={[styles.reactBtn, (picking || post.myReaction) && styles.reactBtnOn]}
            onPress={toggle}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={post.myReaction ? `You reacted ${post.myReaction}. Change` : 'React'}
            testID={`post-react-${post.id}`}
          >
            {post.myReaction ? (
              <Text style={styles.reactMine}>{post.myReaction}</Text>
            ) : (
              <SmilePlus size={16} color={picking ? c.accent : c.textMuted} strokeWidth={2} />
            )}
          </TouchableOpacity>
        )}
      </View>
      {picking && !mine ? (
        <View style={styles.reactPicker}>
          {extraMine ? pickButton(extraMine) : null}
          {QUICK_REACTIONS.map(pickButton)}
          <TouchableOpacity
            style={[styles.reactPick, styles.reactMore, showAll && styles.reactPickOn]}
            onPress={() => setShowAll((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={showAll ? 'Fewer reactions' : 'More reactions'}
            testID={`post-react-more-${post.id}`}
          >
            {showAll ? (
              <X size={18} color={c.accent} strokeWidth={2.5} />
            ) : (
              <Plus size={18} color={c.accent} strokeWidth={2.5} />
            )}
          </TouchableOpacity>
        </View>
      ) : null}
      {picking && showAll && !mine ? (
        <View style={styles.reactPanel}>
          {REACTION_GROUPS.map((group) => (
            <View key={group.id} style={styles.reactGroup}>
              <Text style={styles.reactGroupLabel}>{group.label}</Text>
              <View style={styles.reactGroupRow}>{group.emojis.map(pickButton)}</View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

// ---- Post photos ----------------------------------------------------------------------------

/**
 * A post's photos: one wide, two side by side, three as one big plus two stacked (four: a 2x2
 * grid). Tap one to see it full screen and swipe through the rest.
 */
const PostPhotos: React.FC<{ uris: string[] }> = ({ uris }) => {
  const styles = useThemedStyles(createStyles);
  const [openAt, setOpenAt] = useState<number | null>(null);
  const shown = uris.slice(0, 4);
  const tile = (uri: string, index: number, style: object) => (
    <TouchableOpacity
      key={uri}
      style={[styles.photoTile, style]}
      onPress={() => setOpenAt(index)}
      activeOpacity={0.85}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Photo ${index + 1} of ${shown.length}. Open full screen`}
    >
      <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" />
    </TouchableOpacity>
  );

  let grid: React.ReactNode;
  if (shown.length === 1) {
    grid = tile(shown[0], 0, styles.photoWide);
  } else if (shown.length === 2) {
    grid = <View style={styles.photoRow}>{shown.map((uri, i) => tile(uri, i, styles.photoHalf))}</View>;
  } else if (shown.length === 3) {
    grid = (
      <View style={styles.photoRow}>
        {tile(shown[0], 0, styles.photoBig)}
        <View style={styles.photoColumn}>
          {tile(shown[1], 1, styles.photoSmall)}
          {tile(shown[2], 2, styles.photoSmall)}
        </View>
      </View>
    );
  } else {
    grid = (
      <View style={styles.photoGrid}>
        {shown.map((uri, i) => tile(uri, i, styles.photoQuarter))}
      </View>
    );
  }

  return (
    <>
      {grid}
      <PhotoViewer uris={shown} index={openAt} onClose={() => setOpenAt(null)} />
    </>
  );
};

/** Full-screen photos, swipe left and right. */
const PhotoViewer: React.FC<{ uris: string[]; index: number | null; onClose: () => void }> = ({ uris, index, onClose }) => {
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView | null>(null);
  useEffect(() => {
    if (index != null) setPage(index);
  }, [index]);
  if (index == null) return null;
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          // Open on the photo that was tapped (scrollTo works on Android, contentOffset may not).
          onLayout={() => scroller.current?.scrollTo({ x: index * width, y: 0, animated: false })}
          onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
        >
          {uris.map((uri) => (
            <View key={uri} style={[styles.viewerPage, { width }]}>
              <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>
        <View style={[styles.viewerTop, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.viewerCount}>
            {page + 1} / {uris.length}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.viewerClose}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            hitSlop={10}
          >
            <X size={22} color="#ffffff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ---- Post page (comments) --------------------------------------------------------------------

const PostPage: React.FC<ChannelsScreenProps & { post: ChannelPost; channel: Channel | null }> = ({
  post,
  channel,
  onOpenPost,
  onOpenChannel,
  onShowPostOnMap,
  myHandle,
  onOpenProfile,
  onOpenPlace,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const comments = useVisibleComments();
  const now = useBoosts();
  const threads = useMemo(() => buildThreads(comments, post.id), [comments, post.id]);
  const canReplyHere = repliesAllowed(post, channel?.replies) && canCommentIn(channel);
  const count = threads.reduce((sum, thread) => sum + 1 + thread.replies.length, 0);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);

  const send = () => {
    if (!draft.trim()) return;
    addComment(post.id, myHandle, draft, replyTo?.id ?? null);
    setDraft('');
    setReplyTo(null);
  };

  return (
    <View style={styles.container} testID={`post-page-${post.id}`}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => onOpenPost(null)}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="post-back"
        >
          <ChevronLeft size={20} color={c.text} strokeWidth={2.5} />
          <Text style={styles.backText}>BACK</Text>
        </TouchableOpacity>

        <PostCard
          myHandle={myHandle}
          onOpenProfile={onOpenProfile}
          onOpenPlace={onOpenPlace}
          post={post}
          now={now}
          commentCount={count}
          channel={channel}
          // Opening the channel replaces the post page (the parent closes the post).
          onOpenChannel={() => onOpenChannel(post.channelId)}
          onShowOnMap={() => onShowPostOnMap(post)}
        />

        <Text style={[styles.sectionLabel, styles.sectionSpaced]}>
          {count} {count === 1 ? 'REPLY' : 'REPLIES'}
        </Text>
        {threads.length ? (
          <View style={styles.thread}>
            {threads.map(({ comment, replies }) => (
              <View key={comment.id} style={styles.threadItem}>
                <CommentRow myHandle={myHandle} onOpenProfile={onOpenProfile} comment={comment} now={now} onReply={canReplyHere ? () => setReplyTo(comment) : null} />
                {replies.length ? (
                  <View style={styles.replies}>
                    {replies.map((reply) => (
                      <CommentRow key={reply.id} myHandle={myHandle} onOpenProfile={onOpenProfile} comment={reply} now={now} onReply={canReplyHere ? () => setReplyTo(comment) : null} />
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>{canReplyHere ? 'No replies yet. Say something.' : 'No replies.'}</Text>
        )}
      </ScrollView>

      {/* Reply box, pinned under the thread: only where you can comment and replies are on. */}
      {!repliesAllowed(post, channel?.replies) ? (
        <View style={styles.repliesOffBar} testID="replies-off">
          <Text style={styles.repliesOffText}>Replies are off for this post. React to it instead.</Text>
        </View>
      ) : canCommentIn(channel) ? (
      <View style={styles.commentBar}>
        {replyTo ? (
          <View style={styles.replyingRow}>
            <CornerDownRight size={13} color={c.textMuted} strokeWidth={2.25} />
            <Text style={styles.replyingText} numberOfLines={1}>
              Replying to {replyTo.author}
            </Text>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel reply">
              <X size={15} color={c.textMuted} strokeWidth={2.25} />
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            value={draft}
            onChangeText={setDraft}
            placeholder={replyTo ? `Reply to ${replyTo.author}…` : 'Add a comment…'}
            placeholderTextColor={c.textFaint}
            multiline
            maxLength={500}
            accessibilityLabel="Write a comment"
            testID="comment-input"
          />
          <TouchableOpacity
            style={[styles.sendBtn, !draft.trim() && styles.postBtnDisabled]}
            onPress={send}
            disabled={!draft.trim()}
            accessibilityRole="button"
            accessibilityLabel="Send comment"
            testID="comment-send"
          >
            <Send size={16} color={c.onAccent} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>
      ) : null}
    </View>
  );
};

const CommentRow: React.FC<{
  comment: PostComment;
  now: number;
  /** Null when the post takes no replies. */
  onReply: (() => void) | null;
  myHandle: string;
  onOpenProfile: (handle: string) => void;
}> = ({ comment, now, onReply, myHandle, onOpenProfile }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const mine = sameHandle(comment.author, myHandle);
  return (
    <View style={styles.comment} testID={`comment-${comment.id}`}>
      <View style={styles.commentMetaRow}>
        <TouchableOpacity
          onPress={() => onOpenProfile(comment.author)}
          accessibilityRole="link"
          accessibilityLabel={`${comment.author}'s profile`}
          hitSlop={6}
        >
          <Text style={styles.commentAuthor}>{comment.author}</Text>
        </TouchableOpacity>
        <Text style={styles.postMeta}>· {timeAgo(comment.createdAt, now)}</Text>
      </View>
      <Text style={styles.commentBody}>{comment.body}</Text>
      <View style={styles.commentActions}>
        <TouchableOpacity
          style={styles.commentAction}
          onPress={() => toggleCommentLike(comment.id)}
          disabled={mine}
          accessibilityRole="button"
          accessibilityState={{ selected: comment.voted, disabled: mine }}
          accessibilityLabel={`${comment.voted ? 'Unlike' : 'Like'}, ${comment.upvotes} likes`}
          hitSlop={6}
        >
          <Heart size={14} color={comment.voted ? c.red : c.textMuted} fill={comment.voted ? c.red : 'transparent'} strokeWidth={2} />
          {comment.upvotes ? (
            <Text style={[styles.footerText, comment.voted && styles.footerTextOn]}>{comment.upvotes}</Text>
          ) : null}
        </TouchableOpacity>
        {onReply ? (
          <TouchableOpacity style={styles.commentAction} onPress={onReply} accessibilityRole="button" hitSlop={6}>
            <CornerDownRight size={14} color={c.textMuted} strokeWidth={2.25} />
            <Text style={styles.footerText}>Reply</Text>
          </TouchableOpacity>
        ) : null}
        {mine ? null : (
          <TouchableOpacity
            style={styles.commentAction}
            onPress={() =>
              setReporting({ type: 'comment', id: comment.id, label: snippet(comment.body), ownerHandle: comment.author })
            }
            accessibilityRole="button"
            accessibilityLabel={`Report comment by ${comment.author}`}
            hitSlop={6}
            testID={`comment-report-${comment.id}`}
          >
            <Flag size={13} color={c.textFaint} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.base },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 16, paddingBottom: 28 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 4,
    },
    searchBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      minHeight: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.accentBorder,
      backgroundColor: c.accentTint,
    },
    searchBtnText: { color: c.accent, fontSize: 13, fontWeight: '800' },
    title: { color: c.text, fontSize: 24, fontWeight: '800' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    bellBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    bellDot: {
      position: 'absolute',
      top: 7,
      right: 8,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.accent,
      borderWidth: 1.5,
      borderColor: c.surface,
    },
    // Feed | My Channels: one rounded bar, split in half; the open half is filled.
    segmentBar: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 10,
      padding: 4,
      gap: 4,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    segmentHalf: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 9,
      borderRadius: 10,
    },
    segmentHalfActive: { backgroundColor: c.accent },
    segmentText: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
    segmentTextActive: { color: c.onAccent, fontWeight: '800' },
    segmentCount: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.border,
    },
    segmentCountActive: { backgroundColor: 'rgba(255,255,255,0.35)' },
    segmentCountText: { color: c.text, fontSize: 11, fontWeight: '800' },
    segmentCountTextActive: { color: c.onAccent },
    sectionLabel: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, marginTop: 4 },
    // Tucks the sort row (which has its own 14 top margin) up under the deck's dots.
    recommendations: { marginBottom: -6 },
    sectionSpaced: { marginTop: 20 },
    findHeading: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 },
    findHeadingText: { marginBottom: 0, marginTop: 0 },
    rowReason: { fontSize: 11.5, fontWeight: '700', marginTop: 3 },
    rowReasonForYou: { color: c.violet },
    rowReasonTrending: { color: c.orange },
    // Find channels category chips: a smaller take on the Feed / My Channels pills.
    categoryScroll: { flexGrow: 0, marginHorizontal: -16, marginTop: 16, marginBottom: 8 },
    categoryRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16 },
    categoryChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    categoryChipActive: { backgroundColor: c.accentTint, borderColor: c.accentDeep },
    categoryText: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
    categoryTextActive: { color: c.accent, fontWeight: '800' },
    list: { gap: 10 },
    emptyText: { color: c.textFaint, fontSize: 13, lineHeight: 19 },

    chipScroll: { marginHorizontal: -16, marginBottom: 12 },
    chipRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
    channelChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: 190,
      paddingLeft: 4,
      paddingRight: 12,
      paddingVertical: 4,
      borderRadius: 18,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    // Round "+" as tall as the channel chips (22px badge + 8px halo + 4px padding each side + border).
    channelChipAdd: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    channelChipText: { color: c.textBody, fontSize: 12, fontWeight: '700', flexShrink: 1 },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
    },
    rowCopy: { flex: 1, gap: 2 },
    rowTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
    rowMeta: { color: c.textMuted, fontSize: 12 },
    liveMeta: { color: c.green, fontWeight: '800' },

    joinBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: 32,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: c.accent,
    },
    joinBtnLarge: { flex: 1, minHeight: 42, borderRadius: 21 },
    membershipRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    followBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      minHeight: 42,
      borderRadius: 21,
      borderWidth: 1.5,
      borderColor: c.violet,
    },
    followBtnOn: { backgroundColor: c.violet },
    followText: { color: c.violet, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
    followTextOn: { color: c.white },
    followHint: { color: c.textFaint, fontSize: 12, marginTop: 6 },
    joinBtnJoined: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.accentBorder },
    joinText: { color: c.onAccent, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
    joinTextJoined: { color: c.accent },

    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 14, paddingBottom: 6, alignSelf: 'flex-start' },
    backText: { color: c.text, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
    pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
    pageTitle: { color: c.text, fontSize: 21, fontWeight: '800' },
    description: { color: c.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 12 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    tagPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    tagText: { color: c.accent, fontSize: 12, fontWeight: '700' },

    composer: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      gap: 8,
    },
    composerInput: { color: c.text, fontSize: 14, minHeight: 44, textAlignVertical: 'top', padding: 4 },
    composerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    photoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 34,
      minWidth: 34,
      paddingHorizontal: 9,
      borderRadius: 17,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    photoBtnText: { color: c.accent, fontSize: 12, fontWeight: '800' },
    draftPhotos: { flexDirection: 'row', gap: 6, paddingHorizontal: 4 },
    draftPhoto: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: c.surfaceDim },
    draftPhotoRemove: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    photoError: { color: c.red, fontSize: 12, paddingHorizontal: 4 },
    pinToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flexShrink: 1,
      paddingHorizontal: 12,
      minHeight: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: c.violet,
    },
    pinToggleOn: { backgroundColor: c.violet },
    pinToggleText: { color: c.violet, fontSize: 12, fontWeight: '800', flexShrink: 1 },
    pinToggleTextOn: { color: c.white },
    pinOptions: { gap: 6, paddingHorizontal: 4 },
    pinOptionsLabel: { color: c.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginTop: 2 },
    pinChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    pinChip: {
      maxWidth: 170,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: c.surfaceDim,
      borderWidth: 1,
      borderColor: c.border,
    },
    pinChipActive: { backgroundColor: c.violetTint, borderColor: c.violet },
    pinChipText: { color: c.textSecondary, fontSize: 12, fontWeight: '700' },
    pinChipTextActive: { color: c.violetText },
    pinNote: { color: c.textFaint, fontSize: 11, marginTop: 2 },
    postBtn: {
      alignSelf: 'flex-end',
      marginLeft: 'auto',
      paddingHorizontal: 18,
      minHeight: 34,
      borderRadius: 17,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    postBtnDisabled: { opacity: 0.45 },
    postBtnText: { color: c.onAccent, fontSize: 12, fontWeight: '900', letterSpacing: 1 },

    post: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      gap: 8,
    },
    postHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    postChannel: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '60%' },
    postChannelText: { color: c.accent, fontSize: 12, fontWeight: '800', flexShrink: 1 },
    postMeta: { color: c.textFaint, fontSize: 12, flexShrink: 1 },
    postBody: { color: c.text, fontSize: 14, lineHeight: 20 },
    postFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    reportBtn: { marginLeft: 'auto', paddingLeft: 6 },
    placeIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.violetTint,
      borderWidth: 1,
      borderColor: c.violet,
    },
    interestRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    reactWrap: { gap: 6 },
    reactRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    reactSummary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: c.surfaceDim,
    },
    reactEmojis: { fontSize: 14 },
    reactBtn: {
      minWidth: 32,
      height: 30,
      paddingHorizontal: 7,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    reactBtnOn: { borderColor: c.accent, backgroundColor: c.accentTint },
    reactMine: { fontSize: 15 },
    reactPicker: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      gap: 2,
      padding: 4,
      borderRadius: 18,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    reactPick: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    reactPickOn: { backgroundColor: c.accentTint },
    reactPickEmoji: { fontSize: 20 },
    reactMore: { borderLeftWidth: 1, borderLeftColor: c.border, borderRadius: 0, marginLeft: 2 },
    reactPanel: {
      alignSelf: 'stretch',
      gap: 8,
      padding: 10,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    reactGroup: { gap: 2 },
    reactGroupLabel: { color: c.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    reactGroupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
    repliesToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: c.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: c.violet, borderColor: c.violet },
    repliesToggleText: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
    repliesToggleOff: { color: c.textFaint, fontWeight: '600' },
    repliesOffBar: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.base },
    repliesOffText: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
    interestText: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
    kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
    kindChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    kindChipActive: { backgroundColor: c.violetTint, borderColor: c.violet },
    kindChipText: { color: c.textMuted, fontSize: 12, fontWeight: '800' },
    kindChipTextActive: { color: c.violetText },
    placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    placeRowText: { color: c.violetText, fontSize: 14, fontWeight: '800' },
    kindBadge: { marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1 },
    kindBadgeText: { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.6 },
    placeLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    onMapChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    onMapText: { color: c.textMuted, fontSize: 11, fontWeight: '700' },
    stillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.amberTint,
      borderWidth: 1,
      borderColor: c.amberBorder,
    },
    stillText: { flex: 1, color: c.textBody, fontSize: 12, fontWeight: '700' },
    stillBtn: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.amber,
    },
    stillBtnText: { color: c.amber, fontSize: 12, fontWeight: '800' },
    accessPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      marginTop: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: c.violetTint,
    },
    accessPillText: { color: c.violetText, fontSize: 11, fontWeight: '800' },
    gateBox: {
      marginTop: 12,
      padding: 14,
      gap: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.violet,
      backgroundColor: c.violetTint,
    },
    gateBtnPending: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.violet },
    gateBtnPendingText: { color: c.violetText },
    modBox: {
      marginTop: 14,
      padding: 14,
      gap: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    modLabel: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 6 },
    modHint: { color: c.textFaint, fontSize: 12, lineHeight: 17 },
    modChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    modRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    modHandle: { color: c.text, fontSize: 14, fontWeight: '700' },
    modMeta: { color: c.textMuted, fontSize: 12 },
    modApprove: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.violet,
    },
    modDecline: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    createChannelBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: c.violet,
      backgroundColor: c.violetTint,
    },
    createChannelText: { color: c.violetText, fontSize: 14, fontWeight: '800' },
    claimBox: {
      marginTop: 14,
      padding: 12,
      gap: 8,
      borderRadius: 14,
      backgroundColor: c.violetTint,
      borderWidth: 1,
      borderColor: c.violetBase,
    },
    claimHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    claimTitle: { color: c.violetText, fontSize: 14, fontWeight: '800' },
    claimBody: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    claimBtn: {
      alignSelf: 'flex-start',
      paddingHorizontal: 16,
      minHeight: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.violet,
    },
    claimBtnText: { color: c.white, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
    ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
    ownerText: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
    photoTile: { overflow: 'hidden', borderRadius: 12, backgroundColor: c.surfaceDim },
    photoImage: { width: '100%', height: '100%' },
    photoWide: { width: '100%', aspectRatio: 4 / 3 },
    photoRow: { flexDirection: 'row', gap: 4 },
    photoHalf: { flex: 1, aspectRatio: 1 },
    photoBig: { flex: 2, aspectRatio: 2 / 2.05 },
    photoColumn: { flex: 1, gap: 4 },
    photoSmall: { flex: 1 },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    photoQuarter: { width: '49%', aspectRatio: 1 },
    viewer: { flex: 1, backgroundColor: c.viewerBackdrop },
    viewerPage: { flex: 1, justifyContent: 'center' },
    viewerImage: { width: '100%', height: '100%' },
    viewerTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
    },
    viewerCount: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
    viewerClose: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    pinBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      maxWidth: '100%',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: c.violetTint,
      borderWidth: 1,
      borderColor: c.violetBase,
    },
    pinBadgeText: { color: c.violetText, fontSize: 12, fontWeight: '700', flexShrink: 1 },
    sortRow: { flexDirection: 'row', gap: 6, marginTop: 14, marginBottom: 10 },
    sortPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: c.surfaceDim,
      borderWidth: 1,
      borderColor: c.border,
    },
    sortPillActive: { backgroundColor: c.accentTint, borderColor: c.accentDeep },
    sortText: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
    sortTextActive: { color: c.accent, fontWeight: '800' },
    thread: { gap: 14 },
    threadItem: { gap: 10 },
    replies: { marginLeft: 14, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: c.border, gap: 10 },
    comment: { gap: 4 },
    commentAuthor: { color: c.textBody, fontSize: 12, fontWeight: '800' },
    commentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    authorLink: { flexShrink: 1 },
    authorText: { color: c.textSecondary, fontSize: 12, fontWeight: '700' },
    commentBody: { color: c.text, fontSize: 14, lineHeight: 20 },
    commentActions: { flexDirection: 'row', gap: 16, marginTop: 2 },
    commentAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    commentBar: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.sheet,
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 10,
      gap: 6,
    },
    replyingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
    replyingText: { flex: 1, color: c.textMuted, fontSize: 12, fontWeight: '600' },
    commentInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    commentInput: {
      flex: 1,
      maxHeight: 110,
      minHeight: 40,
      color: c.text,
      fontSize: 14,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 20,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
    },
    voteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: c.surfaceDim,
    },
    voteBtnOn: { backgroundColor: c.accentTint },
    footerText: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
    footerTextOn: { color: c.accent },

    empty: { alignItems: 'center', gap: 10, paddingHorizontal: 28, paddingTop: 48 },
    emptyIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accentTint,
      marginBottom: 4,
    },
    emptyTitle: { color: c.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
    emptyBody: { color: c.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
    emptyBtn: {
      marginTop: 8,
      paddingHorizontal: 22,
      minHeight: 44,
      borderRadius: 22,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyBtnText: { color: c.base, fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
  });
