import React, { useRef, useEffect, useState } from 'react';
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
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { isLiveNode } from '../../lib/liveStatus';

const { width, height } = Dimensions.get('window');
const CANVAS_HEIGHT = height * 0.52;

// Beacon world coordinates inside 1400x1400 world
const BEACON_WORLD_X = 480;
const BEACON_WORLD_Y = 480;
const WORLD_OFFSET = 200; // top: -200, left: -200

// Exact offset needed to place (BEACON_WORLD_X, BEACON_WORLD_Y) at (width / 2, CANVAS_HEIGHT / 2)
const CENTER_OFFSET_X = width / 2 - (BEACON_WORLD_X - WORLD_OFFSET);
const CENTER_OFFSET_Y = CANVAS_HEIGHT / 2 - (BEACON_WORLD_Y - WORLD_OFFSET);

// Map scale: the old 500m ring was 140px across, so 70px per 500m.
const PX_PER_METER = 70 / 500;
const DEFAULT_REACH_METERS = 500;
const MIN_PULSE_RADIUS = 30;
const MAX_PULSE_RADIUS = 220;
const PULSE_MS = 1800;
// Pin head center sits this far below the top of the pin + label column.
const PIN_HEAD_CENTER = 17;
const PIN_COLUMN_WIDTH = 140;

/** Beacon reach for a node, in meters, from whichever field the node carries. */
function reachMeters(node: unknown): number {
  const n = node as Record<string, unknown>;
  for (const key of ['radiusMeters', 'beaconRadiusMeters', 'reachMeters']) {
    const value = n[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return DEFAULT_REACH_METERS;
}

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

/**
 * Selected Point only: a ring that grows from the pin out to the beacon's full reach and fades,
 * twice per cycle so there's always one on its way out. Holds still with Reduce Motion on.
 */
const BeaconPulse: React.FC<{ x: number; y: number; radius: number; reducedMotion: boolean }> = ({
  x,
  y,
  radius,
  reducedMotion,
}) => {
  const first = useRef(new Animated.Value(0)).current;
  const second = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) return;
    const wave = (value: Animated.Value) =>
      Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration: PULSE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      );
    first.setValue(0);
    second.setValue(0);
    const a = wave(first);
    const b = wave(second);
    a.start();
    const timer = setTimeout(() => b.start(), PULSE_MS / 2);
    return () => {
      clearTimeout(timer);
      a.stop();
      b.stop();
    };
  }, [reducedMotion, first, second]);

  const size = radius * 2;
  const frame = { top: y - radius, left: x - radius, width: size, height: size, borderRadius: radius };
  const startScale = Math.min(1, 14 / radius); // starts about the size of the pin

  if (reducedMotion) {
    return <View pointerEvents="none" style={[styles.pulseRing, styles.pulseStill, frame]} />;
  }

  const ringStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.95, 0] }),
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [startScale, 1] }) }],
  });

  return (
    <>
      {/* Faint outline of the full reach, so the edge is readable between pulses. */}
      <View pointerEvents="none" style={[styles.reachOutline, frame]} />
      <Animated.View pointerEvents="none" style={[styles.pulseRing, frame, ringStyle(first)]} />
      <Animated.View pointerEvents="none" style={[styles.pulseRing, frame, ringStyle(second)]} />
    </>
  );
};

export const DiscoveryMapCanvas: React.FC<{ liveOnly?: boolean }> = ({ liveOnly = false }) => {
  const nodes = useDiscoveryStore((s) => s.nodes);
  const selectedNodeId = useDiscoveryStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useDiscoveryStore((s) => s.setSelectedNodeId);
  const setViewportBounds = useDiscoveryStore((s) => s.setViewportBounds);

  const allNodes = Object.values(nodes || {});
  // Live Now filter: hide pins that aren't happening right now.
  const nodeList = liveOnly ? allNodes.filter(isLiveNode) : allNodes;

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

  const selectedNode = nodeList.find((item) => item.id === selectedNodeId) ?? null;

  const pan = useRef(new Animated.ValueXY({ x: CENTER_OFFSET_X, y: CENTER_OFFSET_Y })).current;
  const currentPan = useRef({ x: CENTER_OFFSET_X, y: CENTER_OFFSET_Y });

  const calculateBounds = (offsetX: number, offsetY: number) => {
    const minX = -offsetX - 40;
    const maxX = -offsetX + width + 40;
    const minY = -offsetY - 40;
    const maxY = -offsetY + CANVAS_HEIGHT + 40;
    setViewportBounds({ minX, maxX, minY, maxY });
  };

  useEffect(() => {
    calculateBounds(CENTER_OFFSET_X, CENTER_OFFSET_Y);
  }, []);

  const handleRecenter = () => {
    Animated.spring(pan, {
      toValue: { x: CENTER_OFFSET_X, y: CENTER_OFFSET_Y },
      useNativeDriver: false,
      friction: 7,
      tension: 40,
    }).start();
    currentPan.current = { x: CENTER_OFFSET_X, y: CENTER_OFFSET_Y };
    calculateBounds(CENTER_OFFSET_X, CENTER_OFFSET_Y);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
      },
      onPanResponderGrant: () => {
        pan.setOffset({ x: currentPan.current.x, y: currentPan.current.y });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
        listener: (_, gestureState) => {
          const projectedX = currentPan.current.x + gestureState.dx;
          const projectedY = currentPan.current.y + gestureState.dy;
          calculateBounds(projectedX, projectedY);
        },
      }),
      onPanResponderRelease: (_, gestureState) => {
        currentPan.current.x += gestureState.dx;
        currentPan.current.y += gestureState.dy;
        pan.flattenOffset();
        calculateBounds(currentPan.current.x, currentPan.current.y);
      },
    })
  ).current;

  return (
    <View style={styles.canvasContainer} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.interactiveWorld,
          {
            transform: [{ translateX: pan.x }, { translateY: pan.y }],
          },
        ]}
      >
        {/* Tactical Grid Overlay */}
        <View style={styles.gridLineH1} />
        <View style={styles.gridLineH2} />
        <View style={styles.gridLineH3} />
        <View style={styles.gridLineV1} />
        <View style={styles.gridLineV2} />
        <View style={styles.gridLineV3} />

        {/* Diagonal Arteries */}
        <View style={styles.roadDiagonal1} />
        <View style={styles.roadDiagonal2} />

        {/* User Beacon Reticle (Origin: 480, 480) */}
        <View style={styles.userBeaconContainer}>
          <View style={styles.userPulseRing} />
          <View style={styles.userCoreDot} />
        </View>

        {/* Selected Point: pulsing beacon (no rings on unselected Points) */}
        {selectedNode ? (
          <BeaconPulse
            key={selectedNode.id}
            x={selectedNode.x ?? 480}
            y={selectedNode.y ?? 480}
            radius={Math.max(
              MIN_PULSE_RADIUS,
              Math.min(MAX_PULSE_RADIUS, reachMeters(selectedNode) * PX_PER_METER),
            )}
            reducedMotion={reducedMotion}
          />
        ) : null}

        {/* Interactive Event Nodes: pin + main hashtag */}
        {nodeList.map((item) => {
          const isSelected = item.id === selectedNodeId;
          const posX = item.x ?? 480;
          const posY = item.y ?? 480;
          const hashtag = mainHashtag(item);

          return (
            <View
              key={item.id}
              pointerEvents="box-none"
              style={[
                styles.nodeCluster,
                { top: posY - PIN_HEAD_CENTER, left: posX - PIN_COLUMN_WIDTH / 2 },
                isSelected && styles.nodeClusterSelected,
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedNodeId(item.id)}
                style={styles.pinWrapper}
                accessibilityRole="button"
                accessibilityLabel={hashtag ? `${hashtag} Point` : 'Point'}
              >
                <View
                  style={[
                    styles.pinHead,
                    isSelected && styles.pinHeadSelected,
                  ]}
                >
                  <View style={styles.pinDot} />
                </View>
                <View
                  style={[
                    styles.pinTip,
                    isSelected && styles.pinTipSelected,
                  ]}
                />
              </TouchableOpacity>
              {hashtag ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedNodeId(item.id)}
                  style={[styles.tagLabel, isSelected && styles.tagLabelSelected]}
                >
                  <Text style={[styles.tagLabelText, isSelected && styles.tagLabelTextSelected]} numberOfLines={1}>
                    {hashtag}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </Animated.View>

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
    </View>
  );
};

const styles = StyleSheet.create({
  canvasContainer: {
    flex: 1,
    backgroundColor: '#0a1120',
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
  gridLineH1: { position: 'absolute', top: 300, left: 0, right: 0, height: 1, backgroundColor: '#1e293b' },
  gridLineH2: { position: 'absolute', top: 600, left: 0, right: 0, height: 1, backgroundColor: '#1e293b' },
  gridLineH3: { position: 'absolute', top: 900, left: 0, right: 0, height: 1, backgroundColor: '#1e293b' },
  gridLineV1: { position: 'absolute', left: 300, top: 0, bottom: 0, width: 1, backgroundColor: '#1e293b' },
  gridLineV2: { position: 'absolute', left: 600, top: 0, bottom: 0, width: 1, backgroundColor: '#1e293b' },
  gridLineV3: { position: 'absolute', left: 900, top: 0, bottom: 0, width: 1, backgroundColor: '#1e293b' },
  roadDiagonal1: {
    position: 'absolute',
    top: 100,
    left: 200,
    width: 8,
    height: 900,
    backgroundColor: '#172554',
    transform: [{ rotate: '32deg' }],
  },
  roadDiagonal2: {
    position: 'absolute',
    top: 200,
    right: 300,
    width: 10,
    height: 800,
    backgroundColor: '#172554',
    transform: [{ rotate: '-40deg' }],
  },
  userBeaconContainer: {
    position: 'absolute',
    top: BEACON_WORLD_Y,
    left: BEACON_WORLD_X,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  userCoreDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#38bdf8',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  userPulseRing: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
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
  reachOutline: {
    position: 'absolute',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(34, 211, 238, 0.35)',
    zIndex: 3,
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#22d3ee',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    zIndex: 3,
  },
  pulseStill: {
    opacity: 0.6,
    borderStyle: 'dashed',
  },
  tagLabel: {
    marginTop: 1,
    maxWidth: PIN_COLUMN_WIDTH,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.45)',
    backgroundColor: 'rgba(10, 17, 32, 0.9)',
  },
  tagLabelSelected: {
    borderColor: '#22d3ee',
    backgroundColor: '#0e3a47',
  },
  tagLabelText: {
    color: '#67e8f9',
    fontSize: 9,
    fontWeight: '700',
  },
  tagLabelTextSelected: {
    color: '#f8fafc',
    fontWeight: '800',
  },
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
    backgroundColor: '#06b6d4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#e0f2fe',
  },
  pinHeadSelected: {
    backgroundColor: '#38bdf8',
    borderColor: '#ffffff',
    transform: [{ scale: 1.2 }],
  },
  pinDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  pinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#06b6d4',
    marginTop: -1,
  },
  pinTipSelected: {
    borderTopColor: '#38bdf8',
  },
  crosshairBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 4,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  crosshairCircleOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  crosshairCircleInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#38bdf8',
  },
  crosshairLineV: {
    position: 'absolute',
    width: 2,
    height: 24,
    backgroundColor: '#38bdf8',
    borderRadius: 1,
  },
  crosshairLineH: {
    position: 'absolute',
    width: 24,
    height: 2,
    backgroundColor: '#38bdf8',
    borderRadius: 1,
  },
});
