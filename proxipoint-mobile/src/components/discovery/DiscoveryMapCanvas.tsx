import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  Platform,
  GestureResponderEvent,
} from 'react-native';
import {
  BEACON_WORLD,
  Camera,
  NAV_HEIGHT,
  Point,
  WORLD_SIZE,
  clampScale,
  opticalCenter,
  panToCenter,
  viewportBounds,
  zoomAboutFocal,
} from '../../lib/mapViewport';
import { DECLUTTER_CLEAR_SCALE, DeclutteredPin, LabelAnchor, declutterPins } from '../../lib/pinDeclutter';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';

const GRID = [300, 600, 900];
const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get('window');

const INITIAL_OPTICAL = opticalCenter({
  canvasWidth: WINDOW_WIDTH,
  canvasHeight: WINDOW_HEIGHT,
  headerHeight: 112,
  drawerHeight: 215,
  navHeight: NAV_HEIGHT,
});
const INITIAL_CAMERA = panToCenter(BEACON_WORLD, INITIAL_OPTICAL, 1);

function touchSpan(touches: { pageX: number; pageY: number }[]): number {
  return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
}

function labelOffset(anchor: LabelAnchor): { left: number; top: number } {
  switch (anchor) {
    case 'right':
      return { left: 16, top: -10 };
    case 'bottom':
      return { left: -34, top: 20 };
    case 'left':
      return { left: -86, top: -10 };
    default:
      return { left: -34, top: -30 };
  }
}

export const DiscoveryMapCanvas: React.FC = () => {
  const nodes = useDiscoveryStore((state) => state.nodes);
  const selectedNodeId = useDiscoveryStore((state) => state.selectedNodeId);
  const selectNodeFromPin = useDiscoveryStore((state) => state.selectNodeFromPin);
  const setViewportBounds = useDiscoveryStore((state) => state.setViewportBounds);
  const focusToken = useDiscoveryStore((state) => state.focusToken);
  const drawerHeight = useDiscoveryStore((state) => state.drawerHeight);
  const headerHeight = useDiscoveryStore((state) => state.headerHeight);

  const nodeList = Object.values(nodes || {});
  const [canvasSize, setCanvasSize] = useState({ width: WINDOW_WIDTH, height: WINDOW_HEIGHT });
  const [camera, setCamera] = useState<Camera>(INITIAL_CAMERA);
  const cameraRef = useRef(camera);
  const canvasSizeRef = useRef(canvasSize);
  const opticalRef = useRef(INITIAL_OPTICAL);
  const pageOrigin = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<View>(null);
  const springRef = useRef<Animated.CompositeAnimation | null>(null);
  const applyCameraRef = useRef<(next: Camera) => void>(() => {});

  canvasSizeRef.current = canvasSize;

  const applyCamera = useCallback(
    (next: Camera) => {
      const safe = { panX: next.panX, panY: next.panY, scale: clampScale(next.scale) };
      cameraRef.current = safe;
      setCamera(safe);
      const size = canvasSizeRef.current;
      setViewportBounds(viewportBounds(safe, size.width, size.height, 48));
    },
    [setViewportBounds],
  );
  applyCameraRef.current = applyCamera;

  const springCameraTo = useCallback(
    (target: Camera) => {
      springRef.current?.stop();
      const from = { ...cameraRef.current };
      const progress = new Animated.Value(0);
      const animation = Animated.spring(progress, {
        toValue: 1,
        useNativeDriver: false,
        friction: 8,
        tension: 42,
      });
      const listener = progress.addListener(({ value }) => {
        applyCameraRef.current({
          panX: from.panX + (target.panX - from.panX) * value,
          panY: from.panY + (target.panY - from.panY) * value,
          scale: from.scale + (target.scale - from.scale) * value,
        });
      });
      springRef.current = animation;
      animation.start(({ finished }) => {
        progress.removeListener(listener);
        if (finished) applyCameraRef.current(target);
      });
    },
    [],
  );

  useEffect(() => {
    const nextOptical = opticalCenter({
      canvasWidth: canvasSize.width,
      canvasHeight: canvasSize.height,
      headerHeight,
      drawerHeight,
      navHeight: NAV_HEIGHT,
    });
    const previous = opticalRef.current;
    const dx = nextOptical.x - previous.x;
    const dy = nextOptical.y - previous.y;
    opticalRef.current = nextOptical;
    if (dx === 0 && dy === 0) return;
    const current = cameraRef.current;
    applyCamera({ ...current, panX: current.panX + dx, panY: current.panY + dy });
  }, [applyCamera, canvasSize, drawerHeight, headerHeight]);

  useEffect(() => {
    if (focusToken === 0) return;
    const state = useDiscoveryStore.getState();
    const node = state.selectedNodeId ? state.nodes[state.selectedNodeId] : undefined;
    if (!node) return;
    const targetScale = Math.max(cameraRef.current.scale, DECLUTTER_CLEAR_SCALE);
    springCameraTo(panToCenter({ x: node.x, y: node.y }, opticalRef.current, targetScale));
  }, [focusToken, springCameraTo]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = canvasRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const focal = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      const current = cameraRef.current;
      applyCameraRef.current(zoomAboutFocal(current, current.scale * factor, focal));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const focalFrom = (touches: { pageX: number; pageY: number }[]): Point => ({
    x: (touches[0].pageX + touches[1].pageX) / 2 - pageOrigin.current.x,
    y: (touches[0].pageY + touches[1].pageY) / 2 - pageOrigin.current.y,
  });

  const gestureOrigin = useRef<Camera | null>(null);
  const pinchState = useRef<{ distance: number; focal: Point } | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        if (useDiscoveryStore.getState().drawerDragging) return false;
        return Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4 || gesture.numberActiveTouches > 1;
      },
      onPanResponderGrant: (event: GestureResponderEvent) => {
        springRef.current?.stop();
        gestureOrigin.current = { ...cameraRef.current };
        const touches = event.nativeEvent.touches;
        pinchState.current =
          touches.length >= 2
            ? { distance: touchSpan(touches), focal: focalFrom(touches) }
            : null;
      },
      onPanResponderMove: (event, gesture) => {
        const touches = event.nativeEvent.touches;
        if (touches.length >= 2) {
          const distance = touchSpan(touches);
          const focal = focalFrom(touches);
          if (!pinchState.current || pinchState.current.distance <= 0) {
            pinchState.current = { distance, focal };
            gestureOrigin.current = { ...cameraRef.current };
            return;
          }
          const origin = gestureOrigin.current ?? cameraRef.current;
          const zoomed = zoomAboutFocal(
            origin,
            origin.scale * (distance / pinchState.current.distance),
            pinchState.current.focal,
          );
          applyCameraRef.current({
            ...zoomed,
            panX: zoomed.panX + (focal.x - pinchState.current.focal.x),
            panY: zoomed.panY + (focal.y - pinchState.current.focal.y),
          });
          return;
        }

        if (pinchState.current) {
          pinchState.current = null;
          gestureOrigin.current = {
            ...cameraRef.current,
            panX: cameraRef.current.panX - gesture.dx,
            panY: cameraRef.current.panY - gesture.dy,
          };
        }
        const origin = gestureOrigin.current ?? cameraRef.current;
        applyCameraRef.current({
          ...origin,
          panX: origin.panX + gesture.dx,
          panY: origin.panY + gesture.dy,
        });
      },
      onPanResponderRelease: () => {
        pinchState.current = null;
        gestureOrigin.current = null;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        pinchState.current = null;
        gestureOrigin.current = null;
      },
    }),
  ).current;

  const placedPins = useMemo(
    () => declutterPins(
      Object.values(nodes).map((node) => ({ id: node.id, x: node.x, y: node.y })),
      camera.scale,
    ),
    [nodes, camera.scale],
  );
  const placement = useMemo(() => {
    const map = new Map<string, DeclutteredPin>();
    placedPins.forEach((pin) => map.set(pin.id, pin));
    return map;
  }, [placedPins]);

  const handleRecenter = () => {
    springCameraTo(panToCenter(BEACON_WORLD, opticalRef.current, 1));
  };

  const showAllRings = camera.scale >= DECLUTTER_CLEAR_SCALE;

  return (
    <View
      ref={canvasRef}
      style={styles.canvasContainer}
      {...panResponder.panHandlers}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setCanvasSize((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
        requestAnimationFrame(() => {
          canvasRef.current?.measureInWindow((x, y) => {
            pageOrigin.current = { x, y };
          });
        });
      }}
    >
      <View
        pointerEvents="box-none"
        style={[
          styles.world,
          {
            width: WORLD_SIZE * camera.scale,
            height: WORLD_SIZE * camera.scale,
            left: camera.panX,
            top: camera.panY,
          },
        ]}
      >
        {GRID.map((coord) => (
          <View
            key={`h-${coord}`}
            style={[styles.gridLineH, { top: coord * camera.scale }]}
          />
        ))}
        {GRID.map((coord) => (
          <View
            key={`v-${coord}`}
            style={[styles.gridLineV, { left: coord * camera.scale }]}
          />
        ))}

        <View
          style={[
            styles.roadDiagonal1,
            {
              top: 100 * camera.scale,
              left: 200 * camera.scale,
              height: 900 * camera.scale,
            },
          ]}
        />
        <View
          style={[
            styles.roadDiagonal2,
            {
              top: 200 * camera.scale,
              right: 300 * camera.scale,
              height: 800 * camera.scale,
            },
          ]}
        />

        <View
          style={[
            styles.userBeaconContainer,
            {
              top: BEACON_WORLD.y * camera.scale - 17,
              left: BEACON_WORLD.x * camera.scale - 17,
            },
          ]}
        >
          <View style={styles.userPulseRing} />
          <View style={styles.userCoreDot} />
        </View>

        {nodeList.map((item) => {
          const isSelected = item.id === selectedNodeId;
          const pin = placement.get(item.id) ?? {
            id: item.id,
            x: item.x,
            y: item.y,
            labelAnchor: 'top' as const,
          };
          const showRings = isSelected || showAllRings;

          return (
            <View
              key={item.id}
              pointerEvents="box-none"
              style={[
                styles.nodeAnchor,
                {
                  top: pin.y * camera.scale,
                  left: pin.x * camera.scale,
                  zIndex: isSelected ? 8 : 4,
                },
              ]}
            >
              {showRings ? (
                <>
                  <View style={[styles.ring500m, isSelected && styles.ringSelected]}>
                    <Text style={styles.ringLabelTop}>500m</Text>
                  </View>
                  <View style={[styles.ring250m, isSelected && styles.ringInnerSelected]}>
                    <Text style={styles.ringLabelInner}>250m</Text>
                  </View>
                </>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.8}
                accessibilityLabel={item.title}
                onPress={() => selectNodeFromPin(item.id)}
                style={styles.pinWrapper}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View style={[styles.pinHead, isSelected && styles.pinHeadSelected]}>
                  <View style={styles.pinDot} />
                </View>
                <View style={[styles.pinTip, isSelected && styles.pinTipSelected]} />
              </TouchableOpacity>

              <View pointerEvents="none" style={[styles.pinLabelWrap, labelOffset(pin.labelAnchor)]}>
                <Text style={[styles.pinLabel, isSelected && styles.pinLabelSelected]} numberOfLines={1}>
                  {item.tag.replace('#', '')}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.crosshairBtn, { bottom: drawerHeight + NAV_HEIGHT + 14 }]}
        activeOpacity={0.7}
        onPress={handleRecenter}
        accessibilityLabel="Recenter map"
      >
        <View style={styles.crosshairCircleOuter}>
          <View style={styles.crosshairCircleInner} />
          <View style={styles.crosshairLineV} />
          <View style={styles.crosshairLineH} />
        </View>
      </TouchableOpacity>

      <View pointerEvents="none" style={[styles.zoomReadout, { bottom: drawerHeight + NAV_HEIGHT + 22 }]}>
        <Text style={styles.zoomText}>{camera.scale < DECLUTTER_CLEAR_SCALE ? 'WIDE' : 'CLOSE'} · {camera.scale.toFixed(2)}x</Text>
      </View>
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
  world: {
    position: 'absolute',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#1e293b',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#1e293b',
  },
  roadDiagonal1: {
    position: 'absolute',
    width: 8,
    backgroundColor: '#172554',
    transform: [{ rotate: '32deg' }],
  },
  roadDiagonal2: {
    position: 'absolute',
    width: 10,
    backgroundColor: '#172554',
    transform: [{ rotate: '-40deg' }],
  },
  userBeaconContainer: {
    position: 'absolute',
    width: 34,
    height: 34,
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
  nodeAnchor: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  ring500m: {
    position: 'absolute',
    width: 140,
    height: 140,
    left: -70,
    top: -70,
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
  ring250m: {
    position: 'absolute',
    width: 84,
    height: 84,
    left: -42,
    top: -42,
    borderRadius: 42,
    borderWidth: 1.5,
    borderColor: 'rgba(6, 182, 212, 0.65)',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  ringInnerSelected: {
    borderColor: '#22d3ee',
    borderWidth: 2,
  },
  ringLabelTop: {
    color: '#22d3ee',
    fontSize: 8,
    fontWeight: '700',
    backgroundColor: '#0a1120',
    paddingHorizontal: 2,
    marginTop: -6,
  },
  ringLabelInner: {
    color: '#38bdf8',
    fontSize: 7,
    fontWeight: '700',
    backgroundColor: '#0a1120',
    paddingHorizontal: 2,
    marginTop: -5,
  },
  pinWrapper: {
    position: 'absolute',
    left: -18,
    top: -28,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
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
  pinLabelWrap: {
    position: 'absolute',
    width: 72,
    backgroundColor: 'rgba(8, 15, 29, 0.92)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.35)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pinLabel: {
    color: '#bae6fd',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pinLabelSelected: {
    color: '#ffffff',
  },
  crosshairBtn: {
    position: 'absolute',
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
  },
  crosshairCircleOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
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
  zoomReadout: {
    position: 'absolute',
    left: 14,
    backgroundColor: 'rgba(8, 15, 29, 0.8)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  zoomText: {
    color: '#7dd3fc',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});
