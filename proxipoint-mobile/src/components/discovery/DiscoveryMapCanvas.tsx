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
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';

const { width, height } = Dimensions.get('window');
const CANVAS_HEIGHT = height * 0.52;

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
  const setSelectedNodeId = useDiscoveryStore((s) => s.setSelectedNodeId);
  const setViewportBounds = useDiscoveryStore((s) => s.setViewportBounds);

  const nodeList = Object.values(nodes || {});

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

        {/* Interactive Event Nodes */}
        {nodeList.map((item) => {
          const isSelected = item.id === selectedNodeId;
          const posX = item.x ?? 480;
          const posY = item.y ?? 480;

          return (
            <View
              key={item.id}
              style={[
                styles.nodeCluster,
                { top: posY - 75, left: posX - 75 },
              ]}
            >
              {/* Outer Tactical Ring */}
              <View
                style={[
                  styles.ring500m,
                  isSelected && styles.ringSelected,
                ]}
              >
                <Text style={styles.ringLabelTop}>500m</Text>
              </View>

              {/* Inner Tactical Ring */}
              <View
                style={[
                  styles.ring250m,
                  isSelected && styles.ringInnerSelected,
                ]}
              >
                <Text style={styles.ringLabelInner}>250m</Text>
              </View>

              {/* Center Pin Marker */}
              <TouchableOpacity
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
  ring250m: {
    position: 'absolute',
    width: 84,
    height: 84,
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
