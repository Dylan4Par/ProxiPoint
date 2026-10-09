import { create } from 'zustand';
import { assignedTags, eventMatchesMapFilter } from '../lib/beaconDrop';
import type { BeaconInvite } from '../lib/beaconInvite';
import { beaconWindowStatus, clampDuration, clampStart, type BeaconVisibility } from '../lib/beaconSchedule';
import { cardListBounds, DISCOVERY_PIXELS_PER_METER, pointInBounds } from '../lib/discoveryFocus';
import { calculateDistanceMeters } from '../lib/locationFilter';
import { isInOperatorDistrict } from '../lib/regions';
import { qualifiesAsVerifiedCoordinator } from '../lib/trust';

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
  tags: string[];
  title: string;
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
  alertRadiusMeters?: number;
  batteryPct?: number;
  x: number;
  y: number;
  visibility?: BeaconVisibility;
  invites?: BeaconInvite[];
  startsAt?: string;
  durationMinutes?: number;
  hostName?: string;
  hostCallsign?: string;
  hostDrops?: number;
  hostUpvotes?: number;
  isVerifiedCoordinator?: boolean;
  regionName?: string;
  regionChain?: string;
  details?: string;
  sourceUrl?: string;
}

export interface PreviewPin {
  latitude: number;
  longitude: number;
  x: number;
  y: number;
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
  selfCoordinates: { latitude: number; longitude: number };
  searchRadiusMeters: number;
  batteryPct: number;
  isSocketConnected: boolean;
  lastAlertTimestamp: string | null;

  viewportBounds: ViewportBounds;
  nodes: Record<string, DiscoveryNode>;
  selectedNodeId: string | null;
  selectedEventId: string;
  detailNodeId: string | null;
  mapFocusToken: number;
  activeTab: 'Nearby' | 'RSVPd';
  selectedTag: string;
  tags: string[];
  dropSheetOpen: boolean;
  previewPin: PreviewPin | null;

  // Setters & Actions
  setSocketConnected: (connected: boolean) => void;
  setSelfCoordinates: (coords: { latitude: number; longitude: number }) => void;
  setViewportBounds: (bounds: ViewportBounds) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEventId: (id: string) => void;
  focusCard: (id: string) => void;
  openCardDetail: (id: string) => void;
  closeCardDetail: () => void;
  setActiveTab: (tab: 'Nearby' | 'RSVPd') => void;
  setSelectedTag: (tag: string) => void;
  setDropSheetOpen: (open: boolean) => void;
  placePreviewPin: (coords: { latitude: number; longitude: number }) => void;
  clearPreviewPin: () => void;
  dropBeacon: (draft: DropBeaconDraft) => void;
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  toggleRsvp: (id: string) => void;
  updateConfig: (config: Partial<Pick<DiscoveryState, 'tenantId' | 'deviceId' | 'wsEndpoint' | 'searchRadiusMeters'>>) => void;
  syncProximityNodes: (incomingNodes: InboundProximityNode[], timestamp: string) => void;
  getVisibleNodes: () => DiscoveryNode[];
}

const toCanvasCoordinates = (
  nodeLat: number,
  nodeLon: number,
  centerLat: number,
  centerLon: number,
  scaleFactor: number = DISCOVERY_PIXELS_PER_METER
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

const TAG_POOL = ['#LiveMusic', '#TechMeetup', '#FoodTrucks', '#Pickleball', '#ArtWalk'];

export interface DropBeaconDraft {
  place: string;
  tags: string[];
  addressLabel: string;
  latitude: number;
  longitude: number;
  visibility: BeaconVisibility;
  invites?: BeaconInvite[];
  startsAt: string;
  durationMinutes: number;
  live?: boolean;
  alertRadiusMeters?: number;
  regionName?: string;
  regionChain?: string;
}
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

const DOWNTOWN_REGION = 'Downtown Boulder';
const DOWNTOWN_CHAIN = 'Downtown Boulder · Boulder · Boulder County';

function atLocal(dayOffset: number, hours: number, minutes: number): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function hostTrust(callsign: string, drops: number, upvotes: number) {
  return {
    hostCallsign: callsign,
    hostDrops: drops,
    hostUpvotes: upvotes,
    isVerifiedCoordinator: qualifiesAsVerifiedCoordinator(drops, upvotes),
  };
}

// Seed events sit inside Downtown Boulder so the default card list is the district.
const INITIAL_SEED_NODES: Record<string, DiscoveryNode> = {
  'event-1': {
    id: 'event-1',
    tag: '#LiveMusic',
    tags: ['#LiveMusic', '#FoodTrucks', '#ArtWalk'],
    title: 'Pearl Street Live Music Night',
    venue: 'Pearl Street Mall',
    latitude: 40.017458,
    longitude: -105.283779,
    distanceMeters: 180,
    status: 'LIVE NOW',
    statusColor: '#10b981',
    eta: '6 min walk',
    etaMode: 'walk',
    attendeeCount: 45,
    isRsvpd: false,
    hostName: 'The Midnight Owls',
    ...hostTrust('Viper-2', 48, 46),
    radii: [250, 500],
    x: 266,
    y: 459,
    regionName: DOWNTOWN_REGION,
    regionChain: DOWNTOWN_CHAIN,
    details:
      'Pearl Street Live Music Night is on now at Pearl Street Mall. Viper-2 is hosting. The set shares the block with the art walk, a short walk from the rest of Downtown Boulder.',
    sourceUrl: 'https://www.google.com/maps/search/?api=1&query=The+Rusty+Anchor+Boulder+CO',
  },
  'event-2': {
    id: 'event-2',
    tag: '#FoodTrucks',
    tags: ['#FoodTrucks', '#Pickleball'],
    title: 'Taco Tuesday Truck Rally • Central Park Plaza',
    venue: 'Central Park Plaza',
    latitude: 40.017874,
    longitude: -105.273221,
    distanceMeters: 433,
    status: 'Starts in 15m',
    statusColor: '#38bdf8',
    eta: '5 min walk',
    etaMode: 'walk',
    attendeeCount: 12,
    isRsvpd: true,
    startsAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    hostName: 'Central Park Eats',
    ...hostTrust('Mesa-4', 2, 2),
    radii: [250, 500],
    x: 670,
    y: 438,
    regionName: DOWNTOWN_REGION,
    regionChain: DOWNTOWN_CHAIN,
    details:
      'Taco Tuesday truck rally at Central Park Plaza. Trucks line the plaza and the rally starts in about 15 minutes. The first channel on the map is Food Trucks.',
    sourceUrl: 'https://www.google.com/maps/search/?api=1&query=Central+Park+Plaza+Boulder+CO',
  },
  'event-3': {
    id: 'event-3',
    tag: '#TechMeetup',
    tags: ['#TechMeetup'],
    title: 'Go & Kotlin Devs • Monthly Social • Code & Coffee',
    venue: 'Downtown Tech Lab',
    latitude: 40.020368,
    longitude: -105.278189,
    distanceMeters: 370,
    status: 'Scheduled',
    statusColor: '#94a3b8',
    eta: '5 min walk',
    etaMode: 'walk',
    attendeeCount: 38,
    isRsvpd: false,
    startsAt: atLocal(1, 18, 0),
    hostName: 'Boulder Devs',
    ...hostTrust('North-1', 10, 6),
    radii: [500, 1000],
    x: 480,
    y: 314,
    regionName: DOWNTOWN_REGION,
    regionChain: DOWNTOWN_CHAIN,
    details:
      'Boulder Devs hosts a monthly Go and Kotlin social, Code & Coffee, at Downtown Tech Lab. It starts tomorrow at 18:00. The meetup is public and listed on the Tech Meetup channel.',
    sourceUrl: 'https://www.google.com/maps/search/?api=1&query=Downtown+Boulder+CO',
  },
  'event-4': {
    id: 'event-4',
    tag: '#FarmersMarket',
    tags: ['#FarmersMarket'],
    title: 'Farmers Market Tasting',
    venue: 'Boulder County Farmers Market',
    latitude: 40.0168,
    longitude: -105.2762,
    distanceMeters: 210,
    status: 'Scheduled',
    statusColor: '#94a3b8',
    eta: '4 min walk',
    etaMode: 'walk',
    attendeeCount: 64,
    isRsvpd: false,
    startsAt: atLocal(1, 9, 0),
    hostName: 'Lark-9',
    ...hostTrust('Lark-9', 5, 5),
    radii: [250, 500],
    x: 556,
    y: 492,
    regionName: DOWNTOWN_REGION,
    regionChain: DOWNTOWN_CHAIN,
    details:
      'Farmers Market Tasting at the Boulder County Farmers Market. It starts tomorrow at 09:00. Lark-9 is hosting.',
    sourceUrl: 'https://www.google.com/maps/search/?api=1&query=Boulder+County+Farmers+Market',
  },
};

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  tenantId: '00000000-0000-0000-0000-000000000001',
  deviceId: 'Ranger-F0A5ACCF',
  wsEndpoint: 'ws://10.0.2.2:8080/api/v1/ingest',
  selfCoordinates: { latitude: 40.017042, longitude: -105.278189 },
  searchRadiusMeters: 500,
  batteryPct: 87,

  isSocketConnected: false,
  lastAlertTimestamp: null,

  viewportBounds: { minX: 0, maxX: 1400, minY: 0, maxY: 1400 },
  nodes: INITIAL_SEED_NODES,
  selectedNodeId: 'event-1',
  selectedEventId: 'event-1',
  detailNodeId: null,
  mapFocusToken: 0,
  activeTab: 'Nearby',
  selectedTag: 'All',
  tags: ['All', '#LiveMusic', '#TechMeetup', '#FoodTrucks', '#FarmersMarket', '#Pickleball', '#ArtWalk'],
  dropSheetOpen: false,
  previewPin: null,

  setSocketConnected: (connected) => set({ isSocketConnected: connected }),
  setSelfCoordinates: (coords) => set({ selfCoordinates: coords }),
  setViewportBounds: (bounds) => set({ viewportBounds: bounds }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedEventId: id || 'event-1' }),
  setSelectedEventId: (id) => set({ selectedNodeId: id, selectedEventId: id }),
  focusCard: (id) =>
    set((state) => ({
      selectedNodeId: id,
      selectedEventId: id || 'event-1',
      mapFocusToken: state.mapFocusToken + 1,
      detailNodeId: state.detailNodeId ? id : null,
    })),
  openCardDetail: (id) =>
    set((state) => ({
      selectedNodeId: id,
      selectedEventId: id || state.selectedEventId,
      mapFocusToken: state.mapFocusToken + 1,
      detailNodeId: id,
    })),
  closeCardDetail: () => set({ detailNodeId: null }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedTag: (tag) => set({ selectedTag: tag }),
  setDropSheetOpen: (dropSheetOpen) =>
    set(dropSheetOpen ? { dropSheetOpen } : { dropSheetOpen, previewPin: null }),
  clearPreviewPin: () => set({ previewPin: null }),
  placePreviewPin: (coords) =>
    set((state) => {
      if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return state;
      const { latitude: selfLat, longitude: selfLon } = state.selfCoordinates;
      let { x, y } = toCanvasCoordinates(coords.latitude, coords.longitude, selfLat, selfLon);
      const distanceMeters = calculateDistanceMeters(selfLat, selfLon, coords.latitude, coords.longitude);
      if (distanceMeters < 25) {
        x += 36;
        y -= 28;
      }
      return {
        previewPin: { latitude: coords.latitude, longitude: coords.longitude, x, y },
      };
    }),

  dropBeacon: (draft) =>
    set((state) => {
      const tags = assignedTags(draft.tags);
      const place = draft.place.trim();
      if (!place || tags.length === 0) return state;
      if (!Number.isFinite(draft.latitude) || !Number.isFinite(draft.longitude)) return state;

      const id = `beacon-${Date.now()}`;
      const { latitude: selfLat, longitude: selfLon } = state.selfCoordinates;
      const distanceMeters = Math.round(
        calculateDistanceMeters(selfLat, selfLon, draft.latitude, draft.longitude),
      );
      let { x, y } = toCanvasCoordinates(draft.latitude, draft.longitude, selfLat, selfLon);
      if (distanceMeters < 25) {
        x += 36;
        y -= 28;
      }
      const etaMinutes = Math.max(1, Math.round(distanceMeters / 80));
      const now = new Date();
      const scheduled = draft.live ? { start: now } : clampStart(new Date(draft.startsAt), now);
      const duration = clampDuration(draft.durationMinutes);
      const alertRadius = Number.isFinite(draft.alertRadiusMeters) ? Math.round(draft.alertRadiusMeters as number) : 500;
      const windowStatus = beaconWindowStatus(scheduled.start, now);
      const node: DiscoveryNode = {
        id,
        tag: tags[0],
        tags,
        title: place,
        venue: draft.addressLabel.trim() || place,
        latitude: draft.latitude,
        longitude: draft.longitude,
        distanceMeters,
        status: windowStatus.status,
        statusColor: windowStatus.statusColor,
        eta: distanceMeters > 1000 ? `${Math.max(1, Math.round(etaMinutes / 4))} min drive` : `${etaMinutes} min walk`,
        etaMode: distanceMeters > 1000 ? 'drive' : 'walk',
        attendeeCount: 1,
        isRsvpd: false,
        radii: [alertRadius],
        alertRadiusMeters: alertRadius,
        x,
        y,
        visibility:
          draft.visibility === 'private' ? 'private' : draft.visibility === 'tag-network' ? 'tag-network' : 'public',
        invites: draft.visibility === 'private' ? draft.invites ?? [] : [],
        startsAt: scheduled.start.toISOString(),
        durationMinutes: duration.minutes,
        hostName: state.deviceId,
        hostCallsign: state.deviceId,
        hostDrops: 0,
        hostUpvotes: 0,
        isVerifiedCoordinator: false,
        regionName: draft.regionName?.trim() || undefined,
        regionChain: draft.regionChain?.trim() || undefined,
      };

      const selectedTag =
        state.selectedTag === 'All' || tags.includes(state.selectedTag) ? state.selectedTag : tags[0];

      return {
        nodes: { ...state.nodes, [id]: node },
        selectedNodeId: id,
        selectedEventId: id,
        selectedTag,
        dropSheetOpen: false,
        previewPin: null,
      };
    }),

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

  updateConfig: (config) => set((state) => ({ ...state, ...config })),

  syncProximityNodes: (incomingNodes, timestamp) =>
    set((state) => {
      const nextNodes: Record<string, DiscoveryNode> = {};
      const { latitude: selfLat, longitude: selfLon } = state.selfCoordinates;

      incomingNodes.forEach((node) => {
        const existing = state.nodes[node.id];
        const { x, y } = toCanvasCoordinates(node.latitude, node.longitude, selfLat, selfLon);
        const meta = enrichNodeMetadata(node.id, node.distance_meters);
        const resolvedTag = node.category
          ? `#${node.category.replace('#', '')}`
          : existing?.tag || meta.tag;
        const tags =
          existing?.id.startsWith('beacon-') && existing.tags.length > 0
            ? assignedTags(existing.tags, existing.tag)
            : assignedTags([resolvedTag], resolvedTag);

        nextNodes[node.id] = {
          id: node.id,
          distanceMeters: Math.round(node.distance_meters),
          latitude: node.latitude,
          longitude: node.longitude,
          status: node.status || meta.status,
          statusColor: meta.statusColor,
          batteryPct: node.battery_pct,
          title: node.title || existing?.title || meta.title,
          tag: tags[0],
          tags,
          venue: node.host || existing?.venue || meta.venue,
          attendeeCount: node.attendees_count ?? existing?.attendeeCount ?? meta.attendeeCount,
          eta: meta.eta,
          etaMode: meta.etaMode,
          radii: [250, 500],
          isRsvpd: existing ? existing.isRsvpd : false,
          startsAt: existing?.startsAt,
          durationMinutes: existing?.durationMinutes,
          visibility: existing?.visibility,
          invites: existing?.invites,
          regionName: existing?.regionName,
          regionChain: existing?.regionChain,
          details: existing?.details,
          sourceUrl: existing?.sourceUrl,
          hostName: existing?.hostName || node.host,
          hostCallsign: existing?.hostCallsign,
          hostDrops: existing?.hostDrops,
          hostUpvotes: existing?.hostUpvotes,
          isVerifiedCoordinator: existing?.isVerifiedCoordinator,
          x,
          y,
        };
      });

      Object.entries(state.nodes).forEach(([id, node]) => {
        if (id.startsWith('beacon-') && !nextNodes[id]) {
          nextNodes[id] = node;
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
    const { nodes, viewportBounds, activeTab, selectedTag, selectedNodeId, selfCoordinates } = get();
    return Object.values(nodes).filter((node) => {
      const onScreen = pointInBounds(node.x, node.y, cardListBounds(viewportBounds));
      const inDistrict = isInOperatorDistrict(
        node.longitude,
        node.latitude,
        selfCoordinates.longitude,
        selfCoordinates.latitude,
      );
      if (!onScreen && !inDistrict && node.id !== selectedNodeId) return false;
      if (activeTab === 'RSVPd' && !node.isRsvpd) return false;
      if (!eventMatchesMapFilter(node.tags, selectedTag, node.tag)) return false;
      return true;
    });
  },
}));
