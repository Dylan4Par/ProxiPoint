import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  PanResponder,
  AccessibilityInfo,
} from 'react-native';
import { toCanvasCoordinates, useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { matchesDiscoverFilters } from '../../lib/discoverFilters';
import { useTimeWindow } from '../../lib/timeWindow';
import { isLiveNode } from '../../lib/liveStatus';
import { MessageCircle, Plus, Zap } from 'lucide-react-native';
import { useModeration } from '../../lib/moderation';
import { MapTiles } from './MapTiles';
import { BUBBLE_SIZE, ClusterBubble, ClusterPickSheet, type ClusterMember, type MapClusterData } from './MapCluster';
import { isBoosted, useBoosts } from '../../lib/boost';
import { getChannel, usePosts, type ChannelPost } from '../../lib/channels';
import { isPinLive } from '../../lib/postRanking';
import { absorbIntoMarkers, clusterPins, nudgeOffMarkers } from '../../lib/postPins';
import { PostPickSheet } from './PostPickSheet';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

const { width, height } = Dimensions.get('window');
const CANVAS_HEIGHT = height * 0.52;

// Beacon world coordinates inside 1400x1400 world
const BEACON_WORLD_X = 480;
const BEACON_WORLD_Y = 480;
const WORLD_OFFSET = 200; // top: -200, left: -200

// Exact offset needed to place (BEACON_WORLD_X, BEACON_WORLD_Y) at (width / 2, CANVAS_HEIGHT / 2)
const CENTER_OFFSET_X = width / 2 - (BEACON_WORLD_X - WORLD_OFFSET);
const CENTER_OFFSET_Y = CANVAS_HEIGHT / 2 - (BEACON_WORLD_Y - WORLD_OFFSET);

// Zoom: the map scales from its top-left corner, so a world point w is drawn at
//   screen = pan - WORLD_OFFSET + zoom * w
// Pins, labels and your own dot are counter-scaled so they stay the same size on screen.
const MIN_ZOOM = 0.12; // far enough out to see a whole town's Points as a few bubbles
const MAX_ZOOM = 3;

// Live Points: green pins with a ripple, matching the LIVE badges.
const LIVE_PULSE_MS = 1400;
const ZOOM_STEP = 1.5;
/** Box for a pinned post's bubble + tail (the tail tip sits at the bottom middle). */
const POST_PIN_SIZE = 32;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

// Pin head center sits this far below the top of the pin + label column.
const PIN_HEAD_CENTER = 17;
/**
 * Pins / bubbles only merge when their circles would actually overlap (this is the circle's
 * size on screen), so they can sit close together. #tag labels that would then collide with
 * something more important are hidden instead (they come back when there's room).
 */
const FOOTPRINT_W = 50;
const FOOTPRINT_H = 50;
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

export const DiscoveryMapCanvas: React.FC<{
  liveOnly?: boolean;
  /** Any touch on the map (tap, pin tap or start of a drag), e.g. to close the detail sheet. */
  onMapTouch?: () => void;
  /**
   * Window Y where something covers the bottom of the map (the detail sheet), or null.
   * The selected Point is centered in the part of the map still showing.
   */
  coveredFromY?: number | null;
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
}> = ({
  liveOnly = false,
  onMapTouch,
  coveredFromY = null,
  onOpenPoint,
  cardRequest = null,
  onDropPoint,
  onOpenPost,
  focusRequest = null,
}) => {
  const { colors: c, mode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const nodes = useDiscoveryStore((s) => s.nodes);
  const selectedNodeId = useDiscoveryStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useDiscoveryStore((s) => s.setSelectedNodeId);
  const setViewportBounds = useDiscoveryStore((s) => s.setViewportBounds);

  const selectedTag = useDiscoveryStore((s) => s.selectedTag);
  const activeTab = useDiscoveryStore((s) => s.activeTab);
  const selfCoordinates = useDiscoveryStore((s) => s.selfCoordinates);
  const viewPlace = useDiscoveryStore((s) => s.viewPlace);
  // Your dot, placed relative to the city being shown; hidden when it's off the map entirely.
  const me = toCanvasCoordinates(
    selfCoordinates.latitude,
    selfCoordinates.longitude,
    viewPlace.latitude,
    viewPlace.longitude,
  );
  const meOnMap = me.x > -WORLD_OFFSET && me.x < 1400 - WORLD_OFFSET && me.y > -WORLD_OFFSET && me.y < 1400 - WORLD_OFFSET ? me : null;
  useModeration(); // re-filter when you report or block someone
  const allNodes = Object.values(nodes || {});
  // Same filters as the card list: hashtag chip, Live Now, and Nearby / RSVP'd.
  const boostClock = useBoosts(); // re-render when a boost starts or runs out
  useTimeWindow(); // re-filter when the date window changes (3 days, or Calendar dates)
  // Boosted pins are drawn last so they sit on top of nearby pins.
  const nodeList = allNodes
    .filter((node) => matchesDiscoverFilters(node, { selectedTag, liveOnly, activeTab }))
    .sort((a, b) => Number(isBoosted(a.id, boostClock)) - Number(isBoosted(b.id, boostClock)));

  // Channel posts pinned to a place, while their pin lasts. Same #tag chip as the Points
  // (matched against the post's channel tags); hidden on the RSVP'd view, which is about your plans.
  const posts = usePosts();
  const tagKey = (tag: string) => tag.replace(/^#+/, '').toLowerCase();
  const postPins =
    activeTab === 'RSVPd'
      ? []
      : posts
          .filter((post) => isPinLive(post, boostClock))
          .filter(
            (post) =>
              !selectedTag ||
              selectedTag === 'All' ||
              (getChannel(post.channelId)?.tags ?? []).some((tag) => tagKey(tag) === tagKey(selectedTag)),
          )
          .map((post) => ({
            post,
            ...toCanvasCoordinates(post.place!.latitude, post.place!.longitude, viewPlace.latitude, viewPlace.longitude),
          }));

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
  const liveRingStyle = {
    opacity: livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
    transform: [{ scale: livePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
  };

  // Zoom in coarse steps, so clusters are worked out again only when the zoom really changes.
  const zoomStep = (z: number) => Math.round(Math.log(z) / Math.log(1.15));
  const [clusterStep, setClusterStep] = useState(0);
  const clusterStepRef = useRef(0);

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
    // would touch another shown label or anyone else's circle.
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
      if (hitsLabel || hitsCircle) hiddenLabels.add(spot.id);
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

  const pan = useRef(new Animated.ValueXY({ x: CENTER_OFFSET_X, y: CENTER_OFFSET_Y })).current;
  const currentPan = useRef({ x: CENTER_OFFSET_X, y: CENTER_OFFSET_Y });

  // Real size of the map area (measured on layout); the screen-based guess is only a fallback.
  const viewSize = useRef({ width, height: CANVAS_HEIGHT });
  // Set once the user drags, pinches or zooms, so a late layout doesn't yank the map back.
  const userMoved = useRef(false);

  // Zoom level, as an Animated value for drawing and a plain number for maths.
  const zoom = useRef(new Animated.Value(1)).current;
  const currentZoom = useRef(1);
  const counterZoom = useRef(Animated.divide(1, zoom)).current;

  /** Visible area in world coordinates, so the card list matches the pins on screen. */
  const calculateBounds = (offsetX: number, offsetY: number, z = currentZoom.current) => {
    const step = zoomStep(z);
    if (step !== clusterStepRef.current) {
      clusterStepRef.current = step;
      setClusterStep(step);
    }
    // World position of the map's top-left corner (same units as each Point's x / y).
    const left = (WORLD_OFFSET - offsetX) / z;
    const top = (WORLD_OFFSET - offsetY) / z;
    const minX = left - 40;
    const maxX = left + viewSize.current.width / z + 40;
    const minY = top - 40;
    const maxY = top + viewSize.current.height / z + 40;
    setViewportBounds({ minX, maxX, minY, maxY });
  };

  /** Moves and zooms the map (animated), keeping the refs in step. */
  const animateTo = (target: { x: number; y: number }, z = currentZoom.current) => {
    pan.stopAnimation();
    zoom.stopAnimation();
    Animated.parallel([
      Animated.spring(pan, { toValue: target, useNativeDriver: false, friction: 8, tension: 45 }),
      Animated.spring(zoom, { toValue: z, useNativeDriver: false, friction: 8, tension: 45 }),
    ]).start();
    currentPan.current = target;
    currentZoom.current = z;
    calculateBounds(target.x, target.y, z);
  };

  useEffect(() => {
    calculateBounds(CENTER_OFFSET_X, CENTER_OFFSET_Y);
  }, []);

  // Where the map sits on screen, to work out how much of it is visible above an overlay.
  const containerRef = useRef<View | null>(null);
  const [frame, setFrame] = useState<{ top: number; width: number; height: number } | null>(null);
  const frameOrigin = useRef({ left: 0, top: 0 });

  /** Pan that puts your position in the middle of the map (or of its visible part). */
  const homeTarget = (z = 1, visibleHeight = viewSize.current.height) => ({
    x: viewSize.current.width / 2 + WORLD_OFFSET - z * BEACON_WORLD_X,
    y: visibleHeight / 2 + WORLD_OFFSET - z * BEACON_WORLD_Y,
  });

  /** Pan that puts a lat/lon in the middle of the visible map. */
  const focusTargetFor = (spot: { latitude: number; longitude: number }, visibleHeight = visibleMapHeight()) => {
    const world = toCanvasCoordinates(spot.latitude, spot.longitude, viewPlace.latitude, viewPlace.longitude);
    const z = currentZoom.current;
    return {
      x: viewSize.current.width / 2 + WORLD_OFFSET - z * world.x,
      y: visibleHeight / 2 + WORLD_OFFSET - z * world.y,
    };
  };

  /** Height of the map not hidden by the detail sheet. */
  // Latest values for timers and layout callbacks (which can run after a render).
  const coveredRef = useRef<number | null>(coveredFromY);
  coveredRef.current = coveredFromY;
  const selectedPosRef = useRef<{ x: number; y: number } | null>(null);
  selectedPosRef.current =
    selectedNode && selectedNode.x != null && selectedNode.y != null ? { x: selectedNode.x, y: selectedNode.y } : null;

  /** Height of the map not hidden by the detail sheet. */
  const visibleMapHeight = () =>
    coveredRef.current != null
      ? Math.max(80, Math.min(viewSize.current.height, coveredRef.current - frameOrigin.current.top))
      : viewSize.current.height;

  /** Slides the selected Point to the middle of what's visible (at the current zoom). */
  const focusSelected = () => {
    const spot = selectedPosRef.current;
    if (!spot) return;
    const z = currentZoom.current;
    animateTo({
      x: viewSize.current.width / 2 + WORLD_OFFSET - z * spot.x,
      y: visibleMapHeight() / 2 + WORLD_OFFSET - z * spot.y,
    });
  };

  // When the map changes size (e.g. the card list expands or collapses), re-center the selected
  // Point once the resize settles, so it doesn't end up hidden behind the cards.
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (resizeTimer.current) clearTimeout(resizeTimer.current);
  }, []);
  const measureFrame = () => {
    containerRef.current?.measureInWindow((x, y, w, h) => {
      // Ignore the tiny sizes the map passes through while the card list covers it.
      if (Number.isFinite(y) && w > 0 && h >= 80) {
        const previous = viewSize.current;
        const resized = frame != null && (Math.abs(previous.height - h) > 2 || Math.abs(previous.width - w) > 2);
        frameOrigin.current = { left: x, top: y };
        viewSize.current = { width: w, height: h };
        setFrame({ top: y, width: w, height: h });
        if (resized && selectedPosRef.current) {
          if (resizeTimer.current) clearTimeout(resizeTimer.current);
          resizeTimer.current = setTimeout(focusSelected, 180);
        }
        if (focusRequest && focusRequest.key !== lastFocusKey.current) {
          // Opened to show a spot (e.g. a pinned post): start there instead of on you.
          lastFocusKey.current = focusRequest.key;
          userMoved.current = true;
          const target = focusTargetFor(focusRequest, h);
          pan.setValue(target);
          currentPan.current = target;
          calculateBounds(target.x, target.y);
        } else if (!userMoved.current) {
          // First layout: put you in the real middle of the map (no animation).
          const home = homeTarget(currentZoom.current, h);
          pan.setValue(home);
          currentPan.current = home;
          calculateBounds(home.x, home.y);
        }
      }
    });
  };

  // "Show on map" for a spot: slide there now if the map is laid out, otherwise on first layout.
  const lastFocusKey = useRef(0);
  useEffect(() => {
    if (!focusRequest || focusRequest.key === lastFocusKey.current) return;
    if (viewSize.current.width <= 0) return; // measureFrame handles it once the map has a size
    lastFocusKey.current = focusRequest.key;
    userMoved.current = true;
    animateTo(focusTargetFor(focusRequest));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.key]);

  // Selecting a Point (card or pin) slides the map so it sits in the middle of the visible area.
  const selectedX = selectedNode?.x;
  const selectedY = selectedNode?.y;
  // Only move when the selection or the sheet changes (not on first load or re-layout),
  // so the map still opens centered on you and doesn't fight the user's own panning.
  const lastFocus = useRef<{ id: unknown; covered: number | null } | null>(null);
  useEffect(() => {
    const previous = lastFocus.current;
    lastFocus.current = { id: selectedNodeId, covered: coveredFromY };
    if (!previous) return; // first render
    if (previous.id === selectedNodeId && previous.covered === coveredFromY) return;
    if (selectedX == null || selectedY == null) return;
    userMoved.current = true;
    focusSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, coveredFromY]);

  // Recenter: back on you, at normal zoom.
  const handleRecenter = () => animateTo(homeTarget(1, visibleMapHeight()), 1);

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
    const visibleH = visibleMapHeight();
    const pad = 120; // screen points of margin (pins, labels)
    const fit = Math.min(
      (viewSize.current.width - pad) / Math.max(1, maxX - minX),
      (visibleH - pad) / Math.max(1, maxY - minY),
    );
    const next = clampZoom(Math.max(currentZoom.current * 1.4, Math.min(fit, MAX_ZOOM)));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    animateTo(
      {
        x: viewSize.current.width / 2 + WORLD_OFFSET - next * midX,
        y: visibleH / 2 + WORLD_OFFSET - next * midY,
      },
      next,
    );
  };

  // Switching city: glide to the middle of the new place.
  const lastPlace = useRef(`${viewPlace.latitude},${viewPlace.longitude}`);
  useEffect(() => {
    const placeKey = `${viewPlace.latitude},${viewPlace.longitude}`;
    if (placeKey === lastPlace.current) return;
    lastPlace.current = placeKey;
    userMoved.current = false;
    handleRecenter();
  }, [viewPlace.latitude, viewPlace.longitude]);

  /** + / − buttons: zoom around the middle of the map. */
  const zoomBy = (factor: number) => {
    const z = currentZoom.current;
    const next = clampZoom(z * factor);
    if (next === z) return;
    userMoved.current = true;
    const cx = viewSize.current.width / 2;
    const cy = viewSize.current.height / 2;
    const worldX = (cx + WORLD_OFFSET - currentPan.current.x) / z;
    const worldY = (cy + WORLD_OFFSET - currentPan.current.y) / z;
    animateTo({ x: cx + WORLD_OFFSET - next * worldX, y: cy + WORLD_OFFSET - next * worldY }, next);
  };

  // One finger drags; two fingers pinch to zoom (and drag) around the point between them.
  const gesture = useRef({
    mode: 'none' as 'none' | 'drag' | 'pinch',
    startPan: { x: 0, y: 0 },
    baseDx: 0,
    baseDy: 0,
    startZoom: 1,
    startDistance: 1,
    anchor: { x: 0, y: 0 }, // world point under the fingers when the pinch began
  });

  const panResponder = useRef(
    PanResponder.create({
      // Two fingers down claims the gesture straight away (so pins don't steal a pinch).
      onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponder: (evt, gestureState) =>
        evt.nativeEvent.touches.length >= 2 || Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        pan.stopAnimation();
        zoom.stopAnimation();
        gesture.current.mode = 'none';
      },
      onPanResponderMove: (evt, gestureState) => {
        const g = gesture.current;
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          const [a, b] = touches;
          const midX = (a.pageX + b.pageX) / 2 - frameOrigin.current.left;
          const midY = (a.pageY + b.pageY) / 2 - frameOrigin.current.top;
          const distance = Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY));
          if (g.mode !== 'pinch') {
            g.mode = 'pinch';
            userMoved.current = true;
            g.startZoom = currentZoom.current;
            g.startDistance = distance;
            g.anchor = {
              x: (midX + WORLD_OFFSET - currentPan.current.x) / g.startZoom,
              y: (midY + WORLD_OFFSET - currentPan.current.y) / g.startZoom,
            };
          }
          const z = clampZoom((g.startZoom * distance) / g.startDistance);
          const next = { x: midX + WORLD_OFFSET - z * g.anchor.x, y: midY + WORLD_OFFSET - z * g.anchor.y };
          currentZoom.current = z;
          currentPan.current = next;
          zoom.setValue(z);
          pan.setValue(next);
          calculateBounds(next.x, next.y, z);
          return;
        }
        // One finger (including after lifting one finger from a pinch): drag from here.
        if (g.mode !== 'drag') {
          g.mode = 'drag';
          userMoved.current = true;
          g.startPan = { ...currentPan.current };
          g.baseDx = gestureState.dx;
          g.baseDy = gestureState.dy;
        }
        const next = {
          x: g.startPan.x + gestureState.dx - g.baseDx,
          y: g.startPan.y + gestureState.dy - g.baseDy,
        };
        currentPan.current = next;
        pan.setValue(next);
        calculateBounds(next.x, next.y);
      },
      onPanResponderRelease: () => {
        gesture.current.mode = 'none';
        calculateBounds(currentPan.current.x, currentPan.current.y);
      },
      onPanResponderTerminate: () => {
        gesture.current.mode = 'none';
      },
    })
  ).current;

  return (
    <View
      ref={containerRef}
      onLayout={measureFrame}
      style={styles.canvasContainer}
      {...panResponder.panHandlers}
      // onTouchStart sees every touch without taking it, so panning and pin taps still work.
      onTouchStart={onMapTouch}
    >
      <Animated.View
        style={[
          styles.interactiveWorld,
          {
            transformOrigin: [0, 0, 0],
            transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }],
          },
        ]}
      >
        {/* Faint grid: only seen if the map tiles can't load (offline) */}
        <View style={styles.gridLineH1} />
        <View style={styles.gridLineH2} />
        <View style={styles.gridLineH3} />
        <View style={styles.gridLineV1} />
        <View style={styles.gridLineV2} />
        <View style={styles.gridLineV3} />

        {/* Real streets around the city being shown (moves and zooms with the pins) */}
        <MapTiles
          latitude={viewPlace.latitude}
          longitude={viewPlace.longitude}
          mode={mode}
          tint={mode === 'light' ? 'rgba(233, 238, 245, 0.12)' : 'rgba(10, 17, 32, 0.28)'}
        />

        {/* You: at the middle of the map when it's showing your area; elsewhere (or hidden,
            when far away) while you're looking at another city. */}
        {meOnMap ? (
        <Animated.View
          style={[
            styles.userBeaconContainer,
            { top: meOnMap.y, left: meOnMap.x },
            { transformOrigin: [0, 0, 0], transform: [{ scale: counterZoom }] },
          ]}
        >
          <View style={styles.userPulseRing} />
          <View style={styles.userCoreDot} />
        </Animated.View>
        ) : null}

        {/* Pinned channel posts: speech bubbles (one per group), under the Point pins. */}
        {postGroups.map((group) => {
          const many = group.members.length > 1;
          const only = group.members[0].post;
          // Nudge is in screen pixels; the layer is in world units at this zoom.
          const left = group.x + group.dx / clusterZoom - POST_PIN_SIZE / 2;
          const top = group.y + group.dy / clusterZoom - POST_PIN_SIZE;
          return (
            <Animated.View
              key={`post-${group.key}`}
              pointerEvents="box-none"
              style={[
                styles.postPin,
                { top, left },
                // Same size at any zoom, anchored on the bubble's tail.
                { transformOrigin: [POST_PIN_SIZE / 2, POST_PIN_SIZE, 0], transform: [{ scale: counterZoom }] },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => (many ? setPickPosts(group.members.map((m) => m.post)) : onOpenPost?.(only.id))}
                style={styles.postBubbleWrap}
                accessibilityRole="button"
                accessibilityLabel={
                  many
                    ? `${group.members.length} posts here. Show the list`
                    : `Post at ${only.place?.label ?? 'this spot'}: ${only.body}`
                }
                testID={many ? `map-posts-${group.key}` : `map-post-${only.id}`}
              >
                {/* Grouped: a second bubble peeking out behind, like a stack. */}
                {many ? <View pointerEvents="none" style={styles.postBubbleBehind} /> : null}
                <View style={styles.postBubble}>
                  <MessageCircle size={13} color={c.white} fill={c.white} strokeWidth={2} />
                  <Text style={styles.postBubbleCount}>{many ? group.members.length : only.upvotes}</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.postBubbleTail} />
            </Animated.View>
          );
        })}

        {/* Interactive Event Nodes: pin + main hashtag */}
        {/* Cluster bubbles (several Points close together) */}
        {clusters.map((cluster) => (
          <Animated.View
            key={cluster.key}
            pointerEvents="box-none"
            style={[
              styles.nodeCluster,
              { top: cluster.y - BUBBLE_SIZE / 2 - 6, left: cluster.x - PIN_COLUMN_WIDTH / 2 },
              // Bubbles sit above single pins; boosted / selected bubbles above other bubbles.
              { zIndex: cluster.selected ? 12 : cluster.members.some((m) => m.boosted) ? 10 : 8 },
              {
                transformOrigin: [PIN_COLUMN_WIDTH / 2, BUBBLE_SIZE / 2 + 6, 0],
                transform: [{ scale: counterZoom }],
              },
            ]}
          >
            <ClusterBubble
              cluster={cluster}
              selected={cluster.selected}
              showLabel={!hiddenLabels.has(cluster.key)}
              postCount={postsByCluster[cluster.key]?.length ?? 0}
              onPress={() => openCluster(cluster)}
            />
          </Animated.View>
        ))}

        {singles.map((item) => {
          const isSelected = item.id === selectedNodeId;
          const posX = item.x ?? 480;
          const posY = item.y ?? 480;
          const hashtag = mainHashtag(item);
          const live = isLiveNode(item);
          const boosted = isBoosted(item.id, boostClock);

          return (
            <Animated.View
              key={item.id}
              pointerEvents="box-none"
              style={[
                styles.nodeCluster,
                { top: posY - PIN_HEAD_CENTER, left: posX - PIN_COLUMN_WIDTH / 2 },
                // Same size on screen at any zoom, anchored on the pin head.
                { transformOrigin: [PIN_COLUMN_WIDTH / 2, PIN_HEAD_CENTER, 0], transform: [{ scale: counterZoom }] },
                isSelected && styles.nodeClusterSelected,
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedNodeId(item.id)}
                style={styles.pinWrapper}
                accessibilityRole="button"
                accessibilityLabel={`${hashtag ?? 'Point'}${live ? ', live now' : ''}${boosted ? ', boosted' : ''}`}
              >
                {/* Selected: a solid glowing ring around the pin (no expanding beacon) */}
                {isSelected ? (
                  <View pointerEvents="none" style={[styles.selectedHalo, live && styles.selectedHaloLive]} />
                ) : null}
                {live ? <Animated.View pointerEvents="none" style={[styles.liveRing, liveRingStyle]} /> : null}
                <View
                  style={[
                    styles.pinHead,
                    isSelected && styles.pinHeadSelected,
                    live && styles.pinHeadLive,
                    live && isSelected && styles.pinHeadLiveSelected,
                    boosted && styles.pinHeadBoosted,
                  ]}
                >
                  <View style={styles.pinDot} />
                </View>
                {/* Boosted: gold rim plus a bolt badge on the pin head */}
                {boosted ? (
                  <View pointerEvents="none" style={styles.boostBadge}>
                    <Zap size={9} color="#1f1300" fill="#1f1300" strokeWidth={2} />
                  </View>
                ) : null}
                <View
                  style={[
                    styles.pinTip,
                    isSelected && styles.pinTipSelected,
                    live && styles.pinTipLive,
                    live && isSelected && styles.pinTipLiveSelected,
                  ]}
                />
              </TouchableOpacity>
              {hashtag && !hiddenLabels.has(item.id) ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedNodeId(item.id)}
                  style={[
                    styles.tagLabel,
                    live && styles.tagLabelLive,
                    isSelected && styles.tagLabelSelected,
                    live && isSelected && styles.tagLabelLiveSelected,
                    boosted && styles.tagLabelBoosted,
                  ]}
                >
                  <Text
                    style={[styles.tagLabelText, live && styles.tagLabelTextLive, isSelected && styles.tagLabelTextSelected]}
                    numberOfLines={1}
                  >
                    {/* Quiet "#" so the eye goes to the word */}
                    <Text style={styles.tagHash}>#</Text>
                    {hashtag.replace(/^#+/, '')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </Animated.View>
          );
        })}
      </Animated.View>

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

      {/* Map credit (required by the tile provider) */}
      <Text style={styles.attribution} pointerEvents="none">
        © Esri
      </Text>

      {/* Pure View-based Tactical Crosshair Recenter Button */}
      <TouchableOpacity
        style={styles.crosshairBtn}
        activeOpacity={0.7}
        onPress={handleRecenter}
      >
        <View style={styles.crosshairCircleOuter}>
          <View style={styles.crosshairCircleInner} />
          <View style={styles.crosshairLineV} />
          <View style={styles.crosshairLineH} />
        </View>
      </TouchableOpacity>

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

      {/* Zoom buttons (also handy on the emulator, where pinching needs Ctrl + drag) */}
      <View style={styles.zoomStack}>
        <TouchableOpacity
          style={styles.zoomBtn}
          activeOpacity={0.7}
          onPress={() => zoomBy(ZOOM_STEP)}
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
          testID="map-zoom-in"
        >
          <Text style={styles.zoomText}>+</Text>
        </TouchableOpacity>
        <View style={styles.zoomDivider} />
        <TouchableOpacity
          style={styles.zoomBtn}
          activeOpacity={0.7}
          onPress={() => zoomBy(1 / ZOOM_STEP)}
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
          testID="map-zoom-out"
        >
          <Text style={styles.zoomText}>−</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  canvasContainer: {
    flex: 1,
    backgroundColor: c.mapBase,
    overflow: 'hidden',
    position: 'relative',
  },
  interactiveWorld: {
    width: 1400,
    height: 1400,
    position: 'absolute',
    top: -WORLD_OFFSET,
    left: -WORLD_OFFSET,
  },
  gridLineH1: { position: 'absolute', top: 300, left: 0, right: 0, height: 1, backgroundColor: c.border },
  gridLineH2: { position: 'absolute', top: 600, left: 0, right: 0, height: 1, backgroundColor: c.border },
  gridLineH3: { position: 'absolute', top: 900, left: 0, right: 0, height: 1, backgroundColor: c.border },
  gridLineV1: { position: 'absolute', left: 300, top: 0, bottom: 0, width: 1, backgroundColor: c.border },
  gridLineV2: { position: 'absolute', left: 600, top: 0, bottom: 0, width: 1, backgroundColor: c.border },
  gridLineV3: { position: 'absolute', left: 900, top: 0, bottom: 0, width: 1, backgroundColor: c.border },
  roadDiagonal1: {
    position: 'absolute',
    top: 100,
    left: 200,
    width: 8,
    height: 900,
    backgroundColor: c.chipBlue,
    transform: [{ rotate: '32deg' }],
  },
  roadDiagonal2: {
    position: 'absolute',
    top: 200,
    right: 300,
    width: 10,
    height: 800,
    backgroundColor: c.chipBlue,
    transform: [{ rotate: '-40deg' }],
  },
  // Zero-size anchor sitting exactly on your location; the dot and ring are centered on it
  // (otherwise the dot's top-left corner, not its middle, lands on the spot).
  userBeaconContainer: {
    position: 'absolute',
    top: BEACON_WORLD_Y,
    left: BEACON_WORLD_X,
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    zIndex: 2, // under pins and bubbles, so it never covers a count
  },
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
  postPin: {
    position: 'absolute',
    width: POST_PIN_SIZE,
    height: POST_PIN_SIZE,
    alignItems: 'center',
    zIndex: 3,
  },
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
  nodeCluster: {
    position: 'absolute',
    alignItems: 'center',
    width: PIN_COLUMN_WIDTH,
    zIndex: 4,
  },
  nodeClusterSelected: {
    zIndex: 7,
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
  tagLabelText: {
    color: c.accentSoft,
    fontSize: 9,
    fontWeight: '700',
  },
  tagHash: { fontSize: 7.5, fontWeight: '600', opacity: 0.55 },
  tagLabelTextSelected: {
    color: c.text,
    fontWeight: '800',
  },
  liveRing: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: c.green,
  },
  pinHeadLive: { backgroundColor: c.greenDeep, borderColor: c.greenRim },
  // Boost gold (same in day and night): thick rim on the head, bolt badge, gold label border.
  pinHeadBoosted: {
    borderColor: '#f59e0b',
    borderWidth: 3,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
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
  pinHeadLiveSelected: { backgroundColor: c.greenBright, borderColor: c.white },
  pinTipLive: { borderTopColor: c.greenDeep },
  pinTipLiveSelected: { borderTopColor: c.greenBright },
  tagLabelLive: { borderColor: 'rgba(52, 211, 153, 0.55)' },
  tagLabelLiveSelected: { borderColor: c.green, backgroundColor: c.greenInk },
  tagLabelTextLive: { color: c.greenBright },
  pinWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    padding: 6,
  },
  pinHead: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: c.pinRim,
  },
  // Ring centered on the pin head (head is 22px, 6px in from the wrapper's edge).
  selectedHalo: {
    position: 'absolute',
    top: -5,
    left: -5,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: c.accent,
    backgroundColor: 'rgba(34, 211, 238, 0.22)',
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  selectedHaloLive: {
    borderColor: c.green,
    backgroundColor: 'rgba(52, 211, 153, 0.22)',
    shadowColor: c.green,
  },
  pinHeadSelected: {
    backgroundColor: c.sky,
    borderColor: c.white,
    transform: [{ scale: 1.25 }],
  },
  pinDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.white,
  },
  pinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: c.accentDeep,
    marginTop: -1,
  },
  pinTipSelected: {
    borderTopColor: c.sky,
  },
  attribution: {
    position: 'absolute',
    right: 8,
    bottom: 6,
    zIndex: 20,
    fontSize: 9,
    color: c.textMuted,
    opacity: 0.8,
  },
  zoomStack: {
    position: 'absolute',
    top: 62,
    right: 14,
    width: 38,
    borderRadius: 19,
    backgroundColor: c.glassStrong,
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    zIndex: 20,
    overflow: 'hidden',
  },
  zoomBtn: { height: 38, alignItems: 'center', justifyContent: 'center' },
  zoomText: { color: c.sky, fontSize: 20, fontWeight: '700', lineHeight: 22 },
  zoomDivider: { height: 1, marginHorizontal: 8, backgroundColor: 'rgba(56, 189, 248, 0.25)' },
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
  crosshairCircleOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: c.sky,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  crosshairCircleInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.sky,
  },
  crosshairLineV: {
    position: 'absolute',
    width: 2,
    height: 24,
    backgroundColor: c.sky,
    borderRadius: 1,
  },
  crosshairLineH: {
    position: 'absolute',
    width: 24,
    height: 2,
    backgroundColor: c.sky,
    borderRadius: 1,
  },
});
