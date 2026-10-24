import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useDiscoveryStore } from '../stores/useDiscoveryStore';
import { useBoosts } from '../lib/boost';
import { getTimeWindow } from '../lib/timeWindow';
import { isNodeAllowed, useModeration } from '../lib/moderation';
import {
  dayKey,
  formatRange,
  friendlyDay,
  inRange,
  MONTH_NAMES,
  monthGrid,
  occursOn,
  sameDay,
  startOfDay,
  type DayRange,
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

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Calendar: just the month and an Apply button. Tap a day, or two days for a range; dots show
 * days with Points. Apply shows those dates on Discover and the map (instead of the next 3 days).
 * It opens on the dates showing now.
 */
export const CalendarScreen: React.FC<{
  onBack: () => void;
  /** Apply: Discover and the map show these dates. */
  onShowOnMap: (range: DayRange) => void;
}> = ({ onBack, onShowOnMap }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const nowMs = useBoosts(); // ticks every 30s (also refreshes boosts)
  const moderation = useModeration();
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const today = startOfDay(now);

  // Start on the dates Discover and the map are showing now (the next 3 days by default).
  const [range, setRange] = useState<DayRange>(() => {
    const current = getTimeWindow();
    return { start: startOfDay(new Date(Math.max(current.start, today.getTime()))), end: startOfDay(new Date(current.end)) };
  });
  const [picking, setPicking] = useState(false); // waiting for the second tap of a range
  const [month, setMonth] = useState(() => ({ year: range.start.getFullYear(), month: range.start.getMonth() }));

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

  // Points in the picked dates, for the line above Apply.
  const uniqueCount = useMemo(
    () => scheduled.filter((node) => weeksDays(range).some((day) => occursOn(node, day))).length,
    [scheduled, range],
  );

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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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

      </ScrollView>

      {/* Apply */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.summaryRow}>
          <CalendarDays size={15} color={c.accent} strokeWidth={2.25} />
          <Text style={styles.summary}>
            {formatRange(range)} · {uniqueCount} Point{uniqueCount === 1 ? '' : 's'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.applyBtn, picking && styles.applyBtnWaiting]}
          onPress={() => onShowOnMap(range)}
          accessibilityRole="button"
          accessibilityHint="Discover and the map show these dates"
          testID="calendar-show-on-map"
        >
          <Text style={styles.applyText}>Apply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

/** Every day from start to end (inclusive). */
function weeksDays(range: DayRange): Date[] {
  const days: Date[] = [];
  for (let d = startOfDay(range.start); d.getTime() <= range.end.getTime(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    days.push(d);
    if (days.length > 400) break;
  }
  return days;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: { ...ABS_FILL, zIndex: 50, backgroundColor: c.base },
    topBar: { paddingHorizontal: 16, marginBottom: 6 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, alignSelf: 'flex-start' },
    backText: { color: c.text, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
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
    scrollContent: { paddingBottom: 16 },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.base,
      gap: 10,
    },
    summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    summary: { color: c.text, fontSize: 14, fontWeight: '800' },
    applyBtn: {
      height: 50,
      borderRadius: 25,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Halfway through picking a range: still works (applies the one day), just quieter.
    applyBtnWaiting: { opacity: 0.85 },
    applyText: { color: c.onAccent, fontSize: 16, fontWeight: '800' },
  });
