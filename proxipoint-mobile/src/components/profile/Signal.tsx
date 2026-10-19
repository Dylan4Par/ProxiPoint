import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowBigUp, ChevronDown, ChevronUp, Crown, MessageCircle, Radio } from 'lucide-react-native';
import { useChannels } from '../../lib/channels';
import { timeAgo } from '../../lib/activity';
import { nextBarIn, type Contribution, type Signal, type SignalRank } from '../../lib/signalScore';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

const formatScore = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(value);

/** Five rising bars, like a phone's signal meter. */
export const SignalMeter: React.FC<{ bars: number; size?: number; color?: string }> = ({ bars, size = 16, color }) => {
  const { colors: c } = useTheme();
  const on = color ?? c.accent;
  const barWidth = Math.max(2, Math.round(size / 6));
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Math.max(1, Math.round(barWidth / 2)), height: size }}
      accessibilityLabel={`${bars} of 5 signal bars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <View
          key={n}
          style={{
            width: barWidth,
            height: Math.max(3, (size * n) / 5),
            borderRadius: barWidth / 2,
            backgroundColor: n <= bars ? on : c.borderStrong,
          }}
        />
      ))}
    </View>
  );
};

/** Small "▂▄▆ 359 Signal" chip under a profile's name. */
export const SignalChip: React.FC<{ signal: Signal; onPress?: () => void }> = ({ signal, onPress }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      style={styles.chip}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Signal Score ${signal.score}, ${signal.level}`}
      testID="signal-chip"
    >
      <SignalMeter bars={signal.bars} size={13} />
      <Text style={styles.chipScore}>{formatScore(signal.score)}</Text>
      <Text style={styles.chipLabel}>SIGNAL</Text>
    </TouchableOpacity>
  );
};

/** Contributions shown before "Show all". */
const PREVIEW = 4;

/**
 * Profile → SIGNAL: the Signal Score, what it's made of (earned + contributed), and the person's
 * contributions (posts and comments) underneath. Same tile on your own profile and others'.
 */
export const SignalTile: React.FC<{
  signal: Signal;
  contributions: Contribution[];
  /** Your own profile: friendlier empty state and the "next bar" hint. */
  isMe?: boolean;
  onOpenPost?: (postId: string) => void;
}> = ({ signal, contributions, isMe = false, onOpenPost }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const channels = useChannels();
  const [kind, setKind] = useState<'post' | 'comment'>('post');
  const [showAll, setShowAll] = useState(false);
  const [explain, setExplain] = useState(false);
  const shown = contributions.filter((item) => item.kind === kind);
  const toNext = nextBarIn(signal.score);
  const channelName = (id: string) => channels.find((channel) => channel.id === id)?.name ?? 'a channel';

  return (
    <View style={styles.tile} testID="profile-signal">
      <View style={styles.scoreRow}>
        <View style={styles.scoreIcon}>
          <SignalMeter bars={signal.bars} size={26} />
        </View>
        <View style={styles.scoreCopy}>
          <View style={styles.scoreLine}>
            <Text style={styles.score}>{formatScore(signal.score)}</Text>
            <Text style={styles.level}>{signal.level.toUpperCase()}</Text>
          </View>
          <Text style={styles.split}>
            {signal.earned} earned · {signal.contributed} contributed
          </Text>
        </View>
      </View>
      {isMe && toNext !== null ? (
        <Text style={styles.hint}>
          {signal.score === 0
            ? 'Post, comment and host Points to start your signal.'
            : `${toNext} more to the next bar.`}
        </Text>
      ) : null}

      <View style={styles.breakdown}>
        <Part value={signal.postUpvotes + signal.commentUpvotes} label="Upvotes" />
        <Part value={signal.cheers} label="Recap cheers" />
        <Part value={signal.pointsHosted} label="Points hosted" />
      </View>

      <TouchableOpacity
        style={styles.explainRow}
        onPress={() => setExplain((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: explain }}
        testID="signal-explain"
      >
        <Text style={styles.explainLink}>How Signal works</Text>
        {explain ? (
          <ChevronUp size={14} color={c.accent} strokeWidth={2.5} />
        ) : (
          <ChevronDown size={14} color={c.accent} strokeWidth={2.5} />
        )}
      </TouchableOpacity>
      {explain ? (
        <Text style={styles.explain}>
          Signal is earned from the community: upvotes on your posts and comments, and cheers on recaps of Points you
          hosted. Posting, commenting and hosting add to it too, but only a little past what you’ve earned, so
          quality beats volume. Paid Boosts never count.
        </Text>
      ) : null}

      <View style={styles.divider} />
      <Text style={styles.label}>CONTRIBUTIONS</Text>
      <View style={styles.segments}>
        {(['post', 'comment'] as const).map((id) => {
          const active = kind === id;
          const count = contributions.filter((item) => item.kind === id).length;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => {
                setKind(id);
                setShowAll(false);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              testID={`signal-contributions-${id}`}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {id === 'post' ? 'Posts' : 'Comments'} · {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {shown.length ? (
        <View style={styles.list}>
          {(showAll ? shown : shown.slice(0, PREVIEW)).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.item}
              onPress={() => onOpenPost?.(item.postId)}
              disabled={!onOpenPost}
              accessibilityRole="button"
              accessibilityLabel={`${item.kind === 'post' ? 'Post' : 'Comment'} in ${channelName(item.channelId)}`}
            >
              {item.kind === 'post' ? (
                <Radio size={15} color={c.violet} strokeWidth={2.25} />
              ) : (
                <MessageCircle size={15} color={c.violet} strokeWidth={2.25} />
              )}
              <View style={styles.itemCopy}>
                <Text style={styles.itemBody} numberOfLines={2}>
                  {item.body || 'Photo post'}
                </Text>
                <Text style={styles.itemMeta} numberOfLines={1}>
                  {channelName(item.channelId)} · {timeAgo(item.createdAt)}
                </Text>
              </View>
              <View style={styles.votes}>
                <ArrowBigUp size={14} color={c.textMuted} strokeWidth={2.25} />
                <Text style={styles.votesText}>{item.upvotes}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {shown.length > PREVIEW ? (
            <TouchableOpacity onPress={() => setShowAll((all) => !all)} accessibilityRole="button" style={styles.more}>
              <Text style={styles.explainLink}>{showAll ? 'Show less' : `Show all ${shown.length}`}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <Text style={styles.empty}>
          {kind === 'post'
            ? isMe
              ? 'Your channel posts will show here.'
              : 'No posts yet.'
            : isMe
              ? 'Your comments will show here.'
              : 'No comments yet.'}
        </Text>
      )}
    </View>
  );
};

const Part: React.FC<{ value: number; label: string }> = ({ value, label }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.part}>
      <Text style={styles.partValue}>{formatScore(value)}</Text>
      <Text style={styles.partLabel}>{label}</Text>
    </View>
  );
};

/**
 * "STRONGEST SIGNAL" showcase: the top contributor (crown) and the next two, for a channel or an
 * area. Tapping someone opens their profile.
 */
export const StrongestSignalCard: React.FC<{
  ranks: SignalRank[];
  /** e.g. "in c/frontrangelive this month" */
  scopeLabel: string;
  onOpenProfile: (handle: string) => void;
}> = ({ ranks, scopeLabel, onOpenProfile }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [top, ...rest] = ranks;
  if (!top) return null;
  return (
    <View style={styles.strongCard} testID="strongest-signal">
      <TouchableOpacity
        style={styles.strongTop}
        onPress={() => onOpenProfile(top.handle)}
        accessibilityRole="button"
        accessibilityLabel={`Strongest Signal: ${top.handle}, ${top.score} signal. Open profile`}
        testID="strongest-signal-top"
      >
        <View style={styles.strongAvatar}>
          <Text style={styles.strongInitial}>{top.handle.replace(/^@+/, '').charAt(0).toUpperCase()}</Text>
          <View style={styles.crown}>
            <Crown size={12} color={c.base} fill={c.base} strokeWidth={2.25} />
          </View>
        </View>
        <View style={styles.scoreCopy}>
          <Text style={styles.strongKicker}>STRONGEST SIGNAL</Text>
          <Text style={styles.strongHandle} numberOfLines={1}>
            {top.handle}
          </Text>
          <Text style={styles.strongMeta} numberOfLines={1}>
            {scopeLabel} · {top.upvotes} upvotes
          </Text>
        </View>
        <View style={styles.strongScore}>
          <SignalMeter bars={5} size={16} color={c.amber} />
          <Text style={styles.strongScoreText}>{formatScore(top.score)}</Text>
        </View>
      </TouchableOpacity>
      {rest.length ? (
        <View style={styles.runnersUp}>
          {rest.map((rank, index) => (
            <TouchableOpacity
              key={rank.handle}
              style={styles.runner}
              onPress={() => onOpenProfile(rank.handle)}
              accessibilityRole="button"
              accessibilityLabel={`Number ${index + 2}: ${rank.handle}, ${rank.score} signal`}
            >
              <Text style={styles.runnerPlace}>#{index + 2}</Text>
              <Text style={styles.runnerHandle} numberOfLines={1}>
                {rank.handle}
              </Text>
              <Text style={styles.runnerScore}>{formatScore(rank.score)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      gap: 6,
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.accentBorder,
      backgroundColor: c.accentTint,
    },
    chipScore: { color: c.text, fontSize: 14, fontWeight: '900' },
    chipLabel: { color: c.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    tile: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      gap: 10,
    },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    scoreIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accentTint,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    scoreCopy: { flex: 1, gap: 2 },
    scoreLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    score: { color: c.text, fontSize: 26, fontWeight: '900' },
    level: { color: c.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    split: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
    hint: { color: c.textSecondary, fontSize: 12 },
    breakdown: { flexDirection: 'row', gap: 8 },
    part: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: c.surfaceDim,
      borderWidth: 1,
      borderColor: c.border,
    },
    partValue: { color: c.text, fontSize: 16, fontWeight: '800' },
    partLabel: { color: c.textMuted, fontSize: 11, fontWeight: '700' },
    explainRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
    explainLink: { color: c.accent, fontSize: 12, fontWeight: '800' },
    explain: { color: c.textSecondary, fontSize: 12, lineHeight: 18 },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 2 },
    label: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
    segments: { flexDirection: 'row', gap: 8 },
    segment: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
    },
    segmentActive: { backgroundColor: c.violetTint, borderColor: c.violet },
    segmentText: { color: c.textMuted, fontSize: 12, fontWeight: '800' },
    segmentTextActive: { color: c.violetText },
    list: { gap: 2 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    itemCopy: { flex: 1, gap: 2 },
    itemBody: { color: c.textBody, fontSize: 13, lineHeight: 18 },
    itemMeta: { color: c.textFaint, fontSize: 11, fontWeight: '600' },
    votes: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    votesText: { color: c.textMuted, fontSize: 12, fontWeight: '800' },
    more: { paddingVertical: 6 },
    empty: { color: c.textFaint, fontSize: 13 },
    strongCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.amberBorder,
      backgroundColor: c.amberTint,
      padding: 12,
      gap: 10,
    },
    strongTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    strongAvatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: c.amber,
      backgroundColor: c.surface,
    },
    strongInitial: { color: c.text, fontSize: 18, fontWeight: '900' },
    crown: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.amber,
    },
    strongKicker: { color: c.amber, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
    strongHandle: { color: c.text, fontSize: 16, fontWeight: '800' },
    strongMeta: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
    strongScore: { alignItems: 'center', gap: 4 },
    strongScoreText: { color: c.text, fontSize: 15, fontWeight: '900' },
    runnersUp: { flexDirection: 'row', gap: 8 },
    runner: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    runnerPlace: { color: c.amber, fontSize: 12, fontWeight: '900' },
    runnerHandle: { flex: 1, color: c.textBody, fontSize: 12, fontWeight: '700' },
    runnerScore: { color: c.text, fontSize: 12, fontWeight: '900' },
  });
