import React, { useEffect, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bell, ChevronRight, MapPin, Zap } from 'lucide-react-native';
import { markAllActivityRead, timeAgo, useActivity, type ActivityItem } from '../lib/activity';
import { activeBoost, useBoosts } from '../lib/boost';
import { useModeration } from '../lib/moderation';
import { deckPicks, tagTracker, type RecNode } from '../lib/recommend';
import { useUnits } from '../lib/units';
import { useDiscoveryStore } from '../stores/useDiscoveryStore';
import { RecommendationDeck } from '../components/activity/RecommendationDeck';
import { TagTrackerTile } from '../components/activity/TagTrackerTile';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme/ThemeContext';

const BOOST_GOLD = '#f59e0b';

/**
 * Activity tab: alerts for new Points and Boosts matching your #tags.
 * Items that were unread when you opened the tab keep their dot until you leave.
 */
export const ActivityScreen: React.FC<{
  interestTags: string[];
  /** Show the Point on Discover with its details open. */
  onOpenPoint: (id: string) => void;
  /** Go to the Profile page to add #tags. */
  onEditTags: () => void;
  onToggleRsvp: (id: string) => void;
  /** Show Discover filtered to this #tag. */
  onOpenTag: (tag: string) => void;
  /** Shown inside Channels (Alerts): no "Activity" title, the Channels header has its own. */
  embedded?: boolean;
}> = ({ interestTags, onOpenPoint, onEditTags, onToggleRsvp, onOpenTag, embedded = false }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const items = useActivity();
  const now = useBoosts(); // ticks every 30s so "5m" ages move
  const moderation = useModeration();
  const nodes = useDiscoveryStore((state) => state.nodes) as unknown as Record<string, RecNode>;
  const units = useUnits(); // "316m away" or "0.2 mi away" on the cards
  const deck = useMemo(() => deckPicks(nodes, interestTags, now), [nodes, interestTags, now, moderation, units]);

  // Recent: alerts for boosts that are still running stay on top; everything else keeps its order.
  const sortedItems = useMemo(() => {
    const running = (item: ActivityItem) => {
      if (item.kind !== 'boost') return false;
      const boost = activeBoost(item.pointId, now);
      return boost != null && item.id === `boost:${item.pointId}:${boost.startedAt}`;
    };
    return items
      .map((item, index) => ({ item, index, top: running(item) }))
      .sort((a, b) => Number(b.top) - Number(a.top) || a.index - b.index)
      .map((entry) => entry.item);
  }, [items, now]);
  const tracker = useMemo(() => tagTracker(nodes, interestTags, now), [nodes, interestTags, now, moderation]);

  // Remember what was unread on arrival, then mark everything read.
  // (Alerts that arrive while you're here get a dot too.)
  const unreadOnOpen = useRef(new Set<string>());
  items.forEach((item) => {
    if (!item.read) unreadOnOpen.current.add(item.id);
  });
  useEffect(() => {
    markAllActivityRead();
  }, [items.length]);
  const isNew = (item: ActivityItem) => unreadOnOpen.current.has(item.id);

  const header = (
    <View style={[styles.header, embedded && styles.headerEmbedded]}>
      {embedded ? null : <Text style={styles.title}>Activity</Text>}
      <TouchableOpacity onPress={onEditTags} style={styles.tagsBtn} accessibilityRole="button" testID="activity-edit-tags">
        <Text style={styles.tagsBtnText} numberOfLines={1}>
          {interestTags.length ? `Following ${interestTags.length} #tag${interestTags.length === 1 ? '' : 's'}` : 'Add #tags'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // No #tags yet: invite them to add some (the deck still shows boosted / popular Points).
  const followEmpty = (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Bell size={26} color={c.accent} strokeWidth={2} />
      </View>
      <Text style={styles.emptyTitle}>Follow #tags to get alerts</Text>
      <Text style={styles.emptyBody}>
        Add #tags on your Profile, like #LiveMusic or #FoodTrucks, and you’ll hear about new Points and
        Boosts that use them.
      </Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={onEditTags} accessibilityRole="button">
        <Text style={styles.emptyBtnText}>ADD #TAGS</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container} testID="activity-screen">
      <FlatList
        data={sortedItems}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {header}
            <Text style={styles.sectionLabel}>RECOMMENDATIONS</Text>
            <RecommendationDeck
              picks={deck.picks}
              mode={deck.mode}
              onOpenPoint={onOpenPoint}
              onToggleRsvp={onToggleRsvp}
            />
            {interestTags.length ? (
              <>
                <Text style={[styles.sectionLabel, styles.sectionSpaced]}>TAG TRACKER</Text>
                <TagTrackerTile stats={tracker} onOpenTag={onOpenTag} />
              </>
            ) : null}
            {items.length ? <Text style={[styles.sectionLabel, styles.sectionSpaced]}>RECENT</Text> : null}
          </>
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !interestTags.length ? followEmpty : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing new yet</Text>
            <Text style={styles.emptyBody}>
              New Points and Boosts with {interestTags.slice(0, 3).join(', ')}
              {interestTags.length > 3 ? ' and more' : ''} will show up here.
            </Text>
          </View>
          )
        }
        renderItem={({ item }) => {
          const boost = item.kind === 'boost';
          return (
            <TouchableOpacity
              style={[styles.row, boost && styles.rowBoost]}
              onPress={() => onOpenPoint(item.pointId)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.body}`}
              testID={`activity-${item.id}`}
            >
              <View style={[styles.icon, boost ? styles.iconBoost : styles.iconNew]}>
                {boost ? (
                  <Zap size={18} color="#1f1300" fill="#1f1300" strokeWidth={2} />
                ) : (
                  <MapPin size={18} color={c.accent} strokeWidth={2.25} />
                )}
              </View>
              <View style={styles.copy}>
                <View style={styles.titleRow}>
                  <Text style={[styles.itemTitle, boost && styles.itemTitleBoost]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.time}>{timeAgo(item.createdAt, now)}</Text>
                </View>
                <Text style={styles.body} numberOfLines={2}>
                  {item.body}
                </Text>
              </View>
              {isNew(item) ? <View style={styles.unread} /> : <ChevronRight size={16} color={c.iconFaint} strokeWidth={2.25} />}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.base },
    padded: { paddingHorizontal: 16 },
    sectionLabel: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, marginTop: 4 },
    sectionSpaced: { marginTop: 18 },
    list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingTop: 16,
      paddingBottom: 8,
      paddingHorizontal: 0,
    },
    headerEmbedded: { paddingTop: 4, justifyContent: 'flex-start' },
    title: { color: c.text, fontSize: 24, fontWeight: '800' },
    tagsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexShrink: 1,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.accentBorder,
      backgroundColor: c.accentTint,
    },
    tagsBtnText: { color: c.accent, fontSize: 12, fontWeight: '800' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
    },
    rowBoost: { borderColor: 'rgba(245, 158, 11, 0.55)' },
    icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    iconNew: { backgroundColor: c.accentTint, borderWidth: 1, borderColor: c.accentBorder },
    iconBoost: { backgroundColor: BOOST_GOLD },
    copy: { flex: 1, gap: 3 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    itemTitle: { flex: 1, color: c.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
    itemTitleBoost: { color: BOOST_GOLD },
    time: { color: c.textFaint, fontSize: 11, fontWeight: '600' },
    body: { color: c.text, fontSize: 14, lineHeight: 19 },
    unread: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.accent },
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
