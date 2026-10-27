/**
 * Profile → Host Insights & Analytics. Pure (no React), so it's testable.
 *
 * The server doesn't record map impressions, card opens, check-ins or travel distances yet, so
 * these numbers are SAMPLES: generated the same way every time from each event's id, size and
 * boost, and labeled as samples on screen. RSVPs use the real list when an event has one.
 * Server side later: GET /host/insights?range=30d&event=<id> returning this same shape.
 */

export type InsightRange = '7d' | '30d' | '90d' | 'all';

export const INSIGHT_RANGES: Array<{ id: InsightRange; label: string; days: number | null }> = [
  { id: '7d', label: 'Last 7 Days', days: 7 },
  { id: '30d', label: 'Last 30 Days', days: 30 },
  { id: '90d', label: 'Last 90 Days', days: 90 },
  { id: 'all', label: 'All Time', days: null },
];

export interface InsightEvent {
  id: string;
  title: string;
  startsAt: string;
  tags: string[];
  /** Real RSVPs when known (going count). */
  going?: number | null;
  boosted?: boolean;
  /** Boost spend, in cents. */
  boostSpendCents?: number;
}

export interface HostInsights {
  events: number;
  impressions: number;
  opens: number;
  rsvps: number;
  checkIns: number;
  /** opens / impressions */
  tapThroughRate: number;
  /** rsvps / opens */
  rsvpRate: number;
  avgTravelMeters: number;
  /** Shares (0–1) of the crowd: walk (< 1 mi), short drive (1–3 mi), regional (> 3 mi). */
  travel: { walk: number; short: number; regional: number };
  boost: { title: string; organic: number; boosted: number; liftPct: number; spendCents: number; cpaCents: number | null } | null;
  /** Interactions by hour of day (24 values). */
  engagementByHour: number[];
  /** Arrivals over a multi-hour event, per 30 minutes from its start (8 values). */
  arrivals: number[];
  tagAffinity: Array<{ tag: string; pct: number }>;
}

/** Small deterministic hash → 0..1 (same input, same number). */
export function seeded(text: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const MILE = 1609.344;

/** Other #tags a crowd tends to follow (sample affinities). */
const AFFINITY_POOL = ['#LiveMusic', '#CraftBeer', '#DogFriendly', '#FoodTrucks', '#ArtWalk', '#Outdoors', '#TriviaNight', '#Yoga'];

export function eventsInRange<T extends { startsAt: string }>(events: T[], range: InsightRange, now = Date.now()): T[] {
  const days = INSIGHT_RANGES.find((r) => r.id === range)?.days ?? null;
  if (days == null) return events;
  const from = now - days * 86400000;
  return events.filter((e) => {
    const t = Date.parse(e.startsAt);
    return Number.isFinite(t) && t >= from && t <= now + 7 * 86400000; // include the coming week
  });
}

export function buildInsights(events: InsightEvent[]): HostInsights {
  let impressions = 0;
  let opens = 0;
  let rsvps = 0;
  let checkIns = 0;
  let walk = 0;
  let short = 0;
  let regional = 0;
  let travelSum = 0;
  const hours = Array.from({ length: 24 }, () => 0);
  const arrivals = Array.from({ length: 8 }, () => 0);
  let boost: HostInsights['boost'] = null;
  const tagCounts = new Map<string, number>();

  for (const e of events) {
    const r = (salt: number) => seeded(e.id, salt);
    const baseViews = Math.round(250 + r(1) * 900);
    const boostedViews = e.boosted ? Math.round(baseViews * (0.8 + r(2) * 0.6)) : 0;
    const views = baseViews + boostedViews;
    const eventOpens = Math.round(views * (0.04 + r(3) * 0.05));
    const going = e.going != null ? e.going : Math.round(eventOpens * (0.2 + r(4) * 0.25));
    impressions += views;
    opens += eventOpens;
    rsvps += going;
    checkIns += Math.round(going * (0.55 + r(5) * 0.3));

    const w = 0.3 + r(6) * 0.25;
    const s = 0.25 + r(7) * 0.2;
    walk += w * going;
    short += s * going;
    regional += Math.max(0, 1 - w - s) * going;
    travelSum += (w * 0.5 + s * 2 + Math.max(0, 1 - w - s) * 6) * MILE * going;

    const startHour = new Date(e.startsAt).getHours();
    for (let h = 0; h < 24; h++) {
      // Interest builds through the day and peaks a couple of hours before the start.
      const lead = (startHour - h + 24) % 24;
      hours[h] += Math.round(eventOpens * (lead >= 1 && lead <= 3 ? 0.12 : lead <= 8 ? 0.04 : 0.01) * (0.8 + r(10 + h) * 0.4));
    }
    arrivals.forEach((_, i) => {
      const shape = [0.1, 0.22, 0.24, 0.16, 0.11, 0.08, 0.05, 0.04][i];
      arrivals[i] += Math.round(going * shape * (0.85 + r(40 + i) * 0.3));
    });

    e.tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1));

    if (e.boosted && (!boost || boostedViews > boost.boosted)) {
      const spend = e.boostSpendCents ?? 0;
      boost = {
        title: e.title,
        organic: baseViews,
        boosted: boostedViews,
        liftPct: Math.round((boostedViews / Math.max(1, baseViews)) * 100),
        spendCents: spend,
        cpaCents: going > 0 && spend > 0 ? Math.round(spend / going) : null,
      };
    }
  }

  const people = Math.max(1, walk + short + regional);
  const ownTags = new Set([...tagCounts.keys()].map((t) => t.toLowerCase()));
  const key = events.map((e) => e.id).join('|') || 'none';
  const tagAffinity = AFFINITY_POOL.filter((t) => !ownTags.has(t.toLowerCase()))
    .map((tag, i) => ({ tag, pct: Math.round(25 + seeded(key, 60 + i) * 55) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  return {
    events: events.length,
    impressions,
    opens,
    rsvps,
    checkIns,
    tapThroughRate: impressions ? opens / impressions : 0,
    rsvpRate: opens ? rsvps / opens : 0,
    avgTravelMeters: rsvps ? travelSum / rsvps : 0,
    travel: { walk: walk / people, short: short / people, regional: regional / people },
    boost,
    engagementByHour: hours,
    arrivals,
    tagAffinity,
  };
}

/** Attendee check-in list as CSV (username, status, RSVP time). */
export function attendeeCsv(rows: Array<{ event: string; label: string; status: string; at?: string | null }>): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [
    'Event,Attendee,Status,RSVP Time',
    ...rows.map((r) => [r.event, r.label, r.status, r.at ?? ''].map(cell).join(',')),
  ].join('\n');
}

/** "4,820", "12.4K". */
export function formatCount(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString('en-US');
}

// ---- Conversion funnel ----------------------------------------------------------------------------

export interface FunnelStep {
  id: 'impressions' | 'opens' | 'rsvps' | 'checkIns';
  label: string;
  value: number;
  /** Share of the previous step that made it here (null for the first step). */
  fromPrev: number | null;
}

/** Typical step rates; the step furthest below its benchmark is the bottleneck. */
export const FUNNEL_BENCHMARKS = { opens: 0.05, rsvps: 0.3, checkIns: 0.65 } as const;

const BOTTLENECK_TIPS: Record<'opens' | 'rsvps' | 'checkIns', string> = {
  opens: 'Few people who see your pin open it. Try a stronger photo, title or #tags.',
  rsvps: 'People open your card but don’t RSVP. Tighten the description, time or price.',
  checkIns: 'RSVPs aren’t turning up. Send a reminder before it starts.',
};

export function funnel(data: Pick<HostInsights, 'impressions' | 'opens' | 'rsvps' | 'checkIns'>): {
  steps: FunnelStep[];
  bottleneck: { id: 'opens' | 'rsvps' | 'checkIns'; tip: string } | null;
} {
  const raw: Array<[FunnelStep['id'], string, number]> = [
    ['impressions', 'Map Impressions', data.impressions],
    ['opens', 'Card Opens', data.opens],
    ['rsvps', 'RSVPs / Going', data.rsvps],
    ['checkIns', 'Live Check-Ins', data.checkIns],
  ];
  const steps = raw.map(([id, label, value], i) => ({
    id,
    label,
    value,
    fromPrev: i === 0 ? null : raw[i - 1][2] > 0 ? value / raw[i - 1][2] : 0,
  }));
  if (!data.impressions) return { steps, bottleneck: null };
  let worst: { id: 'opens' | 'rsvps' | 'checkIns'; score: number } | null = null;
  for (const step of steps.slice(1)) {
    const id = step.id as 'opens' | 'rsvps' | 'checkIns';
    const score = (step.fromPrev ?? 0) / FUNNEL_BENCHMARKS[id];
    if (!worst || score < worst.score) worst = { id, score };
  }
  return { steps, bottleneck: worst && worst.score < 1 ? { id: worst.id, tip: BOTTLENECK_TIPS[worst.id] } : null };
}

// ---- Audience origins (anonymized) --------------------------------------------------------------

/**
 * H3-style hexagon sizes. Real H3 cells come from the server (h3 library, resolution 8 or 9); here
 * the app bins sample origins into flat hexagons of the same edge length, in meters around the
 * event, so the picture matches.
 */
export const HEX_EDGE_METERS = { 8: 461, 9: 174 } as const;
/** Cells with fewer people than this are hidden, so nobody can be singled out. */
export const MIN_CELL_COUNT = 3;

/** Sample home spots for the crowd, in meters east / north of the event (deterministic). */
export function sampleOrigins(seedKey: string, travel: HostInsights['travel'], count: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const r1 = seeded(seedKey, 100 + i);
    const r2 = seeded(seedKey, 5000 + i);
    const band = r1 < travel.walk ? 0 : r1 < travel.walk + travel.short ? 1 : 2;
    const [lo, hi] = band === 0 ? [80, 1600] : band === 1 ? [1600, 4800] : [4800, 9000];
    // A couple of neighborhoods pull the crowd one way, so the map isn't a perfect ring.
    const lobe = seeded(seedKey, 9000 + (i % 3)) * Math.PI * 2;
    const angle = (r2 < 0.55 ? lobe + (r2 - 0.27) * 1.6 : r2 * Math.PI * 2);
    const dist = lo + seeded(seedKey, 12000 + i) * (hi - lo);
    out.push({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist });
  }
  return out;
}

/** Flat-topped hex bins (axial coordinates) with counts; small cells are dropped. */
export function hexBin(points: Array<{ x: number; y: number }>, edge: number, minCount = MIN_CELL_COUNT) {
  const cells = new Map<string, { q: number; r: number; count: number }>();
  for (const p of points) {
    const qf = ((2 / 3) * p.x) / edge;
    const rf = ((-1 / 3) * p.x + (Math.sqrt(3) / 3) * p.y) / edge;
    // Cube rounding.
    let q = Math.round(qf);
    let r = Math.round(rf);
    const s = Math.round(-qf - rf);
    const dq = Math.abs(q - qf);
    const dr = Math.abs(r - rf);
    const ds = Math.abs(s - (-qf - rf));
    if (dq > dr && dq > ds) q = -r - s;
    else if (dr > ds) r = -q - s;
    const key = `${q},${r}`;
    const cell = cells.get(key) ?? { q, r, count: 0 };
    cell.count += 1;
    cells.set(key, cell);
  }
  return [...cells.values()]
    .filter((c) => c.count >= minCount)
    .map((c) => ({ ...c, x: edge * 1.5 * c.q, y: edge * Math.sqrt(3) * (c.r + c.q / 2) }));
}

// ---- Past attendees (1-tap update) ----------------------------------------------------------------

/** Everyone who RSVP'd (or was waiting) to any of these events, once each. */
export function pastAttendees(rsvpLists: Array<Array<{ id: string; label: string }> | undefined>): string[] {
  const seen = new Map<string, string>();
  rsvpLists.forEach((list) => list?.forEach((r) => seen.set(r.id || r.label, r.label)));
  return [...seen.values()];
}

/** One update every 24 hours per host, so followers aren't spammed. */
export const ATTENDEE_UPDATE_COOLDOWN_MS = 24 * 3600000;
export const ATTENDEE_UPDATE_MAX = 160;
