import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NAV_HEIGHT } from '../../lib/mapViewport';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';

export const DiscoveryMapChrome: React.FC<{
  zoomText: string;
  onRecenter: () => void;
}> = ({ zoomText, onRecenter }) => {
  const drawerHeight = useDiscoveryStore((state) => state.drawerHeight);

  return (
    <>
      <TouchableOpacity
        style={[styles.crosshairBtn, { bottom: drawerHeight + NAV_HEIGHT + 14 }]}
        activeOpacity={0.7}
        onPress={onRecenter}
        accessibilityLabel="Recenter map"
      >
        <View style={styles.crosshairCircleOuter}>
          <View style={styles.crosshairCircleInner} />
          <View style={styles.crosshairLineV} />
          <View style={styles.crosshairLineH} />
        </View>
      </TouchableOpacity>
      <View pointerEvents="none" style={[styles.zoomReadout, { bottom: drawerHeight + NAV_HEIGHT + 22 }]}>
        <Text style={styles.zoomText}>{zoomText}</Text>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
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
    zIndex: 20,
  },
  zoomText: {
    color: '#7dd3fc',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});
