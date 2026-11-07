import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Layers, MapPin, RotateCcw, UserPlus, Zap } from 'lucide-react-native';
import { EndedBadge, LiveBadge } from '../components/drops/LiveBadge';
import { activeBoost, formatTimeLeft, useBoosts } from '../lib/boost';
import { cleanVenueLabel, formatPointWhen, pointStatus, type DroppedPoint, type PointStatus } from '../lib/droppedPoint';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme/ThemeContext';

interface MyDropsScreenProps {
  drops: DroppedPoint[];
  onManage: (id: string) => void;
  onDropNew: () => void;
  /** "Drop again" on an ended Point: opens the Drop Point sheet filled in with its details. */
  onDropAgain?: (id: string) => void;
}

const BOOST_GOLD = '#f59e0b';
const BOOST_INK = '#1f1300';

const SECTIONS: Array<{ status: PointStatus; title: string }> = [
  { status: 'live', title: 'LIVE' },
  { status: 'upcoming', title: 'UPCOMING' },
  { status: 'past', title: 'PAST' },
];

export const MyDropsScreen: React.FC<MyDropsScreenProps> = ({ drops, onManage, onDropNew, onDropAgain }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const boostClock = useBoosts(); // ticks every 30s so the boost time left counts down
  const now = new Date(boostClock);

  if (drops.length === 0) {
    return (
      <View style={styles.empty} testID="my-drops-empty">
        <View style={styles.emptyIcon}>
          <Layers size={26} color={c.accent} strokeWidth={2} />
        </View>
        <Text style={styles.emptyTitle}>Drop your first Point</Text>
        <Text style={styles.emptyBody}>Points you create show up here, ready to invite, share and manage.</Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={onDropNew} accessibilityRole="button" testID="my-drops-new">
          <MapPin size={16} color={c.base} strokeWidth={2.5} />
          <Text style={styles.emptyBtnText}>DROP POINT</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="my-drops">
      <Text style={styles.screenTitle}>MY DROPS</Text>
      {SECTIONS.map(({ status, title }) => {
        const items = drops
          .filter((drop) => pointStatus(drop, now) === status)
          .sort((a, b) =>
            status === 'past'
              ? new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime()
              : new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
          );
        if (items.length === 0) return null;
        return (
          <View key={status} style={styles.section}>
            <Text style={[styles.sectionTitle, status === 'live' && styles.sectionTitleLive]}>{title}</Text>
            {items.map((drop) => {
              const boost = status === 'past' ? null : activeBoost(drop.id, boostClock);
              return (
              <TouchableOpacity
                key={drop.id}
                style={[
                  styles.row,
                  status === 'live' && styles.rowLive,
                  status === 'past' && styles.rowPast,
                  boost && styles.rowBoosted,
                ]}
                onPress={() => onManage(drop.id)}
                accessibilityRole="button"
                accessibilityLabel={`Manage ${drop.title}${boost ? ', boosted' : ''}`}
                testID={`my-drop-${drop.id}`}
              >
                <View>
                  <View style={[styles.photo, boost && styles.photoBoosted]}>
                    {drop.coverPhotoUri ? (
                      <Image source={{ uri: drop.coverPhotoUri }} style={styles.photoImage} />
                    ) : (
                      <Text style={styles.photoInitial}>{drop.title.trim().charAt(0).toUpperCase() || '•'}</Text>
                    )}
                  </View>
                  {boost ? (
                    <View style={styles.boltBadge}>
                      <Zap size={10} color={BOOST_INK} fill={BOOST_INK} strokeWidth={2} />
                    </View>
                  ) : null}
                </View>
                <View style={styles.copy}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.title, status === 'past' && styles.titlePast]} numberOfLines={1}>
                      {drop.title}
                    </Text>
                    {status === 'live' ? <LiveBadge /> : null}
                    {status === 'past' ? <EndedBadge /> : null}
                  </View>
                  <Text style={[styles.when, status === 'past' && styles.whenPast]} numberOfLines={1}>
                    {formatPointWhen(drop, now)}
                  </Text>
                  <Text style={styles.where} numberOfLines={1}>
                    {cleanVenueLabel(drop.venue)}
                  </Text>
                  {boost ? (
                    <View style={styles.boostLine} testID={`my-drop-boosted-${drop.id}`}>
                      <Zap size={11} color={BOOST_GOLD} fill={BOOST_GOLD} strokeWidth={2} />
                      <Text style={styles.boostText} numberOfLines={1}>
                        BOOSTED · {formatTimeLeft(boost.endsAt, boostClock)} left
                      </Text>
                    </View>
                  ) : null}
                </View>
                {status === 'past' && onDropAgain ? (
                  // A separate, full-size button: tapping the rest of the row still opens the ended Point.
                  <TouchableOpacity
                    style={styles.againBtn}
                    onPress={() => onDropAgain(drop.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Drop ${drop.title} again`}
                    testID={`my-drop-again-${drop.id}`}
                  >
                    <RotateCcw size={14} color={c.accent} strokeWidth={2.5} />
                    <Text style={styles.againText}>Drop again</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.meta}>
                    <View style={styles.inviteCount}>
                      <UserPlus size={12} color={c.textMuted} strokeWidth={2.25} />
                      <Text style={styles.inviteCountText}>{drop.invites.length}</Text>
                    </View>
                    <Text style={styles.manage}>{status === 'past' ? 'View ›' : 'Manage ›'}</Text>
                  </View>
                )}
              </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.base },
  content: { padding: 16, gap: 18 },
  screenTitle: { color: c.text, fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },
  section: { gap: 8 },
  sectionTitle: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  sectionTitleLive: { color: c.green },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: c.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    padding: 12,
  },
  rowLive: { borderColor: c.accent },
  rowPast: { borderColor: c.border, backgroundColor: c.surfaceDim },
  // Boosted: gold border, gold photo ring with a bolt, and a time-left line.
  rowBoosted: { borderColor: BOOST_GOLD, borderWidth: 1.5 },
  photoBoosted: { borderColor: BOOST_GOLD, borderWidth: 2 },
  boltBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: BOOST_GOLD,
    borderWidth: 2,
    borderColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boostLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  boostText: { color: BOOST_GOLD, fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  titlePast: { color: c.textSecondary },
  whenPast: { color: c.textMuted },
  photo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: c.accent,
    backgroundColor: c.base,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: '100%', height: '100%' },
  photoInitial: { color: c.accent, fontSize: 18, fontWeight: '800' },
  copy: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: c.text, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  when: { color: c.accentSoft, fontSize: 12, fontWeight: '600' },
  where: { color: c.textMuted, fontSize: 12 },
  meta: { alignItems: 'flex-end', gap: 6 },
  inviteCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inviteCountText: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
  manage: { color: c.accent, fontSize: 12, fontWeight: '800' },
  againBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.accent,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
  },
  againText: { color: c.accent, fontSize: 13, fontWeight: '800' },
  empty: {
    flex: 1,
    backgroundColor: c.base,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { color: c.text, fontSize: 17, fontWeight: '800' },
  emptyBody: { color: c.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  emptyBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.accent,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyBtnText: { color: c.base, fontSize: 13, fontWeight: '900', letterSpacing: 1.1 },
});
