import { create } from 'zustand';

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
  startsAt: string | null;
  batteryPct?: number;
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
  activeTab: 'Nearby' | 'RSVPd';
  shellTab: 'discover' | 'activity';
  selectedTag: string;
  tags: string[];

  // Setters & Actions
  setSocketConnected: (connected: boolean) => void;
  setSelfCoordinates: (coords: { latitude: number; longitude: number }) => void;
  setViewportBounds: (bounds: ViewportBounds) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEventId: (id: string) => void;
  setActiveTab: (tab: 'Nearby' | 'RSVPd') => void;
  setShellTab: (tab: 'discover' | 'activity') => void;
  setSelectedTag: (tag: string) => void;
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

const TAG_POOL = ['#LiveMusic', '#TechMeetup', '#FoodAndDrink', '#FarmersMarket', '#Fitness', '#Outdoor', '#PostGIS', '#Music'];

const atLocal = (dayOffset: number, hours: number, minutes: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

const futureSlot = (dayOffset: number, hours: number, minutes: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() <= Date.now()) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString();
};
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
  const dayOffset = hash % 3;
  const hour = 8 + (hash % 10);
  const minute = (hash % 2) * 30;

  return {
    tag,
    title: `${tag.replace('#', '')} Node • ${shortId}`,
    venue,
    status: isLive ? 'LIVE NOW' : 'Scheduled',
    statusColor: isLive ? '#10b981' : '#38bdf8',
    startsAt: isLive ? new Date(Date.now() - 15 * 60 * 1000).toISOString() : futureSlot(dayOffset, hour, minute),
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
    title: 'Pearl Street Live Music Night',
    venue: 'Pearl Street Mall',
    latitude: 40.0632,
    longitude: -105.0365,
    distanceMeters: 180,
    status: 'LIVE NOW',
    statusColor: '#10b981',
    startsAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
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
    tag: '#FoodAndDrink',
    title: 'Rayback Collective Pop-up',
    venue: 'Rayback Collective',
    latitude: 40.0645,
    longitude: -105.041,
    distanceMeters: 420,
    status: 'LIVE NOW',
    statusColor: '#10b981',
    startsAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    eta: '11 min walk',
    etaMode: 'walk',
    attendeeCount: 28,
    isRsvpd: true,
    radii: [250, 500],
    x: 420,
    y: 190,
  },
  'event-3': {
    id: 'event-3',
    tag: '#TechMeetup',
    title: 'Boulder Tech & GIS Meetup',
    venue: 'Downtown Tech Lab',
    latitude: 40.071,
    longitude: -105.032,
    distanceMeters: 1200,
    status: 'Scheduled',
    statusColor: '#38bdf8',
    startsAt: futureSlot(0, 18, 0),
    eta: '12 min drive',
    etaMode: 'drive',
    attendeeCount: 38,
    isRsvpd: false,
    radii: [500, 1000],
    x: 300,
    y: 400,
  },
  'event-4': {
    id: 'event-4',
    tag: '#FarmersMarket',
    title: 'Farmers Market Tasting',
    venue: 'Boulder County Farmers Market',
    latitude: 40.016,
    longitude: -105.281,
    distanceMeters: 860,
    status: 'Scheduled',
    statusColor: '#f59e0b',
    startsAt: atLocal(1, 9, 0),
    eta: '9 min drive',
    etaMode: 'drive',
    attendeeCount: 64,
    isRsvpd: false,
    radii: [250, 500],
    x: 250,
    y: 330,
  },
  'event-5': {
    id: 'event-5',
    tag: '#Fitness',
    title: 'Creek Path Group Run',
    venue: 'Boulder Creek Path',
    latitude: 40.014,
    longitude: -105.292,
    distanceMeters: 1500,
    status: 'Scheduled',
    statusColor: '#34d399',
    startsAt: atLocal(2, 7, 30),
    eta: '16 min drive',
    etaMode: 'drive',
    attendeeCount: 18,
    isRsvpd: false,
    radii: [500, 1000],
    x: 140,
    y: 470,
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
  activeTab: 'Nearby',
  shellTab: 'discover',
  selectedTag: 'All',
  tags: ['All', '#LiveMusic', '#TechMeetup', '#FoodAndDrink', '#FarmersMarket', '#Fitness', '#Outdoor', '#FoodTrucks', '#Pickleball', '#ArtWalk'],

  setSocketConnected: (connected) => set({ isSocketConnected: connected }),
  setSelfCoordinates: (coords) => set({ selfCoordinates: coords }),
  setViewportBounds: (bounds) => set({ viewportBounds: bounds }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedEventId: id || 'event-1' }),
  setSelectedEventId: (id) => set({ selectedNodeId: id, selectedEventId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setShellTab: (tab) => set({ shellTab: tab }),
  setSelectedTag: (tag) => set({ selectedTag: tag }),

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
          startsAt: meta.startsAt,
          radii: [250, 500],
          isRsvpd: existing ? existing.isRsvpd : false,
          x,
          y,
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
    return Object.values(nodes).filter((node) => {
      const inBounds =
        node.x >= viewportBounds.minX &&
        node.x <= viewportBounds.maxX &&
        node.y >= viewportBounds.minY &&
        node.y <= viewportBounds.maxY;
      if (!inBounds) return false;

      if (activeTab === 'RSVPd' && !node.isRsvpd) return false;
      if (selectedTag !== 'All' && node.tag !== selectedTag) return false;

      return true;
    });
  },
}));
