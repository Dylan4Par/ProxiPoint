import React, { useMemo, useRef, useEffect, useState } from 'react';
import { MAP_ATTRIBUTION, MAP_STYLES } from '../../lib/mapTileUrls';
import { useExploreTagMode } from '../../lib/exploreTagMode';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  AccessibilityInfo,
} from 'react-native';
import {
  Camera,
  Map as MapLibreMap,
  Marker,
  type CameraRef,
  type LngLat,
  type StyleSpecification,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { resolveMapMode, useMapStyle } from '../../lib/mapStyle';
import { chipFilterTags, toCanvasCoordinates, useDiscoveryStore, type DiscoveryNode } from '../../stores/useDiscoveryStore';
import { matchesDiscoverFilters, useFollowedTagsFilter, useMyChannelsOnly } from '../../lib/discoverFilters';
import { useTimeWindow } from '../../lib/timeWindow';
import { isLiveNode } from '../../lib/liveStatus';
import { MessageCircle, Plus, Search, Zap } from 'lucide-react-native';
import { useModeration } from '../../lib/moderation';
import { fitView } from '../../lib/mapFit';
import { mapZoomFor, worldViewFor, type Bounds } from '../../lib/mapZoom';
import { MapPinGlyph } from './MapPinGlyph';
import { MapRecenterButton, mapControlPositions } from './MapControls';
import { CARD_SHEET_RADIUS } from './EventCardList';
import { BUBBLE_SIZE, ClusterBubble, ClusterPickSheet, mainTagOf, type ClusterMember, type MapClusterData } from './MapCluster';
import { isBoosted, useBoosts } from '../../lib/boost';
import { useChannels, useVisiblePosts, type ChannelPost } from '../../lib/channels';
import { isPinLive } from '../../lib/postRanking';
import { absorbIntoMarkers, clusterPins, nudgeOffMarkers } from '../../lib/postPins';
import { isAggregated } from '../../lib/aggregated';

/** Pin color for aggregated events (listed by @LocalRadar), same in day and night. */
const AGGREGATED_PIN = '#52708f';
/** Boost gold (same in day and night). */
const BOOST_GOLD = '#f59e0b';
import { PostPickSheet } from './PostPickSheet';
import { postMatchesMapFilter, useMapPostFilter } from '../../lib/mapFilters';
import { fromCanvasCoordinates, shouldOfferAreaSearch, visibleRadiusMeters, WORLD_SCALE } from '../../lib/mapArea';
import { setMapTouching } from '../../lib/mapGesture';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Explore Map: Stadia's vector map drawn by MapLibre (lib/mapTileUrls MAP_STYLES), with the
 * app's own pins on top.
 *
 * MapLibre handles pan and pinch itself, on the phone's UI thread, and draws the streets and
 * labels smoothly at every zoom (no picture tiles stretching or swapping, no stutter while the
 * app's JavaScript is busy). Pins, bubbles, posts and your dot are MapLibre Markers: our own views,
 * which MapLibre places on the map every frame, so they move with it exactly.
 *
 * Pin grouping, the card list's "in view" and Search this area still work in the app's world units
 * (lib/mapArea), worked out from the map's bounds each time it settles (lib/mapZoom).
 */

const { width, height } = Dimensions.get('window');
const CANVAS_HEIGHT = height * 0.52;

// Zoom is in world units here (screen points per world unit; lib/mapZoom converts to MapLibre's).
/** Furthest out: the map shows this much across, whatever the phone's width. */
const MAX_VIEW_WIDTH_METERS = 70 * 1609.344;
const MIN_ZOOM = width / (MAX_VIEW_WIDTH_METERS * WORLD_SCALE);
const MAX_ZOOM = 3;

// Live Points: green pins with a ripple, matching the LIVE badges.
const LIVE_PULSE_MS = 1400;
const ZOOM_STEP = 1.5;
/**
 * Where the map opens and where Recenter returns: five + / − steps out from the closest zoom
 * (3 / 1.5^5 ≈ 0.4), so you see the neighborhood around you, not just the block.
 */
const DEFAULT_ZOOM = MAX_ZOOM / ZOOM_STEP ** 5;
/** Box for a pinned post's bubble + tail (the tail tip sits at the bottom middle). */
const POST_PIN_SIZE = 32;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
/** How long the map glides for a jump to a Point, a cluster or Recenter. */
const MOVE_MS = 450;

// Pin head center sits this far below the top of the pin + label column.
const PIN_HEAD_CENTER = 17;
/**
 * Pins / bubbles only merge when their circles would actually overlap (this is the circle's
 * size on screen), so they can sit close together. #tag labels that would then collide with
 * something more important are hidden instead (they come back when there's room).
 */
const FOOTPRINT_W = 50;
/** About how far around the area's center Points are loaded (for "Search this area" on zoom-out). */
const AREA_RANGE_METERS = 1500;
const FOOTPRINT_H = 50;
/**
 * A pin is drawn from its head (17 px above its point) down to the bottom of its #tag label
 * (about 46 px below), so its middle is this far below the point. Centering a Point lifts it by
 * this much, so the pin and its label sit in the middle with room above the detail sheet.
 */
const MARKER_VISUAL_SHIFT = 14;
/** Where a #tag label sits below a pin / bubble, in screen points. */
const LABEL_TOP = 24;
const LABEL_BOTTOM = 48;
/** Members this close (world units ≈ 15 m) count as the same spot: the bubble opens a list. */
const SAME_PLACE_WORLD = 7;
const PIN_COLUMN_WIDTH = 140;

/** "#LiveMusic" from "LiveMusic", "#LiveMusic" or the first of several tags. */
function mainHashtag(node: unknown): string | null {
  const n = node as Record<string, unknown>;
  const raw =
    typeof n.tag === 'string'
      ? n.tag
      : Array.isArray(n.tags) && typeof n.tags[0] === 'string'
        ? (n.tags[0] as string)
        : '';
  const first = raw.split(/[\s,]+/).find(Boolean) ?? '';
  const clean = first.replace(/^#+/, '');
  return clean ? `#${clean}` : null;
}

type Spot = { latitude: number; longitude: number };
const lngLat = (spot: Spot): LngLat => [spot.longitude, spot.latitude];

export const DiscoveryMapCanvas: React.FC<{
  liveOnly?: boolean;
  /** Any touch on the map (tap, pin tap or start of a drag), e.g. to close the detail sheet. */
  onMapTouch?: () => void;
  /**
   * Window Y where something covers the bottom of the map (the detail sheet), or null.
   * The selected Point is centered in the part of the map still showing.
   */
  coveredFromY?: number | null;
  /** Bumped each time the detail sheet settles in place: the selected Point is centered again. */
  coveredKey?: number;
  /**
   * How much of the map's bottom the card list covers. The map fills the whole area and never
   * resizes when the list slides; this only moves the "middle" used for centering, the card
   * list's "in view", and the Search this area button.
   */
  coveredBottom?: number;
  /**
   * A Point whose details are open (e.g. tapped on Discover): drawn even when the filters
   * (#tag, Live now, distance…) would hide it, until the details close.
   */
  showAlwaysId?: string | null;
  /** Picking a Point from a cluster's list: select it and open its details. */
  onOpenPoint?: (id: string) => void;
  /**
   * A card was tapped: if that Point shares a spot with others (a cluster bubble), open the
   * bubble's list instead of its details. New key = new request.
   */
  cardRequest?: { id: string; key: number } | null;
  /** Drop a new Point. Shows a "+" next to the recenter button; leave out to hide it. */
  onDropPoint?: () => void;
  /** Tapping a pinned channel post (speech-bubble pin). */
  onOpenPost?: (id: string) => void;
  /** Slide the map to this spot (e.g. "Show on map" from a post). New key = new request. */
  focusRequest?: { latitude: number; longitude: number; key: number } | null;
  /** Zoom and move so all these spots are in view (Discover's Map (N)). New key = new request. */
  fitRequest?: { points: Array<{ latitude: number; longitude: number }>; key: number } | null;
  /**
   * "Search this area": make the middle of what's on screen the new area (Points load around it,
   * Discover follows). Shown once you've panned or zoomed out well away; leave out to hide it.
   */
  onSearchArea?: (area: { latitude: number; longitude: number; radiusMeters: number }) => void;
  /** ⌖ while exploring another area ("Search this area"): go back to your own area. */
  onReturnHome?: () => void;
}> = ({
  liveOnly = false,
  onMapTouch,
  coveredFromY = null,
  coveredKey = 0,
  coveredBottom = 0,
  showAlwaysId = null,
  onOpenPoint,
  cardRequest = null,
  onDropPoint,
  onOpenPost,
  focusRequest = null,
  fitRequest = null,
  onSearchArea,
  onReturnHome,
}) => {
  const { colors: c, mode: appMode } = useTheme();
  // Settings → Default map style: Match app, Light or Dark tiles.
  const mode = resolveMapMode(useMapStyle(), appMode);
  const styles = useThemedStyles(createStyles);
  const nodes = useDiscoveryStore((s) => s.nodes);
  const selectedNodeId = useDiscoveryStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useDiscoveryStore((s) => s.setSelectedNodeId);
  const setViewportBounds = useDiscoveryStore((s) => s.setViewportBounds);

  const activeTab = useDiscoveryStore((s) => s.activeTab);
  const selfCoordinates = useDiscoveryStore((s) => s.selfCoordinates);
  const viewPlace = useDiscoveryStore((s) => s.viewPlace);
  useModeration(); // re-filter when you report or block someone
  const allNodes = Object.values(nodes || {});
  // Same filters as the card list: hashtag chip, Live Now, and Nearby / RSVP'd.
  const boostClock = useBoosts(); // re-render when a boost starts or runs out
  useTimeWindow(); // re-filter when the date window changes (3 days, or Calendar dates)
  const myChannelsOnly = useMyChannelsOnly(); // Filter & sort → Show only → My channels
  // Explore Map has no distance filter (the map shows what's around), only its #tag filters:
  // the chip row's tags, matched Any / All (Filter menu).
  const rangeMeters = null;
  // the chip row's #tags that are turned on, matched Any / All (Filter menu). Explore ignores
  // Discover's single-#tag filter (selectedTag).
  const chipTags = useDiscoveryStore((s) => s.tags);
  const offTags = useDiscoveryStore((s) => s.offTags);
  const exploreMode = useExploreTagMode();
  const tagFilter = useMemo(() => ({ tags: chipFilterTags(chipTags, offTags), mode: exploreMode }), [chipTags, offTags, exploreMode]);
  const followed = useFollowedTagsFilter(); // Filter & sort → Show only → Include my Followed Tags
  useChannels(); // re-filter when you join or leave a channel
  // Boosted pins are drawn last so they sit on top of nearby pins.
  const nodeList = allNodes
    .filter(
      (node) =>
        node.id === showAlwaysId ||
        matchesDiscoverFilters(node, { selectedTag: null, liveOnly, activeTab, myChannelsOnly, followedTags: followed.filter, area: viewPlace, rangeMeters, tagFilter }),
    )
    .sort((a, b) => Number(isBoosted(a.id, boostClock)) - Number(isBoosted(b.id, boostClock)));

  // Channel posts attached to a Point on the map, while their pin lasts, from channels you FOLLOW
  // (joining alone doesn't put a channel on your map). They sit on their Point (a badge on its pin
  // or bubble), never on their own. Same #tag chip as the Points (matched against the post's
  // channel tags); hidden on the RSVP'd view, which is about your plans.
  const posts = useVisiblePosts();
  const nodesById = new Map(nodeList.map((node) => [node.id, node]));
  const channelsById = new Map(useChannels().map((channel) => [channel.id, channel]));
  const tagKey = (tag: string) => tag.replace(/^#+/, '').toLowerCase();
  // The When sheet's post filters: which kinds, and how recent.
  const postFilter = useMapPostFilter();
  const postPins =
    activeTab === 'RSVPd'
      ? []
      : posts
          .filter((post) => isPinLive(post, boostClock))
          .filter((post) => postMatchesMapFilter(post, postFilter, boostClock))
          .filter((post) => channelsById.get(post.channelId)?.followed === true)
          .filter((post) => {
            // The #tag filters, matched against the post's channel tags (Any / All).
            if (!tagFilter.tags.length) return true;
            const channelKeys = new Set((channelsById.get(post.channelId)?.tags ?? []).map(tagKey));
            const hit = (tag: string) => channelKeys.has(tagKey(tag));
            return tagFilter.mode === 'all' ? tagFilter.tags.every(hit) : tagFilter.tags.some(hit);
          })
          .map((post) => ({ post, point: nodesById.get(post.place?.pointId ?? '') }))
          // Only while its Point is on the map (same filters as the Points).
          .filter((entry): entry is { post: ChannelPost; point: DiscoveryNode } => Boolean(entry.point))
          .map(({ post, point }) => ({ post, x: point.x ?? 480, y: point.y ?? 480 }));

  // Respect the system Reduce Motion setting for the beacon pulse.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // One shared ripple loop drives every live pin (stays still with Reduce Motion on).
  const livePulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) {
      livePulse.setValue(0.35);
      return;
    }
    livePulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(livePulse, {
        toValue: 1,
        duration: LIVE_PULSE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, livePulse]);
  // Built once, so memoized pins see the same style object every render.
  const liveRingStyle = useRef({
    opacity: livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
    // Starts small at the point and spreads out.
    transform: [{ scale: livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.6] }) }],
  }).current;

  // Zoom in coarse steps, so clusters are worked out again only when the zoom really changes.
  const zoomStep = (z: number) => Math.round(Math.log(z) / Math.log(1.15));
  // Starts at the map's opening zoom; the map then reports its real zoom once it settles.
  const [clusterStep, setClusterStep] = useState(() => zoomStep(DEFAULT_ZOOM));
  const clusterStepRef = useRef(clusterStep);

  const selectedNode = nodeList.find((item) => item.id === selectedNodeId) ?? null;

  // ---- Clusters: pins that would overlap on screen become one bubble --------------------------
  const clusterZoom = Math.pow(1.15, clusterStep);
  const { singles, clusters, hiddenLabels } = useMemo(() => {
    // Each pin / bubble takes up a box on screen (the circle plus its #tag label underneath).
    // Anything whose boxes would touch is merged, and merging repeats until nothing touches,
    // so bubbles, pins and tag labels never overlap.
    const boxW = FOOTPRINT_W / clusterZoom; // in world units at this zoom
    const boxH = FOOTPRINT_H / clusterZoom;
    const items: ClusterMember[] = nodeList
      .filter((n) => n.x != null && n.y != null)
      .map((n) => ({ ...(n as unknown as ClusterMember), live: isLiveNode(n), boosted: isBoosted(n.id, boostClock) }));

    type Group = { members: ClusterMember[]; x: number; y: number };
    const groups: Group[] = items.map((it) => ({ members: [it], x: it.x, y: it.y }));
    const centroid = (list: ClusterMember[]) => ({
      x: list.reduce((sum, m) => sum + m.x, 0) / list.length,
      y: list.reduce((sum, m) => sum + m.y, 0) / list.length,
    });
    for (let guard = 0; guard < 500; guard += 1) {
      // Closest touching pair first (measured relative to the box size).
      let best: { i: number; j: number; d: number } | null = null;
      for (let i = 0; i < groups.length; i += 1) {
        for (let j = i + 1; j < groups.length; j += 1) {
          const dx = Math.abs(groups[i].x - groups[j].x) / boxW;
          const dy = Math.abs(groups[i].y - groups[j].y) / boxH;
          if (dx < 1 && dy < 1) {
            const d = Math.max(dx, dy);
            if (!best || d < best.d) best = { i, j, d };
          }
        }
      }
      if (!best) break;
      const members = [...groups[best.i].members, ...groups[best.j].members];
      groups[best.i] = { members, ...centroid(members) };
      groups.splice(best.j, 1);
    }

    const singleIds = new Set<string>();
    const merged: MapClusterData[] = [];
    for (const group of groups) {
      if (group.members.length === 1) {
        singleIds.add(group.members[0].id);
        continue;
      }
      // Boosted, then live, lead the group (they set the colour and the first #tag).
      const members = [...group.members].sort(
        (a, b) => Number(b.boosted) - Number(a.boosted) || Number(b.live) - Number(a.live),
      );
      const samePlace = members.every((m) => Math.hypot(m.x - group.x, m.y - group.y) <= SAME_PLACE_WORLD);
      merged.push({
        key: members.map((m) => m.id).sort().join('|'),
        x: group.x,
        y: group.y,
        members,
        samePlace,
        // The selected Point is inside: the bubble gets a highlight ring (no pin on top of it).
        selected: members.some((m) => m.id === selectedNodeId),
      });
    }
    // Draw order: plain bubbles, then live, then boosted, then the selected one on top.
    const rank = (cl: MapClusterData) =>
      (cl.selected ? 8 : 0) + (cl.members.some((m) => m.boosted) ? 4 : 0) + (cl.members.some((m) => m.live) ? 2 : 0);
    const groupsOut = merged.sort((a, b) => rank(a) - rank(b));

    // ---- Labels: show a #tag label only where it fits ------------------------------------------
    // Most important first (selected, boosted, live, bigger groups); a label is hidden if it
    // would touch another shown label or anyone else's circle. The selected pin's label is never hidden.
    const z = clusterZoom;
    const circleHalf = FOOTPRINT_W / 2 / z;
    // (The "#" is drawn smaller, so it counts as about half a letter.)
    const labelWidth = (text: string) => (Math.min(18, text.replace(/^#+/, '').length + 0.5) * 6.6 + 22) / z;
    type Spot = { id: string; x: number; y: number; text: string; score: number };
    const spots: Spot[] = [
      ...groupsOut.map((cl) => ({
        id: cl.key,
        x: cl.x,
        y: cl.y,
        // The wheel's widest #tag decides the label size.
        text: cl.members.reduce((w, m) => {
          const t = (Array.isArray(m.tags) && m.tags[0]) || m.tag || '';
          return t.length > w.length ? t : w;
        }, ''),
        score: rank(cl) * 10 + cl.members.length,
      })),
      ...items
        .filter((m) => singleIds.has(m.id))
        .map((m) => ({
          id: m.id,
          x: m.x,
          y: m.y,
          text: (Array.isArray(m.tags) && m.tags[0]) || m.tag || '',
          score: (m.id === selectedNodeId ? 80 : 0) + (m.boosted ? 40 : 0) + (m.live ? 20 : 0),
        })),
    ];
    const ordered = [...spots].sort((a, b) => b.score - a.score);
    const shown: Array<{ l: number; r: number; t: number; b: number }> = [];
    const hiddenLabels = new Set<string>();
    for (const spot of ordered) {
      if (!spot.text) continue;
      const half = labelWidth(spot.text) / 2;
      const box = { l: spot.x - half, r: spot.x + half, t: spot.y + LABEL_TOP / z, b: spot.y + LABEL_BOTTOM / z };
      const hitsLabel = shown.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t);
      const hitsCircle = spots.some(
        (o) =>
          o.id !== spot.id &&
          box.l < o.x + circleHalf &&
          box.r > o.x - circleHalf &&
          box.t < o.y + circleHalf &&
          box.b > o.y - circleHalf,
      );
      // The selected pin's label always shows (it's placed first, so others make room for it).
      if (spot.id !== selectedNodeId && (hitsLabel || hitsCircle)) hiddenLabels.add(spot.id);
      else shown.push(box);
    }
    return { singles: nodeList.filter((n) => singleIds.has(n.id)), clusters: groupsOut, hiddenLabels };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeList.map((n) => `${n.id}:${n.x}:${n.y}`).join(','), selectedNodeId, clusterZoom, boostClock]);

  // ---- Post bubbles: grouped like the Points, absorbed by Point bubbles, kept off pins ------
  // Posts whose bubbles would overlap become one bubble with a count. A bubble landing on a Point
  // cluster bubble is absorbed into it (badge on the bubble, cards in its list). A bubble that
  // would cover a single Point's pin (a post pinned at that venue) moves to the pin's upper-right.
  const { postGroups, postsByCluster } = useMemo(() => {
    const spots = postPins.map(({ post, x, y }) => ({ id: post.id, x, y, post }));
    const { absorbed, rest } = absorbIntoMarkers(
      clusterPins(spots, clusterZoom),
      clusters.map((cl) => ({ key: cl.key, x: cl.x, y: cl.y })),
      clusterZoom,
    );
    const byCluster: Record<string, ChannelPost[]> = {};
    Object.entries(absorbed).forEach(([key, members]) => {
      byCluster[key] = members.map((m) => m.post);
    });
    const pinMarkers = singles.map((n) => ({ x: n.x ?? 480, y: n.y ?? 480 }));
    return { postGroups: nudgeOffMarkers(rest, pinMarkers, clusterZoom), postsByCluster: byCluster };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postPins.map((p) => `${p.post.id}:${p.x}:${p.y}`).join(','), singles, clusters, clusterZoom]);
  const [pickPosts, setPickPosts] = useState<ChannelPost[] | null>(null);
  const [pickCluster, setPickCluster] = useState<MapClusterData | null>(null);
  const sheetOpen = useRef(false);
  sheetOpen.current = pickCluster != null || pickPosts != null;
  const [pickHighlight, setPickHighlight] = useState<string | null>(null);

  // Card tapped: Points sharing a spot open their bubble's list; others open their details.
  const lastCardKey = useRef(cardRequest?.key ?? 0);
  useEffect(() => {
    if (!cardRequest || cardRequest.key === lastCardKey.current) return;
    lastCardKey.current = cardRequest.key;
    const group = clusters.find((cl) => cl.samePlace && cl.members.some((m) => m.id === cardRequest.id));
    if (group) {
      setPickHighlight(cardRequest.id);
      setPickCluster(group);
    } else {
      onOpenPoint?.(cardRequest.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardRequest?.key, clusters]);

  // ---- The map's view, in world units -------------------------------------------------------
  // Real size of the map area (measured on layout); the screen-based guess is only a fallback.
  const viewSize = useRef({ width, height: CANVAS_HEIGHT });
  // Set once the user drags, pinches or zooms, so a late layout doesn't yank the map back.
  const userMoved = useRef(false);
  // World zoom of the last settled view (screen points per world unit).
  const currentZoom = useRef(DEFAULT_ZOOM);
  // The map's last settled bounds, to work the world view out again when the area or the card
  // list changes without the map moving.
  const lastBounds = useRef<Bounds | null>(null);
  // Latest area (the map's event handlers can run between renders).
  const viewPlaceRef = useRef(viewPlace);
  viewPlaceRef.current = viewPlace;
  const toWorld = (latitude: number, longitude: number) =>
    toCanvasCoordinates(latitude, longitude, viewPlaceRef.current.latitude, viewPlaceRef.current.longitude);
  const toSpot = (p: { x: number; y: number }): Spot =>
    fromCanvasCoordinates(p.x, p.y, viewPlaceRef.current.latitude, viewPlaceRef.current.longitude);
  // The middle of the visible map and its size, in world units (for Search this area).
  const visibleWorld = useRef<{ center: { x: number; y: number }; width: number; height: number } | null>(null);

  const [offerArea, setOfferArea] = useState(false);
  const offerAreaRef = useRef(false);
  // The radius the current area was loaded with: the default, or the last search's (see
  // shouldOfferAreaSearch), so a city-wide search doesn't bring the button straight back.
  const areaRangeRef = useRef(AREA_RANGE_METERS);

  /**
   * The map settled at these bounds: the card list, pin groups and Search this area follow.
   * (Not while a finger is moving the map: MapLibre reports the end of each move.)
   */
  const applyView = (bounds: Bounds | null = lastBounds.current) => {
    if (!bounds) return;
    lastBounds.current = bounds;
    const share = visibleMapHeight() / Math.max(1, viewSize.current.height);
    const view = worldViewFor(bounds, viewSize.current.width, share, toWorld);
    if (!view) return;
    const z = view.zoom;
    currentZoom.current = z;
    const step = zoomStep(z);
    if (step !== clusterStepRef.current) {
      clusterStepRef.current = step;
      setClusterStep(step);
    }
    // A little past each edge, so a pin half on screen still has its card.
    setViewportBounds({ minX: view.minX - 40, maxX: view.maxX + 40, minY: view.minY - 40, maxY: view.maxY + 40 });
    const visible = {
      center: { x: (view.minX + view.maxX) / 2, y: (view.minY + view.maxY) / 2 },
      width: view.maxX - view.minX,
      height: view.maxY - view.minY,
    };
    visibleWorld.current = visible;
    // Far from the area's center (or zoomed well out)? Offer "Search this area".
    const offer = shouldOfferAreaSearch(visible.center, visible.width, areaRangeRef.current);
    if (offer !== offerAreaRef.current) {
      offerAreaRef.current = offer;
      setOfferArea(offer);
    }
  };

  // "Search this area" fades in when offered and out when tapped (or no longer offered).
  const searchFade = useRef(new Animated.Value(0)).current;
  const [searchShown, setSearchShown] = useState(false);
  useEffect(() => {
    if (offerArea) {
      setSearchShown(true);
      Animated.timing(searchFade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    } else {
      Animated.timing(searchFade, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setSearchShown(false);
      });
    }
  }, [offerArea, searchFade]);
  // Set while the area moves to where you're looking (the map itself stays where it is).
  const keepViewOnPlaceChange = useRef(false);
  const searchThisArea = () => {
    const visible = visibleWorld.current;
    if (!onSearchArea || !visible) return;
    const spot = toSpot(visible.center);
    keepViewOnPlaceChange.current = true;
    offerAreaRef.current = false;
    // Fade the button out right away (on the UI thread), then load the new area a frame later so
    // the fade has started before the heavy update.
    searchFade.stopAnimation();
    Animated.timing(searchFade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setSearchShown(false));
    setOfferArea(false);
    const radiusMeters = visibleRadiusMeters(visible.width, visible.height);
    areaRangeRef.current = Math.max(AREA_RANGE_METERS, radiusMeters);
    setTimeout(() => onSearchArea({ ...spot, radiusMeters }), 32);
  };

  // ---- Camera moves -------------------------------------------------------------------------
  const cameraRef = useRef<CameraRef>(null);
  // Moves asked for before the map has loaded wait for it (only the latest one matters).
  const mapReady = useRef(false);
  const pendingMove = useRef<(() => void) | null>(null);
  const withCamera = (fn: (camera: CameraRef) => void) => {
    const run = () => {
      const camera = cameraRef.current;
      if (!camera) return;
      try {
        fn(camera);
      } catch {
        // the map isn't ready after all: nothing to move
      }
    };
    if (mapReady.current) run();
    else pendingMove.current = run;
  };
  const onMapReady = () => {
    if (mapReady.current) return;
    mapReady.current = true;
    const run = pendingMove.current;
    pendingMove.current = null;
    run?.();
  };
  // In case the map never reports loading (e.g. offline), stop holding moves back after a moment.
  useEffect(() => {
    const timer = setTimeout(onMapReady, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Puts a spot in the middle of the visible map (above the card list or detail sheet), `lift`
   * points higher, at world zoom `z` (or the current zoom). duration 0 jumps.
   */
  const moveTo = (spot: Spot, opts: { z?: number; lift?: number; duration?: number; fly?: boolean } = {}) => {
    const hidden = Math.max(0, viewSize.current.height - visibleMapHeight());
    // MapLibre centers in the part of the map left after the padding.
    const padding = { top: 0, left: 0, right: 0, bottom: hidden + 2 * (opts.lift ?? 0) };
    const z = opts.z != null ? clampZoom(opts.z) : undefined;
    const zoom = z != null ? mapZoomFor(z, viewPlaceRef.current.latitude) : undefined;
    const center = lngLat(spot);
    withCamera((camera) =>
      opts.duration === 0
        ? camera.jumpTo({ center, zoom, padding })
        : camera.easeTo({ center, zoom, padding, duration: opts.duration ?? MOVE_MS, easing: opts.fly ? 'fly' : 'ease' }),
    );
  };

  // Where the map sits on screen, to work out how much of it is visible above an overlay.
  const containerRef = useRef<View | null>(null);
  const frameOrigin = useRef({ left: 0, top: 0 });

  /** Zoom and middle that put every spot of a fit request in the visible map (null: no spots). */
  const fitTargetFor = (req: { points: Array<{ latitude: number; longitude: number }> }) => {
    const world = req.points.map((p) => toWorld(p.latitude, p.longitude));
    const visibleH = visibleMapHeight();
    const fit = fitView(
      world,
      { width: viewSize.current.width, height: visibleH },
      // Not closer than two steps out from the closest zoom; one spot opens at the usual zoom.
      { min: MIN_ZOOM, max: MAX_ZOOM / ZOOM_STEP ** 2, single: DEFAULT_ZOOM },
    );
    if (!fit) return null;
    // fitView puts world (x, y) at (screenX, screenY); moveTo centers on the visible middle.
    const middle = {
      x: fit.x + (viewSize.current.width / 2 - fit.screenX) / fit.z,
      y: fit.y + (visibleH / 2 - fit.screenY) / fit.z,
    };
    return { z: fit.z, spot: toSpot(middle) };
  };

  // Latest values for timers and layout callbacks (which can run after a render).
  const coveredRef = useRef<number | null>(coveredFromY);
  coveredRef.current = coveredFromY;
  const coveredBottomRef = useRef(coveredBottom);
  coveredBottomRef.current = coveredBottom;
  // The Point whose details are open (if any): the map opens on it rather than on you.
  const openDetailRef = useRef<string | null>(showAlwaysId);
  openDetailRef.current = showAlwaysId;
  const selectedPosRef = useRef<{ x: number; y: number } | null>(null);
  // Where the selected Point is drawn: its own pin, or the bubble it's grouped into (whose
  // middle can be half a pin away from the Point itself).
  const selectedCluster = clusters.find((cl) => cl.selected) ?? null;
  selectedPosRef.current = selectedCluster
    ? { x: selectedCluster.x, y: selectedCluster.y }
    : selectedNode && selectedNode.x != null && selectedNode.y != null
      ? { x: selectedNode.x, y: selectedNode.y }
      : null;

  /** Height of the map not hidden by the detail sheet. */
  const visibleMapHeight = () => {
    // With the detail sheet up, it covers the card list too, so only the sheet counts. (The card
    // list may still be sliding from full to half when a card is tapped; counting it then
    // centered the Point in the wrong strip, low and behind the sheet.)
    if (coveredRef.current != null) return Math.max(80, coveredRef.current - frameOrigin.current.top);
    return Math.max(80, viewSize.current.height - coveredBottomRef.current);
  };

  /** Slides the selected Point to the middle of what's visible (at the current zoom). */
  const focusSelected = (duration?: number) => {
    const spot = selectedPosRef.current;
    if (!spot) return;
    moveTo(toSpot(spot), { lift: MARKER_VISUAL_SHIFT, duration });
  };

  // While the card list slides up or down, the map's size changes every frame. Measuring each
  // frame made it flicker, so after the first layout wait until the size stops changing.
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const laidOut = useRef(false);
  useEffect(() => () => {
    if (resizeTimer.current) clearTimeout(resizeTimer.current);
    if (layoutTimer.current) clearTimeout(layoutTimer.current);
  }, []);
  const measureFrame = () => {
    if (!laidOut.current) {
      measureNow();
      return;
    }
    if (layoutTimer.current) clearTimeout(layoutTimer.current);
    layoutTimer.current = setTimeout(measureNow, 140);
  };
  const measureNow = () => {
    containerRef.current?.measureInWindow((x, y, w, h) => {
      // Ignore the tiny sizes the map passes through while the card list covers it.
      if (!Number.isFinite(y) || w <= 0 || h < 80) return;
      const firstLayout = !laidOut.current;
      laidOut.current = true;
      const previous = viewSize.current;
      frameOrigin.current = { left: x, top: y };
      viewSize.current = { width: w, height: h };
      if (!firstLayout && Math.abs(previous.width - w) > 2 && selectedPosRef.current) {
        // Rotated: center the selected Point again. (MapLibre keeps the rest of the view.)
        if (resizeTimer.current) clearTimeout(resizeTimer.current);
        resizeTimer.current = setTimeout(() => focusSelected(), 60);
      }
      if (!firstLayout) {
        applyView();
        return;
      }
      // First layout: open where it should, now the real size is known (no animation).
      const fit = fitRequest && fitRequest.key !== lastFitKey.current ? fitTargetFor(fitRequest) : null;
      if (fitRequest && fit) {
        // Opened from Discover's Map (N): zoomed to show every one of those Points.
        lastFitKey.current = fitRequest.key;
        userMoved.current = true;
        moveTo(fit.spot, { z: fit.z, duration: 0 });
      } else if (focusRequest && focusRequest.key !== lastFocusKey.current) {
        // Opened to show a spot (e.g. a pinned post): start there instead of on you.
        lastFocusKey.current = focusRequest.key;
        userMoved.current = true;
        moveTo(focusRequest, { duration: 0 });
      } else if (selectedPosRef.current && openDetailRef.current) {
        // Opened with a Point's details showing (tapped on Discover, a profile or a channel):
        // start on that Point, in the middle of the map above the sheet, not on you.
        userMoved.current = true;
        focusSelected(0);
      } else if (!userMoved.current) {
        // Your area in the middle of the part of the map above the card list.
        moveTo(viewPlaceRef.current, { z: DEFAULT_ZOOM, duration: 0 });
      }
    });
  };

  // "Show on map" for a spot: slide there now if the map is laid out, otherwise on first layout.
  const lastFocusKey = useRef(0);
  // Fit a set of spots (Discover's Map (N)): the same, zooming as well.
  const lastFitKey = useRef(0);
  useEffect(() => {
    if (!fitRequest || fitRequest.key === lastFitKey.current) return;
    // Not measured yet: measureNow fits it with the map's real size on its first layout.
    if (!laidOut.current) return;
    const fit = fitTargetFor(fitRequest);
    if (!fit) return;
    lastFitKey.current = fitRequest.key;
    userMoved.current = true;
    moveTo(fit.spot, { z: fit.z });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest?.key]);
  useEffect(() => {
    if (!focusRequest || focusRequest.key === lastFocusKey.current) return;
    if (!laidOut.current) return; // measureNow handles it with the real size on first layout
    lastFocusKey.current = focusRequest.key;
    userMoved.current = true;
    moveTo(focusRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.key]);

  // Selecting a Point (card or pin) slides the map so it sits in the middle of the visible area.
  const selectedX = selectedNode?.x;
  const selectedY = selectedNode?.y;
  // Only move when the selection or the sheet changes (not on first load or re-layout),
  // so the map still opens centered on you and doesn't fight the user's own panning.
  // The sheet settling (coveredKey) counts too, even at the same spot as last time: by then the
  // card list and the sheet have stopped moving, so this is the final, right centering.
  const lastFocus = useRef<{ id: unknown; covered: number | null; key: number } | null>(null);
  useEffect(() => {
    const previous = lastFocus.current;
    lastFocus.current = { id: selectedNodeId, covered: coveredFromY, key: coveredKey };
    if (!previous) return; // first render
    if (previous.id === selectedNodeId && previous.covered === coveredFromY && previous.key === coveredKey) return;
    if (selectedX == null || selectedY == null) return;
    if (previous.key !== coveredKey && coveredFromY == null) return; // a sheet that's closing
    userMoved.current = true;
    focusSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, coveredFromY, coveredKey]);

  // Recenter: back on your area, at the default zoom.
  const handleRecenter = (fly = false) => moveTo(viewPlaceRef.current, { z: DEFAULT_ZOOM, fly, duration: fly ? 900 : MOVE_MS });

  /** Bubble tapped: same spot → pick list; just close together → zoom in until they split. */
  const openCluster = (cluster: MapClusterData) => {
    onMapTouch?.();
    // Same spot, or already zoomed all the way in and still together: show the list.
    if (cluster.samePlace || currentZoom.current >= MAX_ZOOM - 0.05) {
      setPickHighlight(cluster.selected ? selectedNodeId : null);
      setPickCluster(cluster);
      return;
    }
    userMoved.current = true;
    // Zoom in to fit the bubble's Points on screen (with room around them), so a big bubble
    // (a whole street) opens up into smaller bubbles and pins.
    const xs = cluster.members.map((m) => m.x);
    const ys = cluster.members.map((m) => m.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 120; // screen points of margin (pins, labels)
    const fit = Math.min(
      (viewSize.current.width - pad) / Math.max(1, maxX - minX),
      (visibleMapHeight() - pad) / Math.max(1, maxY - minY),
    );
    const next = clampZoom(Math.max(currentZoom.current * 1.4, Math.min(fit, MAX_ZOOM)));
    moveTo(toSpot({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }), { z: next });
  };

  // The card list slid to a new height (collapsed, half or full): the map never moves for it.
  // Only refresh what counts as in view, so the cards match the pins above them.
  const lastCoveredBottom = useRef(coveredBottom);
  useEffect(() => {
    if (Math.abs(lastCoveredBottom.current - coveredBottom) < 1) return;
    lastCoveredBottom.current = coveredBottom;
    if (!laidOut.current) return;
    applyView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coveredBottom]);

  // Switching city: glide to the middle of the new place.
  const lastPlace = useRef(`${viewPlace.latitude},${viewPlace.longitude}`);
  useEffect(() => {
    const placeKey = `${viewPlace.latitude},${viewPlace.longitude}`;
    if (placeKey === lastPlace.current) return;
    lastPlace.current = placeKey;
    // World units are measured from the area's center, so the same view has new numbers.
    applyView();
    if (keepViewOnPlaceChange.current) {
      // "Search this area": the new area is where you're already looking; the map stays put.
      keepViewOnPlaceChange.current = false;
      return;
    }
    // A place picked from the list (not a search): back to the default range.
    areaRangeRef.current = AREA_RANGE_METERS;
    userMoved.current = false;
    handleRecenter(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewPlace.latitude, viewPlace.longitude]);

  const onRegionDidChange = (event: { nativeEvent: ViewStateChangeEvent }) => {
    const { bounds, userInteraction } = event.nativeEvent;
    if (userInteraction) userMoved.current = true;
    applyView(bounds as Bounds);
  };

  // Zoom limits in MapLibre's levels for this area (the world zoom limits don't depend on it).
  const minMapZoom = mapZoomFor(MIN_ZOOM, viewPlace.latitude);
  const maxMapZoom = mapZoomFor(MAX_ZOOM, viewPlace.latitude);
  // The camera's first view (the first layout then fine-tunes it for the card list).
  const initialView = useRef({ center: lngLat(viewPlace), zoom: mapZoomFor(DEFAULT_ZOOM, viewPlace.latitude) }).current;

  return (
    <View
      ref={containerRef}
      onLayout={measureFrame}
      style={styles.canvasContainer}
      // onTouchStart sees every touch without taking it, so the map still pans and pins still tap.
      onTouchStart={() => {
        if (sheetOpen.current) return;
        setMapTouching(true);
        onMapTouch?.();
      }}
      // Last finger up: the card list may rebuild now (see lib/mapGesture).
      onTouchEnd={(evt) => {
        if (evt.nativeEvent.touches.length === 0) setMapTouching(false);
      }}
      onTouchCancel={() => setMapTouching(false)}
    >
      <MapLibreMap
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLES[mode] as string | StyleSpecification}
        // Flat, north-up map: pan and zoom only.
        touchRotate={false}
        touchPitch={false}
        // The credit line below is ours (it stays clear of the card list); no MapLibre logo.
        attribution={false}
        logo={false}
        compass={false}
        scaleBar={false}
        onRegionDidChange={onRegionDidChange}
        onDidFinishLoadingMap={onMapReady}
        onDidFailLoadingMap={onMapReady}
      >
        <Camera ref={cameraRef} initialViewState={initialView} minZoom={minMapZoom} maxZoom={maxMapZoom} />

        {/* You */}
        <Marker id="me" lngLat={lngLat(selfCoordinates)} anchor="center">
          <View pointerEvents="none" style={styles.userBeacon}>
            <View style={styles.userPulseRing} />
            <View style={styles.userCoreDot} />
          </View>
        </Marker>

        {/* Pinned channel posts: speech bubbles (one per group), anchored on their tail. */}
        {postGroups.map((group) => {
          const many = group.members.length > 1;
          const only = group.members[0].post;
          return (
            <Marker
              key={`post-${group.key}`}
              id={`post-${group.key}`}
              lngLat={lngLat(toSpot(group))}
              anchor="bottom"
              // Nudged off a pin at the same spot (screen points).
              offset={[group.dx, group.dy]}
              onPress={() => (many ? setPickPosts(group.members.map((m) => m.post)) : onOpenPost?.(only.id))}
            >
              <View
                pointerEvents="none"
                style={styles.postPin}
                accessible
                accessibilityRole="button"
                accessibilityLabel={
                  many ? `${group.members.length} posts here. Show the list` : `Post at ${only.place?.label ?? 'this spot'}: ${only.body}`
                }
                testID={many ? `map-posts-${group.key}` : `map-post-${only.id}`}
              >
                <View style={styles.postBubbleWrap}>
                  {/* Grouped: a second bubble peeking out behind, like a stack. */}
                  {many ? <View style={styles.postBubbleBehind} /> : null}
                  <View style={styles.postBubble}>
                    <MessageCircle size={13} color={c.white} fill={c.white} strokeWidth={2} />
                    <Text style={styles.postBubbleCount}>{many ? group.members.length : only.upvotes}</Text>
                  </View>
                </View>
                <View style={styles.postBubbleTail} />
              </View>
            </Marker>
          );
        })}

        {/* Cluster bubbles (several Points close together). The selected one is keyed apart so
            it's added last, on top of its neighbours. */}
        {clusters.map((cluster) => (
          <Marker
            key={`${cluster.key}${cluster.selected ? '-sel' : ''}`}
            id={`cluster-${cluster.key}`}
            lngLat={lngLat(toSpot(cluster))}
            anchor="top"
            // The bubble's middle on the spot.
            offset={[0, -(BUBBLE_SIZE / 2 + 6)]}
            onPress={() => openCluster(cluster)}
          >
            <ClusterPin cluster={cluster} showLabel={!hiddenLabels.has(cluster.key)} postCount={postsByCluster[cluster.key]?.length ?? 0} />
          </Marker>
        ))}

        {/* Single pins, anchored on the pin head. Each is memoized: a pin only re-renders when its
            own look changes. The selected one is keyed apart so it's drawn on top. */}
        {singles.map((item) => {
          const selected = item.id === selectedNodeId;
          return (
            <Marker
              key={`${item.id}${selected ? '-sel' : ''}`}
              id={`pin-${item.id}`}
              lngLat={[item.longitude, item.latitude]}
              anchor="top"
              offset={[0, -PIN_HEAD_CENTER]}
              onPress={() => setSelectedNodeId(item.id)}
            >
              <SinglePin
                item={item}
                isSelected={selected}
                live={isLiveNode(item)}
                boosted={isBoosted(item.id, boostClock)}
                showLabel={!hiddenLabels.has(item.id)}
                liveRingStyle={liveRingStyle}
              />
            </Marker>
          );
        })}
      </MapLibreMap>

      {/* A grouped post bubble: choose which post */}
      <PostPickSheet
        posts={pickPosts}
        now={boostClock}
        onClose={() => setPickPosts(null)}
        onPick={(id) => {
          setPickPosts(null);
          onOpenPost?.(id);
        }}
      />

      {/* Points sharing one spot: choose which one */}
      <ClusterPickSheet
        cluster={pickCluster}
        highlightId={pickHighlight}
        onClose={() => setPickCluster(null)}
        onPick={(id) => {
          setPickCluster(null);
          setSelectedNodeId(id);
          onOpenPoint?.(id);
        }}
        // Posts absorbed into this bubble, listed under its Points.
        posts={pickCluster ? postsByCluster[pickCluster.key] ?? [] : []}
        onPickPost={(id) => {
          setPickCluster(null);
          onOpenPost?.(id);
        }}
      />

      {/* Map credit (required by the map provider) */}
      <Text style={[styles.attribution, { bottom: 6 + coveredBottom }]} pointerEvents="none">
        {MAP_ATTRIBUTION}
      </Text>

      {/* Recenter (shared with Create Drop's Select on map) */}
      <MapRecenterButton
        style={mapControlPositions().recenter}
        onPress={() => {
          // Exploring a searched area: "back on you" means going home (the map then recenters on
          // your area by itself).
          if (viewPlace.kind === 'search' && onReturnHome) onReturnHome();
          else handleRecenter();
        }}
        testID="map-recenter"
      />

      {/* Search this area: once you've panned or zoomed out away from the area. Centered along the
          bottom of the map, clear of the zoom buttons. */}
      {onSearchArea && searchShown ? (
        <Animated.View
          style={[styles.searchAreaRow, { bottom: 22 + coveredBottom, opacity: searchFade }]}
          pointerEvents={offerArea ? 'box-none' : 'none'}
        >
          <TouchableOpacity
            style={styles.searchAreaBtn}
            activeOpacity={0.8}
            onPress={searchThisArea}
            accessibilityRole="button"
            accessibilityLabel="Search this area"
            testID="map-search-area"
          >
            <Search size={15} color={c.base} strokeWidth={2.75} />
            <Text style={styles.searchAreaText}>Search this area</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      {/* Drop Point: same size and look as the recenter button, just left of it. */}
      {onDropPoint ? (
        <TouchableOpacity
          style={[styles.crosshairBtn, styles.dropBtn]}
          activeOpacity={0.7}
          onPress={onDropPoint}
          accessibilityRole="button"
          accessibilityLabel="Drop a Point"
          testID="map-drop-point"
        >
          <Plus size={22} color={c.accent} strokeWidth={2.75} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

/**
 * A cluster bubble, memoized: re-renders only when what it shows changes. Taps go to its Marker
 * (MapLibre hands map taps to the Marker under the finger), so the bubble itself takes no touches
 * and a drag that starts on it still moves the map.
 */
const ClusterPin = React.memo(
  function ClusterPin({ cluster, showLabel, postCount }: { cluster: MapClusterData; showLabel: boolean; postCount: number }) {
    return (
      <View pointerEvents="none" style={{ maxWidth: PIN_COLUMN_WIDTH, alignItems: 'center' }}>
        <ClusterBubble cluster={cluster} selected={cluster.selected} showLabel={showLabel} postCount={postCount} onPress={() => undefined} />
      </View>
    );
  },
  (a, b) =>
    a.cluster.key === b.cluster.key &&
    a.cluster.selected === b.cluster.selected &&
    a.cluster.samePlace === b.cluster.samePlace &&
    clusterLook(a.cluster) === clusterLook(b.cluster) &&
    a.showLabel === b.showLabel &&
    a.postCount === b.postCount,
);

/** What a bubble draws from its members (count, live, boosted, label). */
function clusterLook(cluster: MapClusterData): string {
  return cluster.members.map((m) => `${m.id}:${m.live ? 1 : 0}${m.boosted ? 1 : 0}:${mainTagOf(m)}:${m.title ?? ''}`).join('|');
}

/** One single (unclustered) pin with its #tag label. Taps go to its Marker (see ClusterPin). */
const SinglePin = React.memo(function SinglePin({
  item,
  isSelected,
  live,
  boosted,
  showLabel,
  liveRingStyle,
}: {
  item: DiscoveryNode;
  isSelected: boolean;
  live: boolean;
  boosted: boolean;
  showLabel: boolean;
  liveRingStyle: object;
}) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const hashtag = mainHashtag(item);
  // Listed by @LocalRadar from a public source: its own (slate) pin color.
  const aggregated = isAggregated(item);
  return (
    <View
      pointerEvents="none"
      style={styles.pinColumn}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${hashtag ?? 'Point'}${live ? ', live now' : ''}${boosted ? ', boosted' : ''}`}
    >
      <View style={styles.pinWrapper}>
        {/* Selected: no ring around it; the pin itself shows it (larger, brighter, white rim)
            along with its highlighted #tag label. */}
        {live ? <Animated.View style={[styles.liveRing, liveRingStyle]} /> : null}
        <MapPinGlyph
          fill={
            live && isSelected
              ? c.greenBright
              : live
                ? c.greenDeep
                : isSelected
                  ? c.sky
                  : aggregated
                    ? AGGREGATED_PIN
                    : c.accentDeep
          }
          rim={boosted ? BOOST_GOLD : isSelected ? c.white : live ? c.greenRim : c.pinRim}
          rimWidth={boosted ? 3 : 2.5}
          glow={boosted ? BOOST_GOLD : null}
          enlarged={isSelected}
          dotColor={c.white}
        />
        {/* Boosted: gold rim plus a bolt badge on the pin head */}
        {boosted ? (
          <View style={styles.boostBadge}>
            <Zap size={9} color="#1f1300" fill="#1f1300" strokeWidth={2} />
          </View>
        ) : null}
      </View>
      {hashtag && showLabel ? (
        <View
          style={[
            styles.tagLabel,
            live && styles.tagLabelLive,
            isSelected && styles.tagLabelSelected,
            live && isSelected && styles.tagLabelLiveSelected,
            boosted && styles.tagLabelBoosted,
          ]}
        >
          <Text
            // Always cyan; live / selected / boosted show in the label's border instead.
            style={styles.tagLabelText}
            numberOfLines={1}
          >
            {/* Quiet "#" so the eye goes to the word */}
            <Text style={styles.tagHash}>#</Text>
            {hashtag.replace(/^#+/, '')}
          </Text>
        </View>
      ) : null}
    </View>
  );
},
// Re-render only when something this pin shows changes (cluster updates hand over fresh objects).
(a, b) =>
  a.item.id === b.item.id &&
  mainHashtag(a.item) === mainHashtag(b.item) &&
  isAggregated(a.item) === isAggregated(b.item) &&
  a.isSelected === b.isSelected &&
  a.live === b.live &&
  a.boosted === b.boosted &&
  a.showLabel === b.showLabel &&
  a.liveRingStyle === b.liveRingStyle,
);

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  canvasContainer: {
    flex: 1,
    backgroundColor: c.mapBase,
    overflow: 'hidden',
    position: 'relative',
  },
  // Your dot: the ring and dot centered in a box on your location.
  userBeacon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  userCoreDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: c.me,
    borderWidth: 2,
    borderColor: c.white,
  },
  userPulseRing: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: c.meRing,
    backgroundColor: c.meHalo,
  },
  /* Pinned post: violet speech bubble (Points use cyan/green/gold), tail on the spot. */
  postPin: { alignItems: 'center' },
  postBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minWidth: 34,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: c.violet,
    borderWidth: 1.5,
    borderColor: c.white,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  postBubbleCount: { color: c.white, fontSize: 11, fontWeight: '800' },
  postBubbleWrap: { alignItems: 'center' },
  postBubbleBehind: {
    position: 'absolute',
    top: -3,
    left: 4,
    right: -4,
    height: 24,
    borderRadius: 12,
    backgroundColor: c.violetSoft,
    borderWidth: 1.5,
    borderColor: c.white,
  },
  postBubbleTail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: c.violet,
  },
  tagLabel: {
    marginTop: 1,
    maxWidth: PIN_COLUMN_WIDTH,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.45)',
    backgroundColor: c.mapLabel,
  },
  tagLabelSelected: {
    borderColor: c.accent,
    backgroundColor: c.accentFill,
  },
  // Same cyan, size and weight as the group bubbles' labels (MapCluster).
  tagLabelText: {
    color: c.accent,
    fontSize: 10.5,
    fontWeight: '800',
  },
  tagHash: { fontSize: 8.5, fontWeight: '600', opacity: 0.55 },
  // Ripple from the pin's point (where it touches the map): the tip is 17px below the head's
  // center (17, 17), so this 22px ring is centered on (17, 34).
  // Ripple from the pin's point (where it touches the map): the tip is 17px below the head's
  // center (17, 17), so this 22px ring is centered on (17, 34).
  liveRing: {
    position: 'absolute',
    top: 23,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: c.green,
  },
  boostBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#f59e0b',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  tagLabelBoosted: { borderColor: '#f59e0b', borderWidth: 1.5 },
  tagLabelLive: { borderColor: 'rgba(52, 211, 153, 0.55)' },
  tagLabelLiveSelected: { borderColor: c.green },
  pinWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    padding: 6,
  },
  attribution: {
    position: 'absolute',
    right: 8,
    // Clear of the card sheet, which overlaps the map's bottom edge by its corner radius.
    bottom: 6 + CARD_SHEET_RADIUS,
    zIndex: 20,
    fontSize: 9,
    color: c.textMuted,
    opacity: 0.8,
  },
  crosshairBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.glassStrong,
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 4,
    shadowColor: c.sky,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  /* Sits left of the recenter button: its 14px inset + 38px width + an 8px gap. */
  dropBtn: { right: 60 },
  /* Full-width strip along the map's bottom edge (above the map credit line) that centers the button. */
  searchAreaRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 22 + CARD_SHEET_RADIUS,
    alignItems: 'center',
    zIndex: 20,
  },
  searchAreaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: c.accent,
    zIndex: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  searchAreaText: { color: c.base, fontSize: 13, fontWeight: '800' },
  // A pin over its #tag label (the pin head's middle is PIN_HEAD_CENTER from the top).
  pinColumn: { alignItems: 'center', maxWidth: PIN_COLUMN_WIDTH },
});
