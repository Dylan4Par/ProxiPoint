import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, ChevronLeft, ChevronRight, Map as MapIcon, Zap } from 'lucide-react-native';
import { useDiscoveryStore } from '../stores/useDiscoveryStore';
import { CategoryBadge } from '../components/discovery/CategoryBadge';
import { LiveBadge } from '../components/drops/LiveBadge';
import { isBoosted, useBoosts } from '../lib/boost';
import { isLiveNode } from '../lib/liveStatus';
import { isNodeAllowed, useModeration } from '../lib/moderation';
import {
  dayKey,
  formatClock,
  formatRange,
  friendlyDay,
  inRange,
  MONTH_NAMES,
  monthGrid,
  occursOn,
  quickRange,
  rangeDays,
  sameDay,
  startOfDay,
  type DayRange,
  type QuickRange,
} from '../lib/calendarRange';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme/ThemeContext';

/**
 * Fills the parent edge to edge. Written out by hand because StyleSheet.absoluteFillObject
 * was removed in newer React Native, which silently drops the positioning.
 */
const ABS_FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

interface CalNode {
  id: string;
  title?: string;
  tag?: string;
  tags?: string[];
  venue?: string;
  startsAt?: string;
  endsAt?: string;
  origin?: string;
  isRsvpd?: boolean;
  coverPhotoUri?: string | null;
  locationPrivacy?: { regionName?: string } | null;
}

const QUICK: Array<{ id: QuickRange; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'weekend', label: 'This weekend' },
  { id: 'week', label: 'Next 7 days' },
];

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const GOLD = '#f59e0b';

/**
 * Discover → Calendar: every scheduled Point by day. Tap a day, or tap two days for a range,
 * or use the quick ranges. Tapping a Point shows it on the map with its details open.
 */
export const CalendarScreen: React.FC<{
  onBack: () => void;
  onOpenPoint: (id: string) => void;
  /** "Show on map": Discover shows these dates instead of the next 3 days. */
  onShowOnMap?: (range: DayRange) => void;
}> = ({ onBack, onOpenPoint, onShowOnMap }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const nowMs = useBoosts(); // ticks every 30s (also refreshes boosts)
  const moderation = useModeration();
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const today = startOfDay(now);

  const [range, setRange] = useState<DayRange>(() => quickRange('week'));
  const [picking, setPicking] = useState(false); // waiting for the second tap of a range
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const nodes = useDiscoveryStore((state) => state.nodes) as unknown as Record<string, CalNode>;
  // Scheduled Points you can see that haven't ended.
  const scheduled = useMemo(
    () =>
      Object.values(nodes ?? {})
        .filter((node) => node?.startsAt && isNodeAllowed(node))
        .filter((node) => !node.endsAt || new Date(node.endsAt).getTime() > nowMs)
        .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))),
    [nodes, nowMs, moderation],
  );

  // How many Points on each day of the month shown (for the dots).
  const weeks = useMemo(() => monthGrid(month.year, month.month), [month]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    weeks.flat().forEach((day) => {
      if (!day) return;
      const n = scheduled.filter((node) => occursOn(node, day)).length;
      if (n) map.set(dayKey(day), n);
    });
    return map;
  }, [weeks, scheduled]);

  const days = rangeDays(range)
    .map((day) => ({ day, points: scheduled.filter((node) => occursOn(node, day)) }))
    .filter((group) => group.points.length);
  const uniqueCount = new Set(days.flatMap((group) => group.points.map((p) => p.id))).size;

  const tapDay = (day: Date) => {
    if (day.getTime() < today.getTime()) return;
    if (picking && day.getTime() > range.start.getTime()) {
      setRange({ start: range.start, end: day });
      setPicking(false);
    } else if (picking && day.getTime() < range.start.getTime()) {
      setRange({ start: day, end: range.start });
      setPicking(false);
    } else if (picking && sameDay(day, range.start)) {
      setPicking(false); // second tap on the same day: just that day
    } else {
      setRange({ start: day, end: day });
      setPicking(true);
    }
  };

  const chooseQuick = (kind: QuickRange) => {
    const next = quickRange(kind, now);
    setRange(next);
    setPicking(false);
    setMonth({ year: next.start.getFullYear(), month: next.start.getMonth() });
  };

  const activeQuick = QUICK.find(({ id }) => {
    const q = quickRange(id, now);
    return !picking && sameDay(q.start, range.start) && sameDay(q.end, range.end);
  })?.id;

  const stepMonth = (step: number) =>
    setMonth(({ year, month: m }) => {
      const d = new Date(year, m + step, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  const atCurrentMonth = month.year === today.getFullYear() && month.month === today.getMonth();

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 8 }]} testID="calendar-screen">
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityRole="button" testID="calendar-back">
          <ChevronLeft size={20} color={c.text} strokeWidth={2.5} />
          <Text style={styles.backText}>CALENDAR</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
          {QUICK.map(({ id, label }) => {
            const on = activeQuick === id;
            return (
              <TouchableOpacity
                key={id}
                style={[styles.quick, on && styles.quickOn]}
                onPress={() => chooseQuick(id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                testID={`calendar-quick-${id}`}
              >
                <Text style={[styles.quickText, on && styles.quickTextOn]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Month */}
        <View style={styles.monthCard}>
          <View style={styles.monthHeader}>
            <TouchableOpacity
              onPress={() => stepMonth(-1)}
              disabled={atCurrentMonth}
              style={[styles.monthNav, atCurrentMonth && styles.monthNavOff]}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <ChevronLeft size={18} color={c.text} strokeWidth={2.5} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {MONTH_NAMES[month.month]} {month.year}
            </Text>
            <TouchableOpacity
              onPress={() => stepMonth(1)}
              style={styles.monthNav}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <ChevronRight size={18} color={c.text} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_LETTERS.map((letter, i) => (
              <Text key={i} style={styles.weekday}>
                {letter}
              </Text>
            ))}
          </View>

          {weeks.map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((day, di) => {
                if (!day) return <View key={di} style={styles.cell} />;
                const past = day.getTime() < today.getTime();
                const selected = inRange(day, range);
                const isStart = sameDay(day, range.start);
                const isEnd = sameDay(day, range.end);
                const single = isStart && isEnd;
                const count = counts.get(dayKey(day)) ?? 0;
                return (
                  <TouchableOpacity
                    key={di}
                    style={styles.cell}
                    onPress={() => tapDay(day)}
                    disabled={past}
                    accessibilityRole="button"
                    accessibilityLabel={`${friendlyDay(day, now)}${count ? `, ${count} Point${count === 1 ? '' : 's'}` : ''}`}
                    accessibilityState={{ selected, disabled: past }}
                  >
                    {/* Band behind a range (half-width on the ends) */}
                    {selected && !single ? (
                      <View
                        style={[
                          styles.band,
                          isStart && styles.bandStart,
                          isEnd && styles.bandEnd,
                          di === 0 && styles.bandRowStart,
                          di === 6 && styles.bandRowEnd,
                        ]}
                      />
                    ) : null}
                    <View
                      style={[
                        styles.dayCircle,
                        sameDay(day, today) && styles.dayToday,
                        (isStart || isEnd) && styles.dayEdge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          past && styles.dayTextPast,
                          selected && styles.dayTextSelected,
                          (isStart || isEnd) && styles.dayTextEdge,
                        ]}
                      >
                        {day.getDate()}
                      </Text>
                    </View>
                    <View style={styles.dots}>
                      {Array.from({ length: Math.min(3, count) }).map((_, i) => (
                        <View key={i} style={[styles.dot, (isStart || isEnd) && styles.dotOnEdge]} />
                      ))}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <Text style={styles.hint}>
            {picking ? 'Tap another day to make a range, or the same day again for just that day.' : 'Tap a day, or two days for a range.'}
          </Text>
        </View>

        {/* Points in the range */}
        <View style={styles.summaryRow}>
          <CalendarDays size={15} color={c.accent} strokeWidth={2.25} />
          <Text style={styles.summary}>
            {formatRange(range)} · {uniqueCount} Point{uniqueCount === 1 ? '' : 's'}
          </Text>
        </View>
        {onShowOnMap ? (
          <TouchableOpacity
            style={styles.showOnMap}
            onPress={() => onShowOnMap(range)}
            accessibilityRole="button"
            accessibilityHint="The map normally shows the next 3 days"
            testID="calendar-show-on-map"
          >
            <MapIcon size={16} color={c.accent} strokeWidth={2.25} />
            <Text style={styles.showOnMapText}>SHOW THESE DATES ON THE MAP</Text>
          </TouchableOpacity>
        ) : null}

        {days.length === 0 ? (
          <Text style={styles.empty}>Nothing scheduled {sameDay(range.start, range.end) ? 'that day' : 'in these dates'} yet.</Text>
        ) : (
          days.map(({ day, points }) => (
            <View key={dayKey(day)} style={styles.dayGroup}>
              <Text style={styles.dayHeader}>{friendlyDay(day, now).toUpperCase()}</Text>
              {points.map((point) => {
                const start = new Date(String(point.startsAt));
                const live = isLiveNode(point);
                const boosted = isBoosted(point.id, nowMs);
                // On later days of a multi-day Point, say it's continuing.
                const continuing = start.getTime() < day.getTime();
                const where = point.locationPrivacy?.regionName
                  ? `Somewhere in ${point.locationPrivacy.regionName}`
                  : point.venue ?? '';
                const mainTag = (Array.isArray(point.tags) && point.tags[0]) || point.tag || '';
                return (
                  <TouchableOpacity
                    key={`${dayKey(day)}-${point.id}`}
                    style={[styles.row, boosted && styles.rowBoosted]}
                    onPress={() => onOpenPoint(point.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${point.title}, ${live ? 'live now' : formatClock(start)}`}
                    testID={`calendar-point-${point.id}`}
                  >
                    <View style={styles.timeCol}>
                      {live && sameDay(day, today) ? (
                        <Text style={styles.liveTime}>NOW</Text>
                      ) : (
                        <Text style={styles.time}>{continuing ? 'All day' : formatClock(start)}</Text>
                      )}
                    </View>
                    <CategoryBadge tag={mainTag} title={point.title} photoUri={point.coverPhotoUri ?? null} size={40} />
                    <View style={styles.rowCopy}>
                      <View style={styles.tagLine}>
                        <Text style={styles.tag} numberOfLines={1}>
                          {mainTag}
                        </Text>
                        {boosted ? <Zap size={11} color={GOLD} fill={GOLD} strokeWidth={2} /> : null}
                        {point.isRsvpd ? <Text style={styles.going}>GOING</Text> : null}
                      </View>
                      <Text style={styles.title} numberOfLines={1}>
                        {point.title}
                      </Text>
                      <Text style={styles.where} numberOfLines={1}>
                        {where}
                      </Text>
                      {live && sameDay(day, today) ? <LiveBadge label="LIVE NOW" /> : null}
                    </View>
                    <ChevronRight size={16} color={c.iconFaint} strokeWidth={2.25} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: { ...ABS_FILL, zIndex: 50, backgroundColor: c.base },
    topBar: { paddingHorizontal: 16, marginBottom: 6 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, alignSelf: 'flex-start' },
    backText: { color: c.text, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
    quickRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
    quick: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    quickOn: { borderColor: c.accent, backgroundColor: c.accentTint },
    quickText: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
    quickTextOn: { color: c.accent },
    monthCard: {
      marginHorizontal: 16,
      marginTop: 4,
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
    },
    monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    monthNav: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    monthNavOff: { opacity: 0.25 },
    monthTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    weekRow: { flexDirection: 'row' },
    weekday: { flex: 1, textAlign: 'center', color: c.textMuted, fontSize: 11, fontWeight: '800', paddingVertical: 4 },
    cell: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 3 },
    band: { position: 'absolute', top: 3, height: 34, left: 0, right: 0, backgroundColor: c.accentTint },
    bandStart: { left: '50%' },
    bandEnd: { right: '50%' },
    bandRowStart: { borderTopLeftRadius: 17, borderBottomLeftRadius: 17 },
    bandRowEnd: { borderTopRightRadius: 17, borderBottomRightRadius: 17 },
    dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    dayToday: { borderWidth: 1.5, borderColor: c.accent },
    dayEdge: { backgroundColor: c.accent, borderWidth: 0 },
    dayText: { color: c.text, fontSize: 14, fontWeight: '600' },
    dayTextPast: { color: c.textFaint },
    dayTextSelected: { color: c.accent, fontWeight: '800' },
    dayTextEdge: { color: c.base, fontWeight: '900' },
    dots: { flexDirection: 'row', gap: 2, height: 5, marginTop: 2 },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: c.accent },
    dotOnEdge: { backgroundColor: c.accentDeep },
    hint: { color: c.textMuted, fontSize: 11, textAlign: 'center', marginTop: 6 },
    showOnMap: {
      marginHorizontal: 16,
      marginTop: 6,
      marginBottom: 4,
      minHeight: 42,
      borderRadius: 21,
      borderWidth: 1.5,
      borderColor: c.accent,
      backgroundColor: c.accentTint,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    showOnMapText: { color: c.accent, fontSize: 12.5, fontWeight: '900', letterSpacing: 1 },
    summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginTop: 18, marginBottom: 6 },
    summary: { color: c.text, fontSize: 15, fontWeight: '800' },
    empty: { color: c.textMuted, fontSize: 13, paddingHorizontal: 16, marginTop: 6 },
    dayGroup: { paddingHorizontal: 16, marginTop: 10, gap: 8 },
    dayHeader: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
    },
    rowBoosted: { borderColor: GOLD },
    timeCol: { width: 58 },
    time: { color: c.text, fontSize: 12, fontWeight: '800' },
    liveTime: { color: c.green, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
    rowCopy: { flex: 1, gap: 2, alignItems: 'flex-start' },
    tagLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    tag: { color: c.accentDeep, fontSize: 11, fontWeight: '800' },
    going: { color: c.green, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
    title: { color: c.text, fontSize: 14, fontWeight: '800' },
    where: { color: c.textMuted, fontSize: 12 },
  });
