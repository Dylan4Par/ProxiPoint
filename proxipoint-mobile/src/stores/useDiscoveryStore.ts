import { create } from 'zustand';
import { describeBeaconTiming, normalizeVisibility, parseBeaconTags, primaryBeaconTag, createBeaconDraft } from '../lib/beaconDraft';
import { calculateDistanceMeters } from '../lib/locationFilter';
import type {
  BeaconDraft,
  BeaconDuration,
  BeaconVisibility,
  BoundaryTierLevel,
  DropBeaconInput,
  PersistedBeacon,
  PreviewGeofence,
} from '../types/beacon';

export interface InboundProximityNode {
  id: string;
  distance_meters: number;
  latitude: number;
  longitude: number;
  status: string;
  battery_pct?: number;
  title?: string;
  category?: string;
  host?: string;
  attendees_count?: number;
}

export interface DiscoveryNode {
  id: string;
  tag: string;
  title: string;
  description?: string;
  venue: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  status: string;
  statusColor: string;
  eta: string;
  etaMode: 'walk' | 'drive';
  attendeeCount: number;
  isRsvpd: boolean;
  radii: number[];
  batteryPct?: number;
  visibility?: BeaconVisibility;
  /** Channel the Point was posted to (its page lists it; 'channel' visibility = members only). */
  channelId?: string | null;
  duration?: BeaconDuration;
  radiusMeters?: number;
  tierLevel?: BoundaryTierLevel;
  origin?: 'local';
  /** Up to 3 hashtags, main one first (e.g. ['#LiveMusic', '#Jazz']). `tag` is the main one. */
  tags?: string[];
  /** Host handle, e.g. '@rustyanchor' (used by Report → Block). */
  host?: string;
  startsAt?: string;
  endsAt?: string;
  maxAttendance?: number | null;
  requiresApproval?: boolean;
  /** Set when the host hid the exact spot; others only see the area name. */
  locationPrivacy?: { level: 'street' | 'neighborhood' | 'city'; regionName: string } | null;
  coverPhotoUri?: string | null;
  /** Other people who tapped "I'm here" (live Points only; a count, never names). */
  hereCount?: number;
  /** You tapped "I'm here". Only counts while the Point is live. */
  imHere?: boolean;
  x: number;
  y: number;
}

/** The parts of a My Drops Point that show on Discover (matches DroppedPoint). */
export interface MyPointUpdate {
  id: string;
  title: string;
  description: string;
  tags: string[];
  venue: string;
  latitude: number;
  longitude: number;
  startsAt: string;
  endsAt: string;
  coverPhotoUri: string | null;
  requiresApproval: boolean;
  maxAttendance: number | null;
  locationPrivacy: { level: string; regionName: string } | null;
}

/** "#FoodTrucks" from "FoodTrucks" or "#FoodTrucks" (case kept). */
function hashtag(tag: string): string {
  return `#${tag.replace(/^#+/, '').trim()}`;
}

export interface ViewPlace {
  /** e.g. "Denver" */
  name: string;
  /** e.g. "CO" */
  region?: string;
  latitude: number;
  longitude: number;
  /** gps = your live location, home = your home city, search = a city you looked up. */
  kind: 'gps' | 'home' | 'search';
}

export interface ViewportBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface DiscoveryState {
  tenantId: string;
  deviceId: string;
  wsEndpoint: string;
  /** Where you are (GPS when tracking, otherwise your home city). Distances are from here. */
  selfCoordinates: { latitude: number; longitude: number };
  /**
   * The place Discover is showing (your area, your home city, or a city you searched).
   * The map is drawn around it, so pins are placed relative to this, not to you.
   */
  viewPlace: ViewPlace;
  searchRadiusMeters: number;
  batteryPct: number;
  isSocketConnected: boolean;
  lastAlertTimestamp: string | null;

  viewportBounds: ViewportBounds;
  nodes: Record<string, DiscoveryNode>;
  selectedNodeId: string | null;
  selectedEventId: string;
  activeTab: 'Nearby' | 'RSVPd';
  selectedTag: string;
  tags: string[];
  previewGeofence: PreviewGeofence | null;

  // Setters & Actions
  setSocketConnected: (connected: boolean) => void;
  setSelfCoordinates: (coords: { latitude: number; longitude: number }) => void;
  /** Show Discover around another place (re-draws every pin around it). */
  setViewPlace: (place: ViewPlace) => void;
  setViewportBounds: (bounds: ViewportBounds) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEventId: (id: string) => void;
  setActiveTab: (tab: 'Nearby' | 'RSVPd') => void;
  setSelectedTag: (tag: string) => void;
  setPreviewGeofence: (preview: PreviewGeofence | null) => void;
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  toggleRsvp: (id: string) => void;
  /** "I'm here" at a live Point, or take it back. Server side: PUT/DELETE /points/:id/here. */
  toggleHere: (id: string) => void;
  dropBeacon: (input: DropBeaconInput) => string;
  /**
   * Copy changes made in My Drops (edit, tags, place, time, end) onto the Point's map pin and
   * Discover card. Ended Points come off the map.
   */
  syncMyPoint: (point: MyPointUpdate) => void;
  adoptPersistedBeacon: (saved: PersistedBeacon, draft: BeaconDraft) => string;
  updateConfig: (config: Partial<Pick<DiscoveryState, 'tenantId' | 'deviceId' | 'wsEndpoint' | 'searchRadiusMeters'>>) => void;
  syncProximityNodes: (incomingNodes: InboundProximityNode[], timestamp: string) => void;
  getVisibleNodes: () => DiscoveryNode[];
}

export const toCanvasCoordinates = (
  nodeLat: number,
  nodeLon: number,
  centerLat: number,
  centerLon: number,
  scaleFactor: number = 0.45
): { x: number; y: number } => {
  const earthRadius = 6371000;
  const rad = Math.PI / 180;
  const dLat = (nodeLat - centerLat) * rad;
  const dLon = (nodeLon - centerLon) * rad;
  const xMeters = dLon * earthRadius * Math.cos(centerLat * rad);
  const yMeters = -dLat * earthRadius;

  return {
    x: xMeters * scaleFactor + 480,
    y: yMeters * scaleFactor + 480,
  };
};

const TAG_POOL = [
  '#LiveMusic',
  '#TechMeetup',
  '#FoodTrucks',
  '#Pickleball',
  '#ArtWalk',
  '#FarmersMarket',
  '#Yoga',
  '#TriviaNight',
  '#BoardGames',
  '#Hiking',
];
const VENUE_POOL = [
  'Central Park Plaza',
  'The Rusty Anchor',
  'Downtown Tech Lab',
  'Meadow Park Courts',
  'Old Town Square',
  'Boulder Creek Pavilion',
];

const enrichNodeMetadata = (rawId: string, distanceMeters: number) => {
  const hash = rawId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const tag = TAG_POOL[hash % TAG_POOL.length];
  const venue = VENUE_POOL[hash % VENUE_POOL.length];
  const shortId = rawId.replace('node-', '').slice(0, 6).toUpperCase();

  const isLive = distanceMeters <= 500;
  const etaMinutes = Math.max(2, Math.round(distanceMeters / 80));

  return {
    tag,
    title: `${tag.replace('#', '')} Node • ${shortId}`,
    venue,
    status: isLive ? 'LIVE NOW' : `Starts in ${Math.round(distanceMeters / 50)}m`,
    statusColor: isLive ? '#10b981' : '#38bdf8',
    eta: distanceMeters > 1000 ? `${Math.round(etaMinutes / 4)} min drive` : `${etaMinutes} min walk`,
    etaMode: (distanceMeters > 1000 ? 'drive' : 'walk') as 'walk' | 'drive',
    attendeeCount: (hash % 40) + 5,
  };
};

// ---------------------------------------------------------------------------
// Sample Points, shown until the live feed (syncProximityNodes) replaces them.
// Placed in meters east/north of the default location, with times relative to app start,
// so there's always a mix of live, soon, later today and tomorrow.
// ---------------------------------------------------------------------------
const DEFAULT_SELF = { latitude: 40.061708, longitude: -105.038292 };

interface SeedPoint {
  id: string;
  title: string;
  tags: string[];
  venue: string;
  host: string;
  description: string;
  /** Meters east (+) / west (-) and north (+) / south (-) of you. Keep within about ±950. */
  east: number;
  north: number;
  /** Minutes from now (negative = already started) and length in minutes. */
  startInMin: number;
  /** Instead of startInMin: a fixed clock time, e.g. tomorrow at 18:30. */
  at?: { dayOffset: number; hour: number; minute: number };
  lengthMin: number;
  attendeeCount: number;
  maxAttendance?: number | null;
  requiresApproval?: boolean;
  isRsvpd?: boolean;
  radiusMeters: number;
  locationPrivacy?: { level: 'street' | 'neighborhood' | 'city'; regionName: string };
}

const SEED_POINTS: SeedPoint[] = [
  {
    id: 'pt-midnight-owls',
    title: 'Late Set: The Midnight Owls',
    tags: ['#LiveMusic', '#Jazz'],
    venue: 'The Rusty Anchor',
    host: '@rustyanchor',
    description: 'Two sets of late-night jazz and soul. No cover before 9, full bar, small dance floor.',
    east: -260,
    north: 180,
    startInMin: -40,
    lengthMin: 180,
    attendeeCount: 46,
    maxAttendance: 120,
    radiusMeters: 500,
  },
  {
    id: 'pt-taco-rally',
    title: 'Taco Tuesday Truck Rally',
    tags: ['#FoodTrucks', '#TacoTuesday'],
    venue: 'Central Park Plaza',
    host: '@mesa4tacos',
    description: 'Six trucks, one plaza. Birria, al pastor, vegan options and a churro stand.',
    east: 340,
    north: 420,
    startInMin: 15,
    lengthMin: 150,
    attendeeCount: 12,
    radiusMeters: 750,
  },
  {
    id: 'pt-sunset-pickleball',
    title: 'Sunset Open Play (All Levels)',
    tags: ['#Pickleball', '#OpenPlay'],
    venue: 'Meadow Park Courts',
    host: '@dinkcrew',
    description: 'Rotating doubles on four courts. Paddles to borrow. Full for tonight; check back next week.',
    east: -700,
    north: -350,
    startInMin: -20,
    lengthMin: 120,
    attendeeCount: 16,
    maxAttendance: 16,
    radiusMeters: 300,
  },
  // Two more Points at The Rusty Anchor (same spot as the Midnight Owls), so the map shows a
  // cluster bubble that opens a pick list. #LiveMusic appears twice but only once on the bubble.
  {
    id: 'pt-jazz-jam',
    title: 'Late-Night Jazz Jam',
    tags: ['#LiveMusic', '#Jazz'],
    venue: 'The Rusty Anchor',
    host: '@rustyanchor',
    description: 'Open jam after the main set. Bring your horn; house band backs anyone who sits in.',
    east: -260,
    north: 180,
    startInMin: 150,
    lengthMin: 120,
    attendeeCount: 14,
    radiusMeters: 300,
  },
  {
    id: 'pt-vinyl-night',
    title: 'Vinyl Swap & Listening Party',
    tags: ['#VinylNight', '#Records'],
    venue: 'The Rusty Anchor',
    host: '@rustyanchor',
    description: 'Bring a crate, trade a few, and hear a side or two on the big speakers.',
    east: -260,
    north: 180,
    startInMin: 75,
    lengthMin: 150,
    attendeeCount: 22,
    radiusMeters: 300,
  },
  // The Rusty Anchor's schedule later in the week: hidden from the map by the 3-day window
  // until you pick those dates in the Calendar and tap "Show on map".
  {
    id: 'pt-soul-saturday',
    title: 'Soul Revue Night',
    tags: ['#LiveMusic', '#Soul'],
    venue: 'The Rusty Anchor',
    host: '@rustyanchor',
    description: 'Seven-piece soul revue, two sets. Doors at 8.',
    east: -260,
    north: 180,
    startInMin: 0,
    at: { dayOffset: 4, hour: 20, minute: 30 },
    lengthMin: 210,
    attendeeCount: 31,
    radiusMeters: 500,
  },
  {
    id: 'pt-blues-brunch',
    title: 'Blues Brunch',
    tags: ['#LiveMusic', '#Brunch'],
    venue: 'The Rusty Anchor',
    host: '@rustyanchor',
    description: 'Acoustic blues duo, bottomless coffee, biscuits and gravy.',
    east: -260,
    north: 180,
    startInMin: 0,
    at: { dayOffset: 5, hour: 10, minute: 30 },
    lengthMin: 150,
    attendeeCount: 12,
    radiusMeters: 300,
  },
  // Close to the Farmers Market but not the same spot: the bubble zooms in to split them.
  {
    id: 'pt-kombucha-popup',
    title: 'Kombucha Tasting Pop-Up',
    tags: ['#Tasting', '#LocalFood'],
    venue: 'Boulder Creek Pavilion (east lawn)',
    host: '@creeksidemarket',
    description: 'Six small-batch brews to try, plus a make-your-own starter demo at 6:30.',
    east: 650,
    north: 195,
    startInMin: -20,
    lengthMin: 120,
    attendeeCount: 19,
    radiusMeters: 500,
  },
  {
    id: 'pt-farmers-market',
    title: 'Evening Farmers Market',
    tags: ['#FarmersMarket', '#LocalFood'],
    venue: 'Boulder Creek Pavilion',
    host: '@creeksidemarket',
    description: 'Local produce, bread, honey and flowers. Live fiddle by the fountain at 6.',
    east: 600,
    north: 150,
    startInMin: -60,
    lengthMin: 210,
    attendeeCount: 85,
    radiusMeters: 1000,
  },
  {
    id: 'pt-board-games',
    title: 'Board Game Night',
    tags: ['#BoardGames', '#Social'],
    venue: 'Meeple Café',
    host: '@meeplecafe',
    description: 'Hundreds of games to borrow, teachers on hand. Drop in solo and get matched to a table.',
    east: -150,
    north: -500,
    startInMin: -30,
    lengthMin: 240,
    attendeeCount: 22,
    maxAttendance: 40,
    isRsvpd: true,
    radiusMeters: 500,
  },
  {
    id: 'pt-open-mic',
    title: 'Open Mic: Comedy & Acoustic',
    tags: ['#OpenMic', '#Comedy', '#LiveMusic'],
    venue: 'The Laughing Goat',
    host: '@laughinggoat',
    description: 'Five-minute slots, sign-up sheet at the bar from 7. Supportive crowd, first-timers welcome.',
    east: 500,
    north: -250,
    startInMin: 75,
    lengthMin: 150,
    attendeeCount: 18,
    radiusMeters: 500,
  },
  {
    id: 'pt-creek-cleanup',
    title: 'Boulder Creek Cleanup',
    tags: ['#Volunteer', '#CreekCleanup', '#Outdoors'],
    venue: 'Boulder Creek Path',
    host: '@greenboulder',
    description: 'Gloves, grabbers and bags provided. One hour on the creek path, then coffee on us.',
    east: 250,
    north: -900,
    startInMin: 45,
    lengthMin: 90,
    attendeeCount: 9,
    maxAttendance: 30,
    radiusMeters: 750,
  },
  {
    id: 'pt-art-walk',
    title: 'First Wednesday Art Walk',
    tags: ['#ArtWalk', '#Gallery', '#LocalArtists'],
    venue: 'Old Town Square',
    host: '@oldtownarts',
    description: 'Twelve galleries open late with artist talks. Start anywhere; maps at the square.',
    east: 150,
    north: 820,
    startInMin: 120,
    lengthMin: 180,
    attendeeCount: 31,
    radiusMeters: 1000,
  },
  {
    id: 'pt-golden-hour-yoga',
    title: 'Golden Hour Yoga in the Park',
    tags: ['#Yoga', '#Outdoors'],
    venue: 'Wonderland Lake Park',
    host: '@flowwithmaya',
    description: 'Gentle flow for all levels on the lawn. Bring a mat and water. Exact spot shared with approved guests.',
    east: -450,
    north: 650,
    startInMin: 180,
    lengthMin: 60,
    attendeeCount: 9,
    maxAttendance: 20,
    requiresApproval: true,
    radiusMeters: 500,
    locationPrivacy: { level: 'neighborhood', regionName: 'Wonderland Hills' },
  },
  {
    id: 'pt-pub-trivia',
    title: 'Wednesday Pub Trivia',
    tags: ['#TriviaNight', '#Pub'],
    venue: 'The Brickhouse Tap',
    host: '@quizmasterjen',
    description: 'Six rounds, teams up to six. Prizes for first place and best team name.',
    east: 900,
    north: 300,
    startInMin: 240,
    lengthMin: 120,
    attendeeCount: 27,
    maxAttendance: 60,
    isRsvpd: true,
    radiusMeters: 750,
  },
  {
    id: 'pt-go-kotlin',
    title: 'Go & Kotlin Devs Monthly Social',
    tags: ['#TechMeetup', '#Kotlin', '#GIS'],
    venue: 'Downtown Tech Lab',
    host: '@codeandcoffee',
    description: 'Lightning talks, then pizza. This month: offline maps with PMTiles. RSVPs are approved by the host.',
    east: 900,
    north: -650,
    startInMin: 0,
    at: { dayOffset: 1, hour: 18, minute: 30 },
    lengthMin: 150,
    attendeeCount: 38,
    maxAttendance: 40,
    requiresApproval: true,
    radiusMeters: 1000,
  },
  {
    id: 'pt-sunrise-hike',
    title: 'Sunrise Ridge Hike',
    tags: ['#Hiking', '#Sunrise', '#Outdoors'],
    venue: 'Mesa Trailhead',
    host: '@trailtribe',
    description: 'Moderate 4-mile loop timed for sunrise. Headlamps required for the first stretch.',
    east: -900,
    north: 900,
    startInMin: 0,
    at: { dayOffset: 1, hour: 6, minute: 15 },
    lengthMin: 180,
    attendeeCount: 14,
    maxAttendance: 25,
    radiusMeters: 1000,
  },
];

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "LIVE NOW", "Starts in 15m", "Starts in 2h", "Today 7:30 PM" or "Tomorrow 6:15 AM". */
function seedStatus(start: Date, end: Date, now: Date): { status: string; statusColor: string } {
  if (now >= start && now < end) return { status: 'LIVE NOW', statusColor: '#10b981' };
  const minutes = Math.round((start.getTime() - now.getTime()) / 60000);
  if (minutes <= 59) return { status: `Starts in ${Math.max(1, minutes)}m`, statusColor: '#38bdf8' };
  if (minutes <= 180) return { status: `Starts in ${Math.round(minutes / 60)}h`, statusColor: '#38bdf8' };
  const sameDay = start.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = sameDay
    ? 'Today'
    : start.toDateString() === tomorrow.toDateString()
      ? 'Tomorrow'
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][start.getDay()];
  return { status: `${day} ${formatClock(start)}`, statusColor: '#94a3b8' };
}

/** Start time: fixed clock times as given; later starts rounded to the quarter hour. */
function seedStart(point: SeedPoint, now: Date): Date {
  if (point.at) {
    const start = new Date(now);
    start.setDate(start.getDate() + point.at.dayOffset);
    start.setHours(point.at.hour, point.at.minute, 0, 0);
    return start;
  }
  const start = new Date(now.getTime() + point.startInMin * 60000);
  if (point.startInMin > 180) {
    const quarter = 15 * 60000;
    return new Date(Math.round(start.getTime() / quarter) * quarter);
  }
  return start;
}

function buildSeedNodes(self = DEFAULT_SELF, now = new Date()): Record<string, DiscoveryNode> {
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos((self.latitude * Math.PI) / 180);
  const nodes: Record<string, DiscoveryNode> = {};
  SEED_POINTS.forEach((point) => {
    const latitude = self.latitude + point.north / metersPerDegLat;
    const longitude = self.longitude + point.east / metersPerDegLon;
    const { x, y } = toCanvasCoordinates(latitude, longitude, self.latitude, self.longitude);
    const distanceMeters = Math.round(Math.hypot(point.east, point.north));
    const etaMinutes = Math.max(2, Math.round(distanceMeters / 80));
    const start = seedStart(point, now);
    const end = new Date(start.getTime() + point.lengthMin * 60000);
    nodes[point.id] = {
      id: point.id,
      tag: point.tags[0],
      tags: point.tags,
      title: point.title,
      description: point.description,
      venue: point.venue,
      host: point.host,
      latitude,
      longitude,
      distanceMeters,
      ...seedStatus(start, end, now),
      eta: distanceMeters > 1000 ? `${Math.max(2, Math.round(etaMinutes / 4))} min drive` : `${etaMinutes} min walk`,
      etaMode: distanceMeters > 1000 ? 'drive' : 'walk',
      attendeeCount: point.attendeeCount,
      // Sample: about a third of those going have said they're there (only shown while live).
      hereCount: Math.floor(point.attendeeCount / 3),
      maxAttendance: point.maxAttendance ?? null,
      requiresApproval: point.requiresApproval ?? false,
      isRsvpd: point.isRsvpd ?? false,
      radii: [point.radiusMeters],
      radiusMeters: point.radiusMeters,
      locationPrivacy: point.locationPrivacy ?? null,
      // Stand-in cover photo (seeded picsum.photos stock image, the same every launch; random,
      // not on-topic). Real Points use the photo the host picked in the Drop Point sheet.
      coverPhotoUri: `https://picsum.photos/seed/${point.id}/600/600`,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      x,
      y,
    };
  });
  return nodes;
}

const INITIAL_SEED_NODES = buildSeedNodes();

/** Re-place every node: map position around `view`, distance and ETA from `self`. */
function placeNodes(
  nodes: Record<string, DiscoveryNode>,
  self: { latitude: number; longitude: number },
  view: { latitude: number; longitude: number },
): Record<string, DiscoveryNode> {
  const next: Record<string, DiscoveryNode> = {};
  Object.values(nodes).forEach((node) => {
    const { x, y } = toCanvasCoordinates(node.latitude, node.longitude, view.latitude, view.longitude);
    const distanceMeters = Math.round(calculateDistanceMeters(self.latitude, self.longitude, node.latitude, node.longitude));
    const etaMinutes = Math.max(2, Math.round(distanceMeters / 80));
    next[node.id] = {
      ...node,
      x,
      y,
      distanceMeters,
      eta: distanceMeters > 1000 ? `${Math.max(2, Math.round(etaMinutes / 4))} min drive` : `${etaMinutes} min walk`,
      etaMode: distanceMeters > 1000 ? 'drive' : 'walk',
    };
  });
  return next;
}
const FIRST_SEED_ID = SEED_POINTS[0].id;

/** "#LiveMusic" and "livemusic" match; "All" matches everything. */
function normalizeTag(tag: string): string {
  return tag.replace(/^#+/, '').trim().toLowerCase();
}

function placeLocalBeacon(
  set: (updater: (state: DiscoveryState) => Partial<DiscoveryState>) => void,
  get: () => DiscoveryState,
  id: string,
  draft: BeaconDraft,
): string {
  parseBeaconTags(draft.tags).forEach((tag) => get().addTag(tag));
  const timing = describeBeaconTiming(draft);

  set((state) => {
    const { latitude: selfLat, longitude: selfLon } = state.selfCoordinates;
    const { x, y } = toCanvasCoordinates(
      draft.latitude,
      draft.longitude,
      state.viewPlace.latitude,
      state.viewPlace.longitude,
    );
    const distanceMeters = Math.round(
      calculateDistanceMeters(selfLat, selfLon, draft.latitude, draft.longitude),
    );
    const etaMinutes = Math.max(2, Math.round(distanceMeters / 80));
    const node: DiscoveryNode = {
      id,
      tag: primaryBeaconTag(draft.tags),
      tags: parseBeaconTags(draft.tags).slice(0, 3).map(hashtag),
      title: draft.title,
      description: draft.description,
      venue: draft.venue,
      latitude: draft.latitude,
      longitude: draft.longitude,
      distanceMeters,
      status: timing.status,
      statusColor: timing.statusColor,
      eta: distanceMeters > 1000 ? `${Math.round(etaMinutes / 4)} min drive` : `${etaMinutes} min walk`,
      etaMode: distanceMeters > 1000 ? 'drive' : 'walk',
      attendeeCount: 1,
      isRsvpd: true,
      radii: [draft.radiusMeters],
      visibility: draft.visibility,
      channelId: draft.channelId ?? null,
      duration: draft.duration,
      radiusMeters: draft.radiusMeters,
      tierLevel: draft.tierLevel,
      origin: 'local',
      x,
      y,
    };

    return {
      nodes: { ...state.nodes, [id]: node },
      selectedNodeId: id,
      selectedEventId: id,
      previewGeofence: {
        latitude: draft.latitude,
        longitude: draft.longitude,
        radiusMeters: draft.radiusMeters,
      },
    };
  });

  return id;
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  tenantId: '00000000-0000-0000-0000-000000000001',
  deviceId: 'Ranger-F0A5ACCF',
  wsEndpoint: 'ws://10.0.2.2:8080/api/v1/ingest',
  selfCoordinates: DEFAULT_SELF,
  viewPlace: { name: '', latitude: DEFAULT_SELF.latitude, longitude: DEFAULT_SELF.longitude, kind: 'home' },
  searchRadiusMeters: 500,
  batteryPct: 87,

  isSocketConnected: false,
  lastAlertTimestamp: null,

  viewportBounds: { minX: 0, maxX: 1400, minY: 0, maxY: 1400 },
  nodes: INITIAL_SEED_NODES,
  selectedNodeId: FIRST_SEED_ID,
  selectedEventId: FIRST_SEED_ID,
  activeTab: 'Nearby',
  selectedTag: 'All',
  tags: [
    'All',
    '#LiveMusic',
    '#FoodTrucks',
    '#FarmersMarket',
    '#TechMeetup',
    '#Pickleball',
    '#BoardGames',
    '#TriviaNight',
    '#OpenMic',
    '#ArtWalk',
    '#Yoga',
    '#Volunteer',
    '#Hiking',
  ],
  previewGeofence: null,

  setSocketConnected: (connected) => set({ isSocketConnected: connected }),
  // Moving you: distances and walk/drive times change; the map stays where it is.
  setSelfCoordinates: (coords) =>
    set((state) => ({
      selfCoordinates: coords,
      nodes: placeNodes(state.nodes, coords, state.viewPlace),
    })),

  // Looking somewhere else: every pin is re-drawn around the new place.
  setViewPlace: (place) =>
    set((state) => ({
      viewPlace: place,
      nodes: placeNodes(state.nodes, state.selfCoordinates, place),
    })),
  setViewportBounds: (bounds) => set({ viewportBounds: bounds }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedEventId: id || FIRST_SEED_ID }),
  setSelectedEventId: (id) => set({ selectedNodeId: id, selectedEventId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedTag: (tag) => set({ selectedTag: tag }),
  setPreviewGeofence: (preview) => set({ previewGeofence: preview }),

  addTag: (tag) => {
    const cleanTag = tag.trim().startsWith('#') ? tag.trim() : `#${tag.trim()}`;
    if (!cleanTag || cleanTag === '#') return;
    set((state) => {
      if (state.tags.includes(cleanTag)) return state;
      return { tags: [...state.tags, cleanTag] };
    });
  },

  removeTag: (tag) => {
    if (tag === 'All') return;
    set((state) => ({
      tags: state.tags.filter((t) => t !== tag),
      selectedTag: state.selectedTag === tag ? 'All' : state.selectedTag,
    }));
  },

  toggleRsvp: (id) =>
    set((state) => {
      const existing = state.nodes[id];
      if (!existing) return state;
      return {
        nodes: {
          ...state.nodes,
          [id]: { ...existing, isRsvpd: !existing.isRsvpd },
        },
      };
    }),

  toggleHere: (id) =>
    set((state) => {
      const existing = state.nodes[id];
      if (!existing) return state;
      return { nodes: { ...state.nodes, [id]: { ...existing, imHere: !existing.imHere } } };
    }),

  syncMyPoint: (point) => {
    const tags = point.tags.filter((tag) => tag.replace(/^#+/, '').trim()).slice(0, 3).map(hashtag);
    // New hashtags join the filter chips (addTag skips ones already there).
    tags.forEach((tag) => {
      if (!get().tags.some((known) => normalizeTag(known) === normalizeTag(tag))) get().addTag(tag);
    });
    set((state) => {
      const existing = state.nodes[point.id];
      if (!existing) return {};
      const now = new Date();
      const start = new Date(point.startsAt);
      const end = new Date(point.endsAt);

      // Ended: take it off the map and the Discover list.
      if (now >= end) {
        const { [point.id]: _removed, ...rest } = state.nodes;
        const wasSelected = state.selectedNodeId === point.id;
        return {
          nodes: rest,
          selectedNodeId: wasSelected ? null : state.selectedNodeId,
          selectedEventId: wasSelected ? FIRST_SEED_ID : state.selectedEventId,
        };
      }

      const { latitude: selfLat, longitude: selfLon } = state.selfCoordinates;
      const { x, y } = toCanvasCoordinates(
        point.latitude,
        point.longitude,
        state.viewPlace.latitude,
        state.viewPlace.longitude,
      );
      const distanceMeters = Math.round(calculateDistanceMeters(selfLat, selfLon, point.latitude, point.longitude));
      const etaMinutes = Math.max(2, Math.round(distanceMeters / 80));
      const timing = seedStatus(start, end, now);
      const privacy = point.locationPrivacy;

      const updated: DiscoveryNode = {
        ...existing,
        title: point.title,
        description: point.description,
        tag: tags[0] ?? existing.tag,
        tags,
        venue: point.venue,
        latitude: point.latitude,
        longitude: point.longitude,
        distanceMeters,
        eta: distanceMeters > 1000 ? `${Math.round(etaMinutes / 4)} min drive` : `${etaMinutes} min walk`,
        etaMode: distanceMeters > 1000 ? 'drive' : 'walk',
        status: timing.status,
        statusColor: timing.statusColor,
        startsAt: point.startsAt,
        endsAt: point.endsAt,
        coverPhotoUri: point.coverPhotoUri,
        requiresApproval: point.requiresApproval,
        maxAttendance: point.maxAttendance,
        locationPrivacy: privacy
          ? { level: privacy.level as 'street' | 'neighborhood' | 'city', regionName: privacy.regionName }
          : null,
        x,
        y,
      };
      return { nodes: { ...state.nodes, [point.id]: updated } };
    });
  },

  dropBeacon: (input) => {
    const draft = createBeaconDraft(input);
    const id = `beacon-${Date.now().toString(36)}`;
    return placeLocalBeacon(set, get, id, draft);
  },

  adoptPersistedBeacon: (saved, draft) => {
    const adopted = createBeaconDraft({
      ...draft,
      title: saved.title || draft.title,
      description: saved.description || draft.description,
      venue: saved.venue || draft.venue,
      visibility: saved.visibility ? normalizeVisibility(saved.visibility) : draft.visibility,
      channelId: saved.channel_id ?? draft.channelId ?? null,
      latitude: saved.latitude,
      longitude: saved.longitude,
      radiusMeters: saved.radius_meters,
    });
    (saved.channels ?? []).forEach((tag) => get().addTag(tag));
    return placeLocalBeacon(set, get, saved.id, adopted);
  },

  updateConfig: (config) => set((state) => ({ ...state, ...config })),

  syncProximityNodes: (incomingNodes, timestamp) =>
    set((state) => {
      const nextNodes: Record<string, DiscoveryNode> = {};
      const { latitude: viewLat, longitude: viewLon } = state.viewPlace;

      incomingNodes.forEach((node) => {
        const existing = state.nodes[node.id];
        const { x, y } = toCanvasCoordinates(node.latitude, node.longitude, viewLat, viewLon);
        const meta = enrichNodeMetadata(node.id, node.distance_meters);

        nextNodes[node.id] = {
          id: node.id,
          distanceMeters: Math.round(node.distance_meters),
          latitude: node.latitude,
          longitude: node.longitude,
          status: node.status || meta.status,
          statusColor: meta.statusColor,
          batteryPct: node.battery_pct,
          title: node.title || existing?.title || meta.title,
          tag: node.category ? `#${node.category.replace('#', '')}` : existing?.tag || meta.tag,
          venue: node.host || existing?.venue || meta.venue,
          attendeeCount: node.attendees_count ?? existing?.attendeeCount ?? meta.attendeeCount,
          eta: meta.eta,
          etaMode: meta.etaMode,
          radii: [250, 500],
          isRsvpd: existing ? existing.isRsvpd : false,
          x,
          y,
        };
      });

      Object.values(state.nodes).forEach((node) => {
        if (node.origin === 'local' && !nextNodes[node.id]) {
          nextNodes[node.id] = node;
        }
      });

      const nodeKeys = Object.keys(nextNodes);
      let selectedId = state.selectedNodeId;
      if (!selectedId || !nextNodes[selectedId]) {
        selectedId = nodeKeys.length > 0 ? nodeKeys[0] : null;
      }

      return {
        nodes: nextNodes,
        selectedNodeId: selectedId,
        selectedEventId: selectedId || 'none',
        lastAlertTimestamp: timestamp,
      };
    }),

  getVisibleNodes: () => {
    const { nodes, viewportBounds, activeTab, selectedTag } = get();
    return Object.values(nodes).filter((node) => {
      const inBounds =
        node.x >= viewportBounds.minX &&
        node.x <= viewportBounds.maxX &&
        node.y >= viewportBounds.minY &&
        node.y <= viewportBounds.maxY;
      const inView = node.origin === 'local' || inBounds;
      if (!inView) return false;

      if (activeTab === 'RSVPd' && !node.isRsvpd) return false;
      // Matches any of the Point's hashtags, ignoring "#" and capital letters.
      if (selectedTag !== 'All') {
        const wanted = normalizeTag(selectedTag);
        const nodeTags = [node.tag, ...(node.tags ?? [])].map(normalizeTag);
        if (!nodeTags.includes(wanted)) return false;
      }

      return true;
    });
  },
}));
