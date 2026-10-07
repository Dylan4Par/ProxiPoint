import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { eventMatchesMapFilter, presentAssignedTag } from '../../lib/beaconDrop';
import { focusOffsetForPoint, visibleWorldBounds } from '../../lib/discoveryFocus';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';

const { width, height } = Dimensions.get('window');
const CANVAS_HEIGHT = height * 0.52;
const PAN_SLOP_PX = 4;

function exceedsPanSlop(gestureState: { dx: number; dy: number }): boolean {
  return Math.abs(gestureState.dx) > PAN_SLOP_PX || Math.abs(gestureState.dy) > PAN_SLOP_PX;
}

function responderTestId(event: { nativeEvent?: { target?: unknown } }): string {
  const target = event.nativeEvent?.target as {
    closest?: (selector: string) => { getAttribute?: (name: string) => string | null } | null;
  } | null;
  const tagged = target?.closest?.('[data-testid]');
  return tagged?.getAttribute?.('data-testid') ?? '';
}

function isPinOrRecenterTarget(event: { nativeEvent?: { target?: unknown } }): boolean {
  const testId = responderTestId(event);
  return testId === 'discovery-recenter' || testId.startsWith('discovery-pin-');
}

// Beacon world coordinates inside 1400x1400 world
const BEACON_WORLD_X = 480;
const BEACON_WORLD_Y = 480;
const WORLD_OFFSET = 200; // top: -200, left: -200

// Exact offset needed to place (BEACON_WORLD_X, BEACON_WORLD_Y) at (width / 2, CANVAS_HEIGHT / 2)
const CENTER_OFFSET_X = width / 2 - (BEACON_WORLD_X - WORLD_OFFSET);
const CENTER_OFFSET_Y = CANVAS_HEIGHT / 2 - (BEACON_WORLD_Y - WORLD_OFFSET);

export const DiscoveryMapCanvas: React.FC = () => {
  const nodes = useDiscoveryStore((s) => s.nodes);
  const selectedNodeId = useDiscoveryStore((s) => s.selectedNodeId);
  const mapFocusToken = useDiscoveryStore((s) => s.mapFocusToken);
  const setSelectedNodeId = useDiscoveryStore((s) => s.setSelectedNodeId);
  const setViewportBounds = useDiscoveryStore((s) => s.setViewportBounds);
  const selectedTag = useDiscoveryStore((s) => s.selectedTag);
  const activeTab = useDiscoveryStore((s) => s.activeTab);
  const previewPin = useDiscoveryStore((s) => s.previewPin);
  const colors = useAppearanceStore((s) => s.colors);

  const nodeList = Object.values(nodes || {}).filter((node) => {
    if (activeTab === 'RSVPd' && !node.isRsvpd) return false;
    return eventMatchesMapFilter(node.tags, selectedTag, node.tag);
  });

  const pan = useRef(new Animated.ValueXY({ x: CENTER_OFFSET_X, y: CENTER_OFFSET_Y })).current;
  const currentPan = useRef({ x: CENTER_OFFSET_X, y: CENTER_OFFSET_Y });
  const canvasSize = useRef({ width, height: CANVAS_HEIGHT });

  const calculateBounds = (offsetX: number, offsetY: number) => {
    const { width: canvasWidth, height: canvasHeight } = canvasSize.current;
    setViewportBounds(visibleWorldBounds(offsetX, offsetY, canvasWidth, canvasHeight));
  };

  const moveTo = (pointX: number, pointY: number) => {
    const offset = focusOffsetForPoint(pointX, pointY, canvasSize.current.width, canvasSize.current.height);
    if (!offset) return;
    pan.stopAnimation();
    pan.flattenOffset();
    Animated.spring(pan, {
      toValue: offset,
      useNativeDriver: false,
      friction: 7,
      tension: 40,
    }).start();
    currentPan.current = offset;
    calculateBounds(offset.x, offset.y);
  };

  useEffect(() => {
    calculateBounds(CENTER_OFFSET_X, CENTER_OFFSET_Y);
  }, []);

  useEffect(() => {
    if (mapFocusToken === 0) return;
    const selectedId = useDiscoveryStore.getState().selectedNodeId;
    const node = selectedId ? useDiscoveryStore.getState().nodes[selectedId] : null;
    if (!node) return;
    moveTo(node.x, node.y);
  }, [mapFocusToken]);

  useEffect(() => {
    if (!previewPin) return;
    moveTo(previewPin.x, previewPin.y);
  }, [previewPin]);

  const handleRecenter = () => {
    moveTo(BEACON_WORLD_X, BEACON_WORLD_Y);
  };

  const commitPan = (gestureState: { dx: number; dy: number }) => {
    currentPan.current.x += gestureState.dx;
    currentPan.current.y += gestureState.dy;
    pan.flattenOffset();
    calculateBounds(currentPan.current.x, currentPan.current.y);
  };

  const panResponder = useRef(
    PanResponder.create({
      // Empty map space claims the press immediately so the browser does not
      // start a text selection. Pins and the recenter button keep their taps.
      onStartShouldSetPanResponderCapture: (event) => !isPinOrRecenterTarget(event),
      onMoveShouldSetPanResponder: (_, gestureState) => exceedsPanSlop(gestureState),
      // A drag that begins on a pin or a radius ring still pans the map.
      onMoveShouldSetPanResponderCapture: (_, gestureState) => exceedsPanSlop(gestureState),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        event.preventDefault?.();
        pan.stopAnimation((value: { x: number; y: number }) => {
          if (Number.isFinite(value?.x) && Number.isFinite(value?.y)) {
            currentPan.current = { x: value.x, y: value.y };
          }
        });
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
        commitPan(gestureState);
      },
      onPanResponderTerminate: (_, gestureState) => {
        commitPan(gestureState);
      },
    })
  ).current;

  return (
    <View
      testID="discovery-map"
      style={[styles.canvasContainer, { backgroundColor: colors.map }]}
      onLayout={(event) => {
        const { width: layoutWidth, height: layoutHeight } = event.nativeEvent.layout;
        if (layoutWidth > 0 && layoutHeight > 0) {
          canvasSize.current = { width: layoutWidth, height: layoutHeight };
          calculateBounds(currentPan.current.x, currentPan.current.y);
        }
      }}
      {...panResponder.panHandlers}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.interactiveWorld,
          {
            transform: [{ translateX: pan.x }, { translateY: pan.y }],
          },
        ]}
      >
        {/* Tactical Grid Overlay */}
        <View style={[styles.gridLineH1, { backgroundColor: colors.grid }]} />
        <View style={[styles.gridLineH2, { backgroundColor: colors.grid }]} />
        <View style={[styles.gridLineH3, { backgroundColor: colors.grid }]} />
        <View style={[styles.gridLineV1, { backgroundColor: colors.grid }]} />
        <View style={[styles.gridLineV2, { backgroundColor: colors.grid }]} />
        <View style={[styles.gridLineV3, { backgroundColor: colors.grid }]} />

        {/* Diagonal Arteries */}
        <View style={[styles.roadDiagonal1, { backgroundColor: colors.road }]} />
        <View style={[styles.roadDiagonal2, { backgroundColor: colors.road }]} />

        {previewPin ? (
          <View style={[styles.previewPin, { top: previewPin.y - 28, left: previewPin.x - 14 }]}>
            <View style={styles.previewPinLabel}>
              <Text style={styles.previewPinLabelText}>Here</Text>
            </View>
            <View style={styles.previewPinHead}>
              <View style={styles.previewPinDot} />
            </View>
            <View style={styles.previewPinTip} />
          </View>
        ) : null}

        {/* User Beacon Reticle (Origin: 480, 480) */}
        <View style={styles.userBeaconContainer}>
          <View style={styles.userPulseRing} />
          <View style={styles.userCoreDot} />
        </View>

        {/* Interactive Event Nodes */}
        {nodeList.map((item) => {
          const isSelected = item.id === selectedNodeId;
          const posX = item.x ?? 480;
          const posY = item.y ?? 480;
          const shownTag = presentAssignedTag(item.tags, selectedTag, item.tag);

          return (
            <View
              key={item.id}
              pointerEvents="none"
              style={[
                styles.nodeCluster,
                { top: posY - 75, left: posX - 75 },
              ]}
            >
              {isSelected ? (
                <View style={[styles.ring500m, styles.ringSelected]}>
                  <Text style={[styles.ringLabelTop, { color: colors.region, backgroundColor: colors.ringLabel }]}>500m</Text>
                </View>
              ) : null}

              <View pointerEvents="none" style={[styles.pinTagPill, { backgroundColor: colors.pinTag }]}>
                <Text style={[styles.pinTagText, { color: colors.pinTagText }]}>{shownTag}</Text>
              </View>

              {/* Center Pin Marker */}
              <TouchableOpacity
                testID={`discovery-pin-${item.id}`}
                activeOpacity={0.8}
                onPress={() => setSelectedNodeId(item.id)}
                style={styles.pinWrapper}
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
            </View>
          );
        })}
      </Animated.View>

      {/* Pure View-based Tactical Crosshair Recenter Button */}
      <TouchableOpacity
        testID="discovery-recenter"
        style={[styles.crosshairBtn, { backgroundColor: colors.crosshair, borderColor: colors.accentBright }]}
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
    userSelect: 'none',
    touchAction: 'none',
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
  previewPin: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 8,
    width: 28,
  },
  previewPinLabel: {
    backgroundColor: '#22d3ee',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  previewPinLabelText: {
    color: '#082f49',
    fontSize: 10,
    fontWeight: '800',
  },
  previewPinHead: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f97316',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPinDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  previewPinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#f97316',
    marginTop: -1,
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
    backgroundColor: '#facc15',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  userPulseRing: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(250, 204, 21, 0.55)',
    backgroundColor: 'rgba(250, 204, 21, 0.18)',
  },
  nodeCluster: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 150,
    height: 150,
    zIndex: 4,
  },
  ring500m: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  ringSelected: {
    borderColor: '#38bdf8',
    borderWidth: 1.5,
  },
  ringLabelTop: {
    color: '#22d3ee',
    fontSize: 8,
    fontWeight: '700',
    backgroundColor: '#0a1120',
    paddingHorizontal: 2,
    marginTop: -6,
  },
  pinTagPill: {
    position: 'absolute',
    top: 90,
    alignSelf: 'center',
    backgroundColor: '#0a1120',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.45)',
    zIndex: 7,
  },
  pinTagText: {
    color: '#67e8f9',
    fontSize: 9,
    fontWeight: '800',
  },
  pinWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    padding: 6,
    pointerEvents: 'auto',
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
