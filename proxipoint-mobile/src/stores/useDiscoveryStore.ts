import { create } from 'zustand';
import { DRAWER_PEEK, type DrawerSnap } from '../lib/drawerSnap';
import {
  SEED_EVENT_DETAILS,
  templateEventDetails,
  type EventDetailFields,
} from '../lib/eventDetails';

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
  x: number;
  y: number;
  summary: string;
  url: string;
  pictures: EventDetailFields['pictures'];
  startsAt: string;
  endsAt: string;
}

export interface ViewportBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  south?: number;
  north?: number;
  west?: number;
  east?: number;
}

export interface DropBeaconDraft {
  title: string;
  tag: string;
  venue: string;
  latitude: number;
  longitude: number;
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
  activeTab: 'Nearby' | 'RSVPd';
  selectedTag: string;
  tags: string[];
  drawerSnap: DrawerSnap;
  drawerHeight: number;
  headerHeight: number;
  focusToken: number;
  dropSheetOpen: boolean;
  drawerDragging: boolean;
  eventDetailId: string | null;

  // Setters & Actions
  setSocketConnected: (connected: boolean) => void;
  setSelfCoordinates: (coords: { latitude: number; longitude: number }) => void;
  setViewportBounds: (bounds: ViewportBounds) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEventId: (id: string) => void;
  setActiveTab: (tab: 'Nearby' | 'RSVPd') => void;
  setSelectedTag: (tag: string) => void;
  setDrawerSnap: (snap: DrawerSnap) => void;
  setDrawerHeight: (height: number) => void;
  setDrawerDragging: (dragging: boolean) => void;
  setHeaderHeight: (height: number) => void;
  selectNodeFromCard: (id: string) => void;
  selectNodeFromPin: (id: string) => void;
  closeEventDetail: () => void;
  setDropSheetOpen: (open: boolean) => void;
  dropBeacon: (draft: DropBeaconDraft) => string;
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

const TAG_POOL = ['#LiveMusic', '#TechMeetup', '#FoodTrucks', '#Pickleball', '#ArtWalk'];
const VENUE_POOL = [
  'Central Park Plaza',
  'The Rusty Anchor',
  'Downtown Tech Lab',
  'Meadow Park Courts',
  'Old Town Square',
  'Boulder Creek Pavilion',
];

const DEFAULT_SELF = { latitude: 40.0149, longitude: -105.2778 };

// Three Pearl Street beacons share one geocode, the same way downtown pins
// collapse onto a single coordinate in the live feed.
const DOWNTOWN_CLUSTER = { latitude: 40.0176, longitude: -105.2793 };

let beaconSeq = 0;

export function distanceMetersBetween(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const earthRadius = 6371000;
  const rad = Math.PI / 180;
  const dLat = (latitudeB - latitudeA) * rad;
  const dLon = (longitudeB - longitudeA) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latitudeA * rad) * Math.cos(latitudeB * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function etaForDistance(distanceMeters: number): { eta: string; etaMode: 'walk' | 'drive' } {
  const etaMinutes = Math.max(2, Math.round(distanceMeters / 80));
  if (distanceMeters > 1000) {
    return { eta: `${Math.round(etaMinutes / 4)} min drive`, etaMode: 'drive' };
  }
  return { eta: `${etaMinutes} min walk`, etaMode: 'walk' };
}

export function nodeInsideViewport(node: DiscoveryNode, bounds: ViewportBounds): boolean {
  const { south, north, west, east } = bounds;
  if (south != null && north != null && west != null && east != null) {
    return (
      node.latitude >= south &&
      node.latitude <= north &&
      node.longitude >= west &&
      node.longitude <= east
    );
  }
  return (
    node.x >= bounds.minX &&
    node.x <= bounds.maxX &&
    node.y >= bounds.minY &&
    node.y <= bounds.maxY
  );
}

export function filterVisibleNodes(
  nodes: DiscoveryNode[],
  viewportBounds: ViewportBounds,
  activeTab: DiscoveryState['activeTab'],
  selectedTag: string,
): DiscoveryNode[] {
  return nodes.filter((node) => {
    if (!nodeInsideViewport(node, viewportBounds)) return false;
    if (activeTab === 'RSVPd' && !node.isRsvpd) return false;
    if (selectedTag !== 'All' && node.tag !== selectedTag) return false;
    return true;
  });
}

function normalizeTag(tag: string): string {
  const cleanTag = tag.trim().startsWith('#') ? tag.trim() : `#${tag.trim()}`;
  return cleanTag === '#' ? '' : cleanTag;
}

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

function placedSeed(
  node: Omit<DiscoveryNode, 'x' | 'y' | 'distanceMeters' | 'eta' | 'etaMode'>,
): DiscoveryNode {
  const distanceMeters = Math.round(
    distanceMetersBetween(
      DEFAULT_SELF.latitude,
      DEFAULT_SELF.longitude,
      node.latitude,
      node.longitude,
    ),
  );
  const { x, y } = toCanvasCoordinates(
    node.latitude,
    node.longitude,
    DEFAULT_SELF.latitude,
    DEFAULT_SELF.longitude,
  );
  const eta = etaForDistance(distanceMeters);
  return { ...node, distanceMeters, x, y, eta: eta.eta, etaMode: eta.etaMode };
}

// Seed initial fallback nodes so the UI displays immediately prior to WebSocket incoming feed.
// Coordinates are real downtown Boulder places so the free basemap lines up with the labels.
const INITIAL_SEED_NODES: Record<string, DiscoveryNode> = {
  'event-1': placedSeed({
    id: 'event-1',
    tag: '#LiveMusic',
    title: 'The Midnight Owls • Live at The Rusty Anchor',
    venue: 'Walnut Street',
    latitude: 40.0163,
    longitude: -105.2764,
    status: 'LIVE NOW',
    statusColor: '#10b981',
    attendeeCount: 45,
    isRsvpd: true,
    radii: [250, 500],
    ...SEED_EVENT_DETAILS['event-1'],
  }),
  'event-2': placedSeed({
    id: 'event-2',
    tag: '#FoodTrucks',
    title: 'Taco Tuesday Truck Rally • Central Park Plaza',
    venue: 'Central Park',
    latitude: 40.0186,
    longitude: -105.2814,
    status: 'Starts in 15m',
    statusColor: '#38bdf8',
    attendeeCount: 12,
    isRsvpd: true,
    radii: [250, 500],
    ...SEED_EVENT_DETAILS['event-2'],
  }),
  'event-3': placedSeed({
    id: 'event-3',
    tag: '#TechMeetup',
    title: 'Go & Kotlin Devs • Monthly Social • Code & Coffee',
    venue: 'Downtown Tech Lab',
    latitude: 40.0204,
    longitude: -105.2708,
    status: 'Tomorrow 18:00',
    statusColor: '#94a3b8',
    attendeeCount: 38,
    isRsvpd: false,
    radii: [500, 1000],
    ...SEED_EVENT_DETAILS['event-3'],
  }),
};

const DOWNTOWN_SEED_NODES: Record<string, DiscoveryNode> = {
  'downtown-1': placedSeed({
    id: 'downtown-1',
    tag: '#LiveMusic',
    title: 'Pearl Street Acoustic Hour',
    venue: 'Pearl Street Mall',
    latitude: DOWNTOWN_CLUSTER.latitude,
    longitude: DOWNTOWN_CLUSTER.longitude,
    status: 'LIVE NOW',
    statusColor: '#10b981',
    attendeeCount: 64,
    isRsvpd: false,
    radii: [250, 500],
    ...SEED_EVENT_DETAILS['downtown-1'],
  }),
  'downtown-2': placedSeed({
    id: 'downtown-2',
    tag: '#FoodTrucks',
    title: 'Boulder Farmers Market',
    venue: 'Pearl Street Mall',
    latitude: DOWNTOWN_CLUSTER.latitude,
    longitude: DOWNTOWN_CLUSTER.longitude,
    status: 'LIVE NOW',
    statusColor: '#10b981',
    attendeeCount: 28,
    isRsvpd: false,
    radii: [250, 500],
    ...SEED_EVENT_DETAILS['downtown-2'],
  }),
  'downtown-3': placedSeed({
    id: 'downtown-3',
    tag: '#ArtWalk',
    title: 'Bandshell Pickup Soccer',
    venue: 'Pearl Street Mall',
    latitude: DOWNTOWN_CLUSTER.latitude,
    longitude: DOWNTOWN_CLUSTER.longitude,
    status: 'Starts in 20m',
    statusColor: '#38bdf8',
    attendeeCount: 16,
    isRsvpd: true,
    radii: [250, 500],
    ...SEED_EVENT_DETAILS['downtown-3'],
  }),
};

Object.assign(INITIAL_SEED_NODES, DOWNTOWN_SEED_NODES);

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  tenantId: '00000000-0000-0000-0000-000000000001',
  deviceId: 'Ranger-F0A5ACCF',
  wsEndpoint: 'ws://10.0.2.2:8080/api/v1/ingest',
  selfCoordinates: DEFAULT_SELF,
  searchRadiusMeters: 500,
  batteryPct: 87,

  isSocketConnected: false,
  lastAlertTimestamp: null,

  viewportBounds: {
    minX: 0,
    maxX: 1400,
    minY: 0,
    maxY: 1400,
    south: 40.005,
    west: -105.295,
    north: 40.032,
    east: -105.26,
  },
  nodes: INITIAL_SEED_NODES,
  selectedNodeId: 'downtown-1',
  selectedEventId: 'downtown-1',
  activeTab: 'Nearby',
  selectedTag: 'All',
  tags: ['All', '#LiveMusic', '#TechMeetup', '#FoodTrucks', '#Pickleball', '#ArtWalk'],
  drawerSnap: 'peek',
  drawerHeight: DRAWER_PEEK,
  headerHeight: 112,
  focusToken: 0,
  dropSheetOpen: false,
  drawerDragging: false,
  eventDetailId: null,

  setSocketConnected: (connected) => set({ isSocketConnected: connected }),
  setSelfCoordinates: (coords) => set({ selfCoordinates: coords }),
  setViewportBounds: (bounds) => set({ viewportBounds: bounds }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedEventId: id || 'event-1' }),
  setSelectedEventId: (id) => set({ selectedNodeId: id, selectedEventId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedTag: (tag) => set({ selectedTag: tag }),
  setDrawerSnap: (snap) => set({ drawerSnap: snap }),
  setDrawerDragging: (dragging) =>
    set((state) => (state.drawerDragging === dragging ? state : { drawerDragging: dragging })),
  setDrawerHeight: (height) =>
    set((state) => (Math.abs(state.drawerHeight - height) < 0.25 ? state : { drawerHeight: height })),
  setHeaderHeight: (height) =>
    set((state) => (Math.abs(state.headerHeight - height) < 0.5 ? state : { headerHeight: height })),
  selectNodeFromCard: (id) =>
    set((state) => ({
      selectedNodeId: id,
      selectedEventId: id,
      focusToken: state.focusToken + 1,
      eventDetailId: id,
    })),
  closeEventDetail: () => set({ eventDetailId: null }),
  selectNodeFromPin: (id) =>
    set({
      selectedNodeId: id,
      selectedEventId: id,
      drawerSnap: 'peek',
    }),
  setDropSheetOpen: (open) => set({ dropSheetOpen: open }),

  dropBeacon: (draft) => {
    const id = `beacon-${Date.now().toString(36)}-${(beaconSeq += 1)}`;
    set((state) => {
      const tag = normalizeTag(draft.tag) || '#LiveMusic';
      const distanceMeters = Math.round(
        distanceMetersBetween(
          state.selfCoordinates.latitude,
          state.selfCoordinates.longitude,
          draft.latitude,
          draft.longitude,
        ),
      );
      const { x, y } = toCanvasCoordinates(
        draft.latitude,
        draft.longitude,
        state.selfCoordinates.latitude,
        state.selfCoordinates.longitude,
      );
      const eta = etaForDistance(distanceMeters);
      const title = draft.title.trim() || 'Dropped beacon';
      const venue = draft.venue.trim() || 'Field beacon';
      const node: DiscoveryNode = {
        id,
        tag,
        title,
        venue,
        latitude: draft.latitude,
        longitude: draft.longitude,
        distanceMeters,
        status: 'LIVE NOW',
        statusColor: '#10b981',
        eta: eta.eta,
        etaMode: eta.etaMode,
        attendeeCount: 1,
        isRsvpd: true,
        radii: [250, 500],
        x,
        y,
        ...templateEventDetails({
          id,
          title,
          venue,
          tag,
          latitude: draft.latitude,
          longitude: draft.longitude,
        }),
      };
      return {
        nodes: { ...state.nodes, [id]: node },
        tags: state.tags.includes(tag) ? state.tags : [...state.tags, tag],
        selectedNodeId: id,
        selectedEventId: id,
        dropSheetOpen: false,
        drawerSnap: 'peek',
        focusToken: state.focusToken + 1,
      };
    });
    return id;
  },

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

        const title = node.title || existing?.title || meta.title;
        const tag = node.category ? `#${node.category.replace('#', '')}` : existing?.tag || meta.tag;
        const venue = node.host || existing?.venue || meta.venue;
        const details =
          existing?.summary && existing.url && existing.pictures && existing.startsAt && existing.endsAt
            ? {
                summary: existing.summary,
                url: existing.url,
                pictures: existing.pictures,
                startsAt: existing.startsAt,
                endsAt: existing.endsAt,
              }
            : templateEventDetails({
                id: node.id,
                title,
                venue,
                tag,
                latitude: node.latitude,
                longitude: node.longitude,
              });
        nextNodes[node.id] = {
          id: node.id,
          distanceMeters: Math.round(node.distance_meters),
          latitude: node.latitude,
          longitude: node.longitude,
          status: node.status || meta.status,
          statusColor: meta.statusColor,
          batteryPct: node.battery_pct,
          title,
          tag,
          venue,
          attendeeCount: node.attendees_count ?? existing?.attendeeCount ?? meta.attendeeCount,
          eta: meta.eta,
          etaMode: meta.etaMode,
          radii: [250, 500],
          isRsvpd: existing ? existing.isRsvpd : false,
          x,
          y,
          ...details,
        };
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
    return filterVisibleNodes(Object.values(nodes), viewportBounds, activeTab, selectedTag);
  },
}));
