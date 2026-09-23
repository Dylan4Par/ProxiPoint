import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useProximityStore } from '../../stores/useProximityStore';

const { width } = Dimensions.get('window');

export const TacticalMapCanvas: React.FC = () => {
  const myLocation = useProximityStore((s) => s.myLocation);
  const alerts = useProximityStore((s) => s.alerts);
  const activeRadius = useProximityStore((s) => s.activeRadiusMeters);
  const selectedNodeId = useProximityStore((s) => s.selectedNodeId);

  const radarDiameter = Math.min(width - 48, 340);

  return (
    <View style={styles.canvas}>
      <View style={styles.gridLineHorizontal} />
      <View style={styles.gridLineVertical} />

      {/* Outer Tactical Range Ring */}
      <View
        style={[
          styles.rangeRing,
          {
            width: radarDiameter,
            height: radarDiameter,
            borderRadius: radarDiameter / 2,
          },
        ]}
      >
        <Text style={styles.rangeLabel}>{activeRadius}m</Text>
      </View>

      {/* Inner Half-Radius Ring */}
      <View
        style={[
          styles.innerRing,
          {
            width: radarDiameter / 2,
            height: radarDiameter / 2,
            borderRadius: radarDiameter / 4,
          },
        ]}
      >
        <Text style={styles.innerLabel}>{Math.round(activeRadius / 2)}m</Text>
      </View>

      {/* Self Center Reticle */}
      <View style={styles.selfMarker}>
        <View style={styles.reticleDot} />
        <View style={styles.reticlePulse} />
      </View>

      {/* Targets */}
      {alerts.map((node) => {
        const isSelected = node.id === selectedNodeId;
        const isClose = node.distanceMeters < 150;

        const ratio = Math.min(node.distanceMeters / (activeRadius || 500), 1.0);
        const angle =
          (node.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360) *
          (Math.PI / 180);
        const distancePx = ratio * (radarDiameter / 2 - 20);
        const xOffset = Math.cos(angle) * distancePx;
        const yOffset = Math.sin(angle) * distancePx;

        return (
          <View
            key={node.id}
            style={[
              styles.targetMarker,
              {
                transform: [{ translateX: xOffset }, { translateY: yOffset }],
              },
            ]}
          >
            <View
              style={[
                styles.targetBlip,
                isClose ? styles.blipDanger : styles.blipNormal,
                isSelected && styles.blipSelected,
              ]}
            />
            <Text style={[styles.targetLabel, isClose && styles.targetLabelDanger]}>
              {node.label || node.id} ({Math.round(node.distanceMeters)}m)
            </Text>
          </View>
        );
      })}

      <View style={styles.coordsOverlay}>
        <Text style={styles.coordsText}>
          {myLocation
            ? `${myLocation.latitude.toFixed(6)}, ${myLocation.longitude.toFixed(6)}`
            : 'ACQUIRING GPS...'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#1e293b',
  },
  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#1e293b',
  },
  rangeRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#0284c7',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
  },
  rangeLabel: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '700',
    backgroundColor: '#020617',
    paddingHorizontal: 4,
  },
  innerRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  innerLabel: {
    color: '#64748b',
    fontSize: 8,
    backgroundColor: '#020617',
    paddingHorizontal: 3,
  },
  selfMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#38bdf8',
    zIndex: 2,
  },
  reticlePulse: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#38bdf8',
    opacity: 0.6,
  },
  targetMarker: {
    position: 'absolute',
    alignItems: 'center',
  },
  targetBlip: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  blipNormal: { backgroundColor: '#0284c7' },
  blipDanger: { backgroundColor: '#ef4444' },
  blipSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  targetLabel: {
    color: '#94a3b8',
    fontSize: 8,
    marginTop: 2,
    fontWeight: '600',
  },
  targetLabelDanger: { color: '#f87171' },
  coordsOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  coordsText: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
