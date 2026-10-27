import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Polygon, Rect } from 'react-native-svg';
import { BellRing, Check, ChevronDown, Download, Info, Send } from 'lucide-react-native';
import {
  ATTENDEE_UPDATE_COOLDOWN_MS,
  ATTENDEE_UPDATE_MAX,
  HEX_EDGE_METERS,
  INSIGHT_RANGES,
  MIN_CELL_COUNT,
  attendeeCsv,
  funnel,
  funnelWidths,
  hexBin,
  pastAttendees,
  sampleOrigins,
  buildInsights,
  eventsInRange,
  formatCount,
  seeded,
  type InsightEvent,
  type InsightRange,
} from '../../lib/hostInsights';
import { BOOST_PRICE_CENTS, isBoosted, useBoosts } from '../../lib/boost';
import { useChannels } from '../../lib/channels';
import { formatDistanceIn, useUnits } from '../../lib/units';
import { OFFENSIVE_MESSAGE, containsOffensive } from '../../lib/profanity';
import type { DroppedPoint } from '../../lib/droppedPoint';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

const GOLD = '#f59e0b';

/** Shown while you haven't hosted anything, so the page still explains itself. */
function demoEvents(now: number): InsightEvent[] {
  const day = 86400000;
  const rows: Array<[string, string[], number, boolean?]> = [
    ['Taco Tuesday Truck Rally', ['#FoodTrucks', '#TacoTuesday'], 2, true],
    ['Saturday Morning Market', ['#FarmersMarket'], 5],
    ['Trivia Night', ['#TriviaNight'], 8],
    ['Porch Blues Session', ['#LiveMusic'], 11],
    ['Food Truck Friday', ['#FoodTrucks'], 15, true],
    ['Sunset Open Play', ['#Pickleball'], 18],
    ['Catan & Friends', ['#BoardGames'], 20],
    ['Comedy Open Mic', ['#OpenMic'], 22],
    ['Mural Tour', ['#ArtWalk'], 24],
    ['Power Yoga in the Park', ['#Yoga'], 26],
    ['Trail Cleanup', ['#Volunteer'], 28],
    ['Full Moon Hike', ['#Hiking'], 29],
  ];
  return rows.map(([title, tags, daysAgo, boosted]) => ({
    id: `demo-${title}`,
    title,
    tags,
    startsAt: new Date(now - daysAgo * day + 18 * 3600000).toISOString(),
    boosted: Boolean(boosted),
    boostSpendCents: boosted ? BOOST_PRICE_CENTS * 3 : 0,
  }));
}

/**
 * Profile → Host Insights & Analytics: how your Drops did, from map views to people at the door.
 * Numbers are samples until the server records them (see lib/hostInsights.ts).
 */
export const HostInsightsScreen: React.FC<{ drops: DroppedPoint[] }> = ({ drops }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const units = useUnits();
  const now = useBoosts();
  const channels = useChannels();
  const [range, setRange] = useState<InsightRange>('30d');
  const [eventId, setEventId] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | 'range' | 'event'>(null);

  const demo = drops.length === 0;
  const allEvents: InsightEvent[] = useMemo(
    () =>
      demo
        ? demoEvents(now)
        : drops.map((d) => ({
            id: d.id,
            title: d.title,
            startsAt: d.startsAt,
            tags: d.tags.map((t) => (t.startsWith('#') ? t : `#${t}`)),
            going: d.rsvps ? d.rsvps.filter((r) => r.status === 'going').length : null,
            boosted: isBoosted(d.id, now),
            boostSpendCents: isBoosted(d.id, now) ? BOOST_PRICE_CENTS : 0,
          })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demo, drops, Math.floor(now / 3600000)],
  );
  const inRange = eventsInRange(allEvents, range, now);
  const selected = eventId ? inRange.filter((e) => e.id === eventId) : inRange;
  const data = useMemo(() => buildInsights(selected), [selected.map((e) => e.id).join('|')]);
  const rangeLabel = INSIGHT_RANGES.find((r) => r.id === range)?.label ?? '';
  const eventLabel = eventId ? inRange.find((e) => e.id === eventId)?.title ?? 'Event' : `All Events (${inRange.length})`;
  const mainTag = selected[0]?.tags[0] ?? '#YourTag';
  const joined = channels.filter((ch) => ch.joined);
  const channelSources = (joined.length ? joined : channels.slice(0, 3)).slice(0, 3).map((ch, i) => ({
    name: ch.handle ?? ch.name,
    pct: Math.round(15 + seeded(ch.id + selected.length, i) * 35),
  }));

  const flow = useMemo(() => funnel(data), [data]);
  const flowWidths = useMemo(() => funnelWidths(flow.steps), [flow]);
  const [mapOn, setMapOn] = useState(false);
  const [mapMode, setMapMode] = useState<'heat' | 'hex8' | 'hex9'>('hex8');
  const origins = useMemo(
    () => sampleOrigins(selected.map((e) => e.id).join('|') || 'none', data.travel, Math.max(40, Math.min(600, data.rsvps * 3))),
    [data],
  );
  const mapCells = useMemo(
    () => hexBin(origins, mapMode === 'heat' ? 900 : HEX_EDGE_METERS[mapMode === 'hex9' ? 9 : 8]),
    [origins, mapMode],
  );
  // Everyone who RSVP'd to your events (demo: a sample count). Sending needs the server.
  const subscribers = demo
    ? Math.round(data.rsvps * 0.8)
    : pastAttendees(drops.filter((d) => selected.some((e) => e.id === d.id)).map((d) => d.rsvps)).length;
  const [update, setUpdate] = useState('');
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [notifyError, setNotifyError] = useState('');
  const sendUpdate = () => {
    const text = update.trim();
    if (!text) return;
    if (containsOffensive(text)) {
      setNotifyError(OFFENSIVE_MESSAGE);
      return;
    }
    // Server side: POST /host/attendee-updates { eventIds, text } → push to each past attendee
    // (respecting their quiet hours and alert settings), at most once per 24 hours per host.
    setNotifyError('');
    setSentAt(Date.now());
    setUpdate('');
  };

  const exportList = () => {
    const rows = (demo ? [] : drops)
      .filter((d) => selected.some((e) => e.id === d.id))
      .flatMap((d) => (d.rsvps ?? []).map((r) => ({ event: d.title, label: r.label, status: r.status, at: null })));
    if (!rows.length) {
      void Share.share({ message: 'No RSVPs to export yet.' });
      return;
    }
    void Share.share({ title: 'Attendee check-in list', message: attendeeCsv(rows) });
  };

  const maxHour = Math.max(1, ...data.engagementByHour);
  const peakHour = data.engagementByHour.indexOf(maxHour);
  const maxArrival = Math.max(1, ...data.arrivals);
  const boostMax = data.boost ? Math.max(data.boost.organic, data.boost.boosted, 1) : 1;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;

  const pickerOptions =
    picker === 'range'
      ? INSIGHT_RANGES.map((r) => ({ id: r.id, label: r.label, on: r.id === range, pick: () => setRange(r.id) }))
      : picker === 'event'
        ? [
            { id: 'all', label: `All Events (${inRange.length})`, on: eventId == null, pick: () => setEventId(null) },
            ...inRange.map((e) => ({ id: e.id, label: e.title, on: e.id === eventId, pick: () => setEventId(e.id) })),
          ]
        : [];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} testID="host-insights">
        <View style={styles.sampleNote}>
          <Info size={14} color={c.amber} strokeWidth={2.5} />
          <Text style={styles.sampleText}>
            {demo
              ? 'Sample data: drop a Point to see your own. '
              : 'Sample numbers (RSVPs are real). '}
            Live analytics arrive with the ProxiPoint server.
          </Text>
        </View>

        <View style={styles.filters}>
          <TouchableOpacity style={styles.select} onPress={() => setPicker('range')} accessibilityRole="button" testID="insights-range">
            <Text style={styles.selectText}>{rangeLabel}</Text>
            <ChevronDown size={14} color={c.accent} strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.select, styles.selectWide]} onPress={() => setPicker('event')} accessibilityRole="button" testID="insights-event">
            <Text style={styles.selectText} numberOfLines={1}>{eventLabel}</Text>
            <ChevronDown size={14} color={c.accent} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {selected.length === 0 ? (
          <Text style={styles.muted}>No events in this period.</Text>
        ) : (
          <>
            {/* 1. Conversion drop-off funnel: each stage in sequence (widths: lib/hostInsights funnelWidths). */}
            <Text style={styles.section}>CONVERSION FUNNEL</Text>
            <View style={styles.card} testID="insights-funnel">
              {flow.steps.map((step, i) => {
                const width = data.impressions ? flowWidths[i] : 0;
                const weak = flow.bottleneck?.id === step.id;
                return (
                  <View key={step.id}>
                    {step.fromPrev != null ? (
                      <Text style={[styles.dropOff, weak && styles.dropOffWeak]}>
                        ↓ {(step.fromPrev * 100).toFixed(step.fromPrev < 0.1 ? 1 : 0)}% continue
                        {weak ? '  ·  bottleneck' : ''}
                      </Text>
                    ) : null}
                    <View style={styles.funnelRow}>
                      <View style={styles.funnelTrack}>
                        <View
                          style={[
                            styles.funnelBar,
                            { width: `${Math.round(width * 100)}%`, opacity: 1 - i * 0.15 },
                            weak && styles.funnelBarWeak,
                          ]}
                        />
                      </View>
                      <View style={styles.funnelCopy}>
                        <Text style={styles.funnelValue}>{formatCount(step.value)}</Text>
                        <Text style={styles.funnelLabel} numberOfLines={1}>{step.label}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              <Text style={styles.hint}>Each bar steps down from the one above it (views → opens on a log scale).</Text>
              {flow.bottleneck ? (
                <View style={styles.tip}>
                  <Text style={styles.tipText}>{flow.bottleneck.tip}</Text>
                </View>
              ) : (
                <Text style={styles.hint}>Every step is at or above typical rates.</Text>
              )}
            </View>
            <View style={styles.grid}>
              <Kpi value={`${(data.tapThroughRate * 100).toFixed(1)}%`} label="Tap-Through Rate" />
              <Kpi value={formatDistanceIn(data.avgTravelMeters, units) ?? '—'} label="Avg Travel Distance" />
            </View>

            {/* 2. Proximity & radius reach */}
            <Text style={styles.section}>AUDIENCE REACH RADIUS</Text>
            <View style={styles.card}>
              <View style={styles.reachRow}>
                <Svg width={96} height={96} viewBox="0 0 96 96">
                  <Circle cx={48} cy={48} r={46} fill={c.violet} opacity={0.12 + data.travel.regional * 0.5} />
                  <Circle cx={48} cy={48} r={32} fill={c.sky} opacity={0.15 + data.travel.short * 0.6} />
                  <Circle cx={48} cy={48} r={16} fill={c.green} opacity={0.25 + data.travel.walk * 0.7} />
                  <Circle cx={48} cy={48} r={3} fill={c.text} />
                </Svg>
                <View style={styles.reachList}>
                  <ReachLine color={c.green} label="Walk (< 1 mi)" value={pct(data.travel.walk)} />
                  <ReachLine color={c.sky} label="Bike / Short Drive (1–3 mi)" value={pct(data.travel.short)} />
                  <ReachLine color={c.violet} label="Regional (> 3 mi)" value={pct(data.travel.regional)} />
                </View>
              </View>
              <Text style={styles.hint}>Rings show where people who saved or went came from.</Text>

              {/* Optional map: anonymized density, as a heatmap or a hexagon grid. */}
              <View style={styles.mapToggleRow}>
                <Text style={styles.subLabel}>Origin map</Text>
                <Switch
                  value={mapOn}
                  onValueChange={setMapOn}
                  trackColor={{ false: c.borderStrong, true: c.accentTrack }}
                  thumbColor={mapOn ? c.accent : c.textMuted}
                  accessibilityLabel="Show origin map"
                  testID="insights-map-toggle"
                />
              </View>
              {mapOn ? (
                <>
                  <View style={styles.segment}>
                    {(['heat', 'hex8', 'hex9'] as const).map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.segBtn, mapMode === m && styles.segBtnOn]}
                        onPress={() => setMapMode(m)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: mapMode === m }}
                      >
                        <Text style={[styles.segText, mapMode === m && styles.segTextOn]}>
                          {m === 'heat' ? 'Heatmap' : m === 'hex8' ? 'Hex · res 8' : 'Hex · res 9'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <OriginMap mode={mapMode} cells={mapCells} />
                  <Text style={styles.hint}>
                    Anonymized: areas with fewer than {MIN_CELL_COUNT} people aren’t shown. Hexagons match H3
                    resolution {mapMode === 'hex9' ? '9 (~174 m edge)' : '8 (~461 m edge)'}; the server will send real H3 cells.
                  </Text>
                </>
              ) : null}
            </View>

            {/* 3. Boost ROI */}
            <Text style={styles.section}>
              BOOST PERFORMANCE{data.boost ? ` (⚡ ${data.boost.title})` : ''}
            </Text>
            <View style={styles.card}>
              {data.boost ? (
                <>
                  <Bar label="Organic" value={data.boost.organic} max={boostMax} color={c.textMuted} />
                  <Bar
                    label="Boosted"
                    value={data.boost.boosted}
                    max={boostMax}
                    color={GOLD}
                    suffix={` (+${data.boost.liftPct}% Lift)`}
                  />
                  <Text style={styles.hint}>
                    Spend ${(data.boost.spendCents / 100).toFixed(2)}
                    {data.boost.cpaCents != null ? ` · $${(data.boost.cpaCents / 100).toFixed(2)} per attendee` : ''}
                  </Text>
                </>
              ) : (
                <Text style={styles.muted}>No boosts in this period.</Text>
              )}
              <Text style={styles.subLabel}>Peak engagement · busiest around {hourLabel(peakHour)}</Text>
              <View style={styles.hourBars}>
                {data.engagementByHour.map((v, h) => (
                  <View key={h} style={[styles.hourBar, { height: 4 + (v / maxHour) * 46 }, h === peakHour && styles.hourBarPeak]} />
                ))}
              </View>
              <View style={styles.hourAxis}>
                {['12a', '6a', '12p', '6p', '12a'].map((t, i) => (
                  <Text key={`${t}${i}`} style={styles.axisText}>{t}</Text>
                ))}
              </View>
            </View>

            {/* 4. Tags & channels */}
            <Text style={styles.section}>AUDIENCE TAG AFFINITY</Text>
            <View style={styles.card}>
              <Text style={styles.affinity}>
                {data.tagAffinity.map((a, i) => (
                  <Text key={a.tag}>
                    {i > 0 ? '  •  ' : ''}
                    <Text style={styles.affinityTag}>{a.tag}</Text> ({a.pct}%)
                  </Text>
                ))}
              </Text>
              {data.tagAffinity[0] ? (
                <Text style={styles.hint}>
                  {data.tagAffinity[0].pct}% of your {mainTag} attendees also follow {data.tagAffinity[0].tag}.
                </Text>
              ) : null}
              {channelSources.length ? (
                <>
                  <Text style={styles.subLabel}>Channel traffic source</Text>
                  {channelSources.map((ch) => (
                    <View key={ch.name} style={styles.sourceRow}>
                      <Text style={styles.sourceName} numberOfLines={1}>{ch.name}</Text>
                      <Text style={styles.sourcePct}>{ch.pct}% of RSVPs</Text>
                    </View>
                  ))}
                </>
              ) : null}
            </View>

            {/* 5. Arrivals and export */}
            <Text style={styles.section}>PEAK HOURS · ARRIVALS</Text>
            <View style={styles.card}>
              <View style={styles.arrivalBars}>
                {data.arrivals.map((v, i) => (
                  <View key={i} style={styles.arrivalCol}>
                    <View style={[styles.arrivalBar, { height: 6 + (v / maxArrival) * 60 }]} />
                    <Text style={styles.axisText}>{i % 2 === 0 ? `+${i / 2}h` : ''}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.hint}>Check-ins per half hour from the start of the event.</Text>
            </View>

            <TouchableOpacity style={styles.exportBtn} onPress={exportList} accessibilityRole="button" testID="insights-export">
              <Download size={16} color={c.onAccent} strokeWidth={2.5} />
              <Text style={styles.exportText}>Export Attendee Check-in List (CSV)</Text>
            </TouchableOpacity>

            {/* 1-tap update to everyone who RSVP'd or checked in to your events / series. */}
            <View style={styles.notifyCard} testID="insights-notify">
              <View style={styles.notifyHead}>
                <BellRing size={18} color={c.accent} strokeWidth={2.25} />
                <View style={styles.notifyCopy}>
                  <Text style={styles.notifyTitle}>Message past attendees</Text>
                  <Text style={styles.hint}>
                    {subscribers} {subscribers === 1 ? 'person' : 'people'} who RSVP’d or checked in to your events get a push.
                  </Text>
                </View>
              </View>
              {sentAt && now - sentAt < ATTENDEE_UPDATE_COOLDOWN_MS ? (
                <Text style={styles.sentNote}>
                  Sent. You can send another update {Math.ceil((ATTENDEE_UPDATE_COOLDOWN_MS - (now - sentAt)) / 3600000)}h from now.
                </Text>
              ) : (
                <>
                  <TextInput
                    value={update}
                    onChangeText={(t) => setUpdate(t.slice(0, ATTENDEE_UPDATE_MAX))}
                    placeholder="e.g. We’re back next Tuesday, same spot!"
                    placeholderTextColor={c.textFaint}
                    style={styles.notifyInput}
                    multiline
                    testID="insights-notify-text"
                  />
                  <View style={styles.notifyFoot}>
                    <Text style={styles.hint}>{update.length} / {ATTENDEE_UPDATE_MAX} · one update per 24 hours</Text>
                    <TouchableOpacity
                      style={[styles.sendBtn, (!update.trim() || subscribers === 0) && styles.sendBtnOff]}
                      disabled={!update.trim() || subscribers === 0}
                      onPress={sendUpdate}
                      accessibilityRole="button"
                      testID="insights-notify-send"
                    >
                      <Send size={14} color={c.onAccent} strokeWidth={2.5} />
                      <Text style={styles.sendText}>Send</Text>
                    </TouchableOpacity>
                  </View>
                  {notifyError ? <Text style={styles.notifyError}>{notifyError}</Text> : null}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={picker != null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>{picker === 'range' ? 'Time period' : 'Event'}</Text>
            <ScrollView style={styles.sheetList}>
              {pickerOptions.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  style={styles.option}
                  onPress={() => {
                    o.pick();
                    setPicker(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: o.on }}
                >
                  <Text style={[styles.optionText, o.on && styles.optionTextOn]} numberOfLines={1}>{o.label}</Text>
                  {o.on ? <Check size={16} color={c.accent} strokeWidth={3} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );

  function Kpi({ value, label, sub }: { value: string; label: string; sub?: string }) {
    return (
      <View style={styles.kpi}>
        <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
        {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
      </View>
    );
  }
  function OriginMap({ mode, cells }: { mode: 'heat' | 'hex8' | 'hex9'; cells: ReturnType<typeof hexBin> }) {
    const size = 260;
    const half = size / 2;
    const scale = (half - 8) / 9500; // px per meter (the farthest crowd is ~9 km out)
    const max = Math.max(1, ...cells.map((cell) => cell.count));
    const edge = (mode === 'hex9' ? HEX_EDGE_METERS[9] : HEX_EDGE_METERS[8]) * scale;
    const hex = (cx: number, cy: number) =>
      Array.from({ length: 6 }, (_, k) => {
        const a = (Math.PI / 3) * k;
        return `${(cx + edge * Math.cos(a)).toFixed(1)},${(cy + edge * Math.sin(a)).toFixed(1)}`;
      }).join(' ');
    return (
      <View style={styles.mapBox}>
        <Svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`}>
          <Rect x={0} y={0} width={size} height={size} fill={c.mapBase} />
          {[1600, 4800, 9000].map((m) => (
            <Circle key={m} cx={half} cy={half} r={m * scale} fill="none" stroke={c.border} strokeDasharray="3 4" />
          ))}
          {mode === 'heat'
            ? cells.map((cell, i) => {
                const t = cell.count / max;
                return [3, 2, 1].map((k) => (
                  <Circle
                    key={`${i}-${k}`}
                    cx={half + cell.x * scale}
                    cy={half - cell.y * scale}
                    r={(6 + t * 16) * k * 0.6}
                    fill={t > 0.66 ? '#ef4444' : t > 0.33 ? GOLD : c.green}
                    opacity={0.12 + t * 0.18}
                  />
                ));
              })
            : cells.map((cell, i) => {
                const t = cell.count / max;
                return (
                  <Polygon
                    key={i}
                    points={hex(half + cell.x * scale, half - cell.y * scale)}
                    fill={c.accent}
                    opacity={0.15 + t * 0.75}
                    stroke={c.sheet}
                    strokeWidth={0.6}
                  />
                );
              })}
          <Circle cx={half} cy={half} r={5} fill={c.text} stroke={c.sheet} strokeWidth={2} />
        </Svg>
        <Text style={styles.mapLegend}>● Your event · rings at 1, 3 and 5.6 mi</Text>
      </View>
    );
  }
  function ReachLine({ color, label, value }: { color: string; label: string; value: string }) {
    return (
      <View style={styles.reachLine}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.reachLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.reachValue}>{value}</Text>
      </View>
    );
  }
  function Bar({ label, value, max, color, suffix = '' }: { label: string; value: number; max: number; color: string; suffix?: string }) {
    return (
      <View style={styles.barRow}>
        <Text style={styles.barLabel}>{label}</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.max(4, (value / max) * 100)}%`, backgroundColor: color }]} />
        </View>
        <Text style={styles.barValue} numberOfLines={1}>
          {formatCount(value)}
          {suffix ? <Text style={styles.barSuffix}>{suffix}</Text> : null}
        </Text>
      </View>
    );
  }
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.base },
    content: { paddingHorizontal: 16, paddingBottom: 32 },
    sampleNote: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      padding: 10,
      borderRadius: 12,
      backgroundColor: c.amberTint,
      borderWidth: 1,
      borderColor: c.amberBorder,
      marginTop: 4,
    },
    sampleText: { flex: 1, color: c.textSecondary, fontSize: 12, lineHeight: 17 },
    filters: { flexDirection: 'row', gap: 10, marginTop: 12 },
    select: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.accentBorder,
      backgroundColor: c.accentWash,
    },
    selectWide: { flex: 1, justifyContent: 'space-between' },
    selectText: { color: c.accent, fontSize: 13, fontWeight: '800', flexShrink: 1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
    kpi: {
      width: '48%',
      flexGrow: 1,
      padding: 14,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    kpiValue: { color: c.text, fontSize: 24, fontWeight: '800' },
    kpiLabel: { color: c.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 2 },
    kpiSub: { color: c.textFaint, fontSize: 11, marginTop: 2 },
    section: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 20, marginBottom: 8 },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, gap: 8 },
    muted: { color: c.textMuted, fontSize: 13, marginTop: 14 },
    hint: { color: c.textFaint, fontSize: 11, lineHeight: 15 },
    subLabel: { color: c.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 8 },
    reachRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    reachList: { flex: 1, gap: 8 },
    reachLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 9, height: 9, borderRadius: 5 },
    reachLabel: { flex: 1, color: c.textSecondary, fontSize: 13 },
    reachValue: { color: c.text, fontSize: 13, fontWeight: '800' },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    barLabel: { width: 62, color: c.textSecondary, fontSize: 12, fontWeight: '700' },
    barTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: c.border, overflow: 'hidden' },
    barFill: { height: 12, borderRadius: 6 },
    barValue: { minWidth: 54, color: c.text, fontSize: 12, fontWeight: '800', textAlign: 'right' },
    barSuffix: { color: GOLD, fontWeight: '800' },
    hourBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 52, marginTop: 4 },
    hourBar: { flex: 1, borderRadius: 2, backgroundColor: c.accentBorder },
    hourBarPeak: { backgroundColor: c.accent },
    hourAxis: { flexDirection: 'row', justifyContent: 'space-between' },
    axisText: { color: c.textFaint, fontSize: 10 },
    affinity: { color: c.textSecondary, fontSize: 13, lineHeight: 20 },
    affinityTag: { color: c.accent, fontWeight: '800' },
    sourceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    sourceName: { flex: 1, color: c.accent, fontSize: 13, fontWeight: '700' },
    sourcePct: { color: c.textSecondary, fontSize: 13 },
    arrivalBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 84 },
    arrivalCol: { flex: 1, alignItems: 'center', gap: 4 },
    arrivalBar: { width: '100%', borderRadius: 4, backgroundColor: c.green },
    dropOff: { color: c.textFaint, fontSize: 11, fontWeight: '700', marginLeft: 4, marginVertical: 3 },
    dropOffWeak: { color: c.red },
    funnelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    funnelTrack: { flex: 1, height: 22, borderRadius: 6, backgroundColor: c.border, overflow: 'hidden' },
    funnelBar: { height: 22, borderRadius: 6, backgroundColor: c.accent },
    funnelBarWeak: { backgroundColor: c.red },
    funnelCopy: { width: 108 },
    funnelValue: { color: c.text, fontSize: 15, fontWeight: '800' },
    funnelLabel: { color: c.textMuted, fontSize: 11, fontWeight: '600' },
    tip: { marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: c.amberTint, borderWidth: 1, borderColor: c.amberBorder },
    tipText: { color: c.textSecondary, fontSize: 12, lineHeight: 17, fontWeight: '600' },
    mapToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    segment: { flexDirection: 'row', gap: 6 },
    segBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: c.border },
    segBtnOn: { borderColor: c.accent, backgroundColor: c.accentTint },
    segText: { color: c.textSecondary, fontSize: 12, fontWeight: '700' },
    segTextOn: { color: c.accent, fontWeight: '800' },
    mapBox: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
    mapLegend: { color: c.textFaint, fontSize: 10, padding: 6, backgroundColor: c.surface },
    notifyCard: {
      marginTop: 12,
      padding: 14,
      gap: 10,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    notifyHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    notifyCopy: { flex: 1, gap: 2 },
    notifyTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
    notifyInput: {
      minHeight: 64,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.base,
      color: c.text,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      textAlignVertical: 'top',
    },
    notifyFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 36, borderRadius: 18, backgroundColor: c.accent },
    sendBtnOff: { opacity: 0.45 },
    sendText: { color: c.onAccent, fontSize: 13, fontWeight: '800' },
    sentNote: { color: c.green, fontSize: 13, fontWeight: '700' },
    notifyError: { color: c.red, fontSize: 12, fontWeight: '600' },
    exportBtn: {
      marginTop: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.accent,
    },
    exportText: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    backdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.5)', justifyContent: 'center', padding: 28 },
    sheet: { backgroundColor: c.sheet, borderRadius: 18, padding: 16, maxHeight: '70%' },
    sheetTitle: { color: c.text, fontSize: 16, fontWeight: '800', marginBottom: 8 },
    sheetList: { flexGrow: 0 },
    option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 12 },
    optionText: { flex: 1, color: c.textSecondary, fontSize: 15, fontWeight: '600' },
    optionTextOn: { color: c.accent, fontWeight: '800' },
  });
