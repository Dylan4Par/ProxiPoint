import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowBigUp, Check, ChevronLeft, ChevronRight, MessageCircle, Plus, Users } from 'lucide-react-native';
import { CategoryBadge } from '../components/discovery/CategoryBadge';
import { ActivityScreen } from './ActivityScreen';
import { timeAgo } from '../lib/activity';
import { useBoosts } from '../lib/boost';
import { addPost, setJoined, toggleVote, useChannels, usePosts, type Channel, type ChannelPost } from '../lib/channels';
import { channelNodes, formatCount, formatDistance, splitFeed } from '../lib/discoverFeed';
import { isLiveNode } from '../lib/liveStatus';
import { isNodeAllowed, useModeration } from '../lib/moderation';
import { useDiscoveryStore, type DiscoveryNode } from '../stores/useDiscoveryStore';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme/ThemeContext';

export type ChannelsSegment = 'feed' | 'alerts' | 'manage';

interface ChannelsScreenProps {
  segment: ChannelsSegment;
  onChangeSegment: (segment: ChannelsSegment) => void;
  /** Channel page that's open, or null for the segment views. */
  channelId: string | null;
  onOpenChannel: (id: string | null) => void;
  /** Your handle, used as the author of new posts. */
  myHandle: string;
  /** Unread #tag alerts (shown on the Alerts pill). */
  unreadAlerts: number;
  interestTags: string[];
  /** Show the Point on Explore Map with its details open. */
  onOpenPoint: (id: string) => void;
  onToggleRsvp: (id: string) => void;
  /** Go to Profile to add #tags. */
  onEditTags: () => void;
  /** Explore Map filtered to this #tag. */
  onOpenTag: (tag: string) => void;
}

const SEGMENTS: Array<{ id: ChannelsSegment; label: string }> = [
  { id: 'feed', label: 'Feed' },
  { id: 'alerts', label: 'Alerts' },
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
  const { segment, onChangeSegment, channelId, onOpenChannel, unreadAlerts } = props;
  const styles = useThemedStyles(createStyles);
  const channels = useChannels();
  const open = channelId ? channels.find((channel) => channel.id === channelId) ?? null : null;

  // Android back on a channel page returns to the list.
  useEffect(() => {
    if (!channelId) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onOpenChannel(null);
      return true;
    });
    return () => sub.remove();
  }, [channelId, onOpenChannel]);

  if (open) return <ChannelPage {...props} channel={open} />;

  return (
    <View style={styles.container} testID="channels-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Channels</Text>
      </View>
      <View style={styles.segmentRow} accessibilityRole="tablist">
        {SEGMENTS.map(({ id, label }) => {
          const active = segment === id;
          const badge = id === 'alerts' && unreadAlerts > 0 && !active;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.segmentPill, active && styles.segmentPillActive]}
              onPress={() => onChangeSegment(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={badge ? `${label}, ${unreadAlerts} unread` : label}
              testID={`channels-segment-${id}`}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
              {badge ? (
                <View style={styles.segmentBadge}>
                  <Text style={styles.segmentBadgeText}>{unreadAlerts > 9 ? '9+' : unreadAlerts}</Text>
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
      {segment === 'manage' ? <ManageView channels={channels} onOpenChannel={onOpenChannel} /> : null}
    </View>
  );
};

// ---- Feed ------------------------------------------------------------------------------------

const FeedView: React.FC<ChannelsScreenProps & { channels: Channel[] }> = ({
  channels,
  onOpenChannel,
  onChangeSegment,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const posts = usePosts();
  const now = useBoosts();
  const joined = channels.filter((channel) => channel.joined);
  const joinedIds = new Set(joined.map((channel) => channel.id));
  const feed = posts.filter((post) => joinedIds.has(post.channelId));
  const byId = new Map(channels.map((channel) => [channel.id, channel]));

  if (!joined.length) {
    return (
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

      {feed.length ? (
        <View style={styles.list}>
          {feed.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              now={now}
              channel={byId.get(post.channelId) ?? null}
              onOpenChannel={() => onOpenChannel(post.channelId)}
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

const ManageView: React.FC<{ channels: Channel[]; onOpenChannel: (id: string) => void }> = ({ channels, onOpenChannel }) => {
  const styles = useThemedStyles(createStyles);
  const joined = channels.filter((channel) => channel.joined);
  const others = channels.filter((channel) => !channel.joined).sort((a, b) => b.memberCount - a.memberCount);
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="channels-manage">
      <Text style={styles.sectionLabel}>JOINED ({joined.length})</Text>
      {joined.length ? (
        <View style={styles.list}>
          {joined.map((channel) => (
            <ChannelRow key={channel.id} channel={channel} onOpen={() => onOpenChannel(channel.id)} />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>You haven’t joined any channels yet.</Text>
      )}
      <Text style={[styles.sectionLabel, styles.sectionSpaced]}>FIND CHANNELS</Text>
      {others.length ? (
        <View style={styles.list}>
          {others.map((channel) => (
            <ChannelRow key={channel.id} channel={channel} onOpen={() => onOpenChannel(channel.id)} />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>You’re in every channel around here.</Text>
      )}
    </ScrollView>
  );
};

const ChannelRow: React.FC<{ channel: Channel; onOpen: () => void }> = ({ channel, onOpen }) => {
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
          {channel.handle} · {formatCount(channel.memberCount)} members
        </Text>
      </View>
      <JoinButton channel={channel} />
    </TouchableOpacity>
  );
};

const JoinButton: React.FC<{ channel: Channel; large?: boolean }> = ({ channel, large = false }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.joinBtn, large && styles.joinBtnLarge, channel.joined && styles.joinBtnJoined]}
      onPress={() => setJoined(channel.id, !channel.joined)}
      accessibilityRole="button"
      accessibilityLabel={channel.joined ? `Leave ${channel.name}` : `Join ${channel.name}`}
      testID={`channel-join-${channel.id}`}
    >
      {channel.joined ? <Check size={13} color={c.accent} strokeWidth={3} /> : null}
      <Text style={[styles.joinText, channel.joined && styles.joinTextJoined]}>{channel.joined ? 'JOINED' : 'JOIN'}</Text>
    </TouchableOpacity>
  );
};

// ---- Channel page ----------------------------------------------------------------------------

const ChannelPage: React.FC<ChannelsScreenProps & { channel: Channel }> = ({
  channel,
  onOpenChannel,
  onOpenPoint,
  myHandle,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const posts = usePosts().filter((post) => post.channelId === channel.id);
  const nodes = useDiscoveryStore((state) => state.nodes) as unknown as Record<string, DiscoveryNode>;
  const now = useBoosts();
  const moderation = useModeration();
  const points = useMemo(() => {
    const { nearby, upcoming } = splitFeed(nodes, now, isNodeAllowed);
    return channelNodes(channel, [...nearby, ...upcoming]) as DiscoveryNode[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, nodes, now, moderation]);
  const [draft, setDraft] = useState('');

  const post = () => {
    if (!draft.trim()) return;
    addPost(channel.id, myHandle, draft);
    setDraft('');
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
            {channel.handle} · {formatCount(channel.memberCount)} members
          </Text>
        </View>
      </View>
      <Text style={styles.description}>{channel.description}</Text>
      <View style={styles.tagRow}>
        {channel.tags.map((tag) => (
          <View key={tag} style={styles.tagPill}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
      <JoinButton channel={channel} large />

      <Text style={[styles.sectionLabel, styles.sectionSpaced]}>POINTS IN THIS CHANNEL</Text>
      {points.length ? (
        <View style={styles.list}>
          {points.map((node) => {
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
        </View>
      ) : (
        <Text style={styles.emptyText}>Nothing scheduled with these #tags right now.</Text>
      )}

      <Text style={[styles.sectionLabel, styles.sectionSpaced]}>POSTS</Text>
      {channel.joined ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder={`Post to ${channel.name}…`}
            placeholderTextColor={c.textFaint}
            multiline
            maxLength={500}
            accessibilityLabel={`Write a post in ${channel.name}`}
            testID="channel-composer"
          />
          <TouchableOpacity
            style={[styles.postBtn, !draft.trim() && styles.postBtnDisabled]}
            onPress={post}
            disabled={!draft.trim()}
            accessibilityRole="button"
            testID="channel-post"
          >
            <Text style={styles.postBtnText}>POST</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.emptyText}>Join to post in this channel.</Text>
      )}
      {posts.length ? (
        <View style={[styles.list, styles.postsList]}>
          {posts.map((item) => (
            <PostCard key={item.id} post={item} now={now} channel={null} />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>No posts yet. Start the conversation.</Text>
      )}
    </ScrollView>
  );
};

// ---- Post card -------------------------------------------------------------------------------

const PostCard: React.FC<{
  post: ChannelPost;
  now: number;
  /** Show which channel it's from (combined feed). Null inside a channel page. */
  channel: Channel | null;
  onOpenChannel?: () => void;
}> = ({ post, now, channel, onOpenChannel }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
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
        <Text style={styles.postMeta} numberOfLines={1}>
          {post.author} · {timeAgo(post.createdAt, now)}
        </Text>
      </View>
      <Text style={styles.postBody}>{post.body}</Text>
      <View style={styles.postFooter}>
        <TouchableOpacity
          style={[styles.voteBtn, post.voted && styles.voteBtnOn]}
          onPress={() => toggleVote(post.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: post.voted }}
          accessibilityLabel={`${post.voted ? 'Remove upvote' : 'Upvote'}, ${post.upvotes} votes`}
        >
          <ArrowBigUp size={18} color={post.voted ? c.accent : c.textMuted} fill={post.voted ? c.accent : 'transparent'} strokeWidth={2} />
          <Text style={[styles.footerText, post.voted && styles.footerTextOn]}>{post.upvotes}</Text>
        </TouchableOpacity>
        <View style={styles.voteBtn}>
          <MessageCircle size={15} color={c.textMuted} strokeWidth={2} />
          <Text style={styles.footerText}>{post.comments}</Text>
        </View>
      </View>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.base },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 16, paddingBottom: 28 },
    header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
    title: { color: c.text, fontSize: 24, fontWeight: '800' },
    segmentRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    segmentPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      backgroundColor: c.border,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    segmentPillActive: { backgroundColor: c.accentTint, borderColor: c.accentDeep },
    segmentText: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
    segmentTextActive: { color: c.accent, fontWeight: '800' },
    segmentBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.yellow,
    },
    segmentBadgeText: { color: '#0a1120', fontSize: 10, fontWeight: '900' },
    sectionLabel: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, marginTop: 4 },
    sectionSpaced: { marginTop: 20 },
    list: { gap: 10 },
    postsList: { marginTop: 12 },
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
    joinBtnLarge: { minHeight: 42, borderRadius: 21, marginTop: 14 },
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
    postBtn: {
      alignSelf: 'flex-end',
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
    postFooter: { flexDirection: 'row', gap: 8 },
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
