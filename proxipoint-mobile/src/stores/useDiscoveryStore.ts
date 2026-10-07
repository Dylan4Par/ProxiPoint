import { create } from 'zustand';
import { assignedTags, eventMatchesMapFilter } from '../lib/beaconDrop';
import { beaconWindowStatus, clampDuration, clampStart, type BeaconVisibility } from '../lib/beaconSchedule';
import { calculateDistanceMeters } from '../lib/locationFilter';

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
  batteryPct?: number;
  x: number;
  y: number;
  visibility?: BeaconVisibility;
  startsAt?: string;
  durationMinutes?: number;
  regionName?: string;
  regionChain?: string;
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

export interface DropBeaconDraft {
  place: string;
  tags: string[];
  addressLabel: string;
  latitude: number;
  longitude: number;
  visibility: BeaconVisibility;
  startsAt: string;
  durationMinutes: number;
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

// Seed initial fallback nodes so the UI displays immediately prior to WebSocket incoming feed
const INITIAL_SEED_NODES: Record<string, DiscoveryNode> = {
  'event-1': {
    id: 'event-1',
    tag: '#LiveMusic',
    tags: ['#LiveMusic', '#FoodTrucks', '#ArtWalk'],
    title: 'The Midnight Owls • Live at The Rusty Anchor',
    venue: 'Title, Host',
    latitude: 40.0632,
    longitude: -105.0365,
    distanceMeters: 210,
    status: 'LIVE NOW',
    statusColor: '#10b981',
    eta: '5 min walk',
    etaMode: 'walk',
    attendeeCount: 45,
    isRsvpd: true,
    radii: [250, 500],
    x: 180,
    y: 220,
  },
  'event-2': {
    id: 'event-2',
    tag: '#FoodTrucks',
    tags: ['#FoodTrucks', '#Pickleball'],
    title: 'Taco Tuesday Truck Rally • Central Park Plaza',
    venue: 'Central Park Plaza',
    latitude: 40.0645,
    longitude: -105.041,
    distanceMeters: 430,
    status: 'Starts in 15m',
    statusColor: '#38bdf8',
    eta: '12+ here',
    etaMode: 'walk',
    attendeeCount: 12,
    isRsvpd: true,
    radii: [250, 500],
    x: 420,
    y: 190,
  },
  'event-3': {
    id: 'event-3',
    tag: '#TechMeetup',
    tags: ['#TechMeetup'],
    title: 'Go & Kotlin Devs • Monthly Social • Code & Coffee',
    venue: 'Downtown Tech Lab',
    latitude: 40.071,
    longitude: -105.032,
    distanceMeters: 1200,
    status: 'Tomorrow 18:00',
    statusColor: '#94a3b8',
    eta: '12 min drive',
    etaMode: 'drive',
    attendeeCount: 38,
    isRsvpd: false,
    radii: [500, 1000],
    x: 300,
    y: 480,
  },
};

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  tenantId: '00000000-0000-0000-0000-000000000001',
  deviceId: 'Ranger-F0A5ACCF',
  wsEndpoint: 'ws://10.0.2.2:8080/api/v1/ingest',
  selfCoordinates: { latitude: 40.061708, longitude: -105.038292 },
  searchRadiusMeters: 500,
  batteryPct: 87,

  isSocketConnected: false,
  lastAlertTimestamp: null,

  viewportBounds: { minX: 0, maxX: 1400, minY: 0, maxY: 1400 },
  nodes: INITIAL_SEED_NODES,
  selectedNodeId: 'event-1',
  selectedEventId: 'event-1',
  mapFocusToken: 0,
  activeTab: 'Nearby',
  selectedTag: 'All',
  tags: ['All', '#LiveMusic', '#TechMeetup', '#FoodTrucks', '#Pickleball', '#ArtWalk'],
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
    })),
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
      const scheduled = clampStart(new Date(draft.startsAt), now);
      const duration = clampDuration(draft.durationMinutes);
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
        radii: [250, 500],
        x,
        y,
        visibility: draft.visibility === 'private' ? 'private' : 'public',
        startsAt: scheduled.start.toISOString(),
        durationMinutes: duration.minutes,
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
    const { nodes, viewportBounds, activeTab, selectedTag, selectedNodeId } = get();
    return Object.values(nodes).filter((node) => {
      const inBounds =
        node.x >= viewportBounds.minX &&
        node.x <= viewportBounds.maxX &&
        node.y >= viewportBounds.minY &&
        node.y <= viewportBounds.maxY;
      if (!inBounds && node.id !== selectedNodeId) return false;
      if (activeTab === 'RSVPd' && !node.isRsvpd) return false;
      if (!eventMatchesMapFilter(node.tags, selectedTag, node.tag)) return false;
      return true;
    });
  },
}));
