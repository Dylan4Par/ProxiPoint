import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { buildDiscoveryMapDocument, MAP_PICK_MESSAGE } from '../../lib/discoveryMapDocument';
import { BOUNDARY_RADII } from '../../lib/boundaryTiers';

interface PreviewMapWindow {
  setPreviewGeofence?: (latitude: number, longitude: number, radiusMeters: number) => void;
  clearPreviewGeofence?: () => void;
}

interface PreviewFrame {
  contentWindow: PreviewMapWindow | null;
}

interface DiscoveryLeafletMapProps {
  onMapPick?: (latitude: number, longitude: number) => void;
}

export const DiscoveryLeafletMap: React.FC<DiscoveryLeafletMapProps> = ({ onMapPick }) => {
  const preview = useDiscoveryStore((state) => state.previewGeofence);
  const selfCoordinates = useDiscoveryStore((state) => state.selfCoordinates);
  const html = useMemo(
    () =>
      buildDiscoveryMapDocument({
        latitude: selfCoordinates.latitude,
        longitude: selfCoordinates.longitude,
      }),
    [selfCoordinates.latitude, selfCoordinates.longitude],
  );
  const frameRef = useRef<PreviewFrame | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    const push = () => {
      const mapWindow = frameRef.current?.contentWindow;
      if (!mapWindow?.setPreviewGeofence) return false;
      if (!preview) {
        mapWindow.clearPreviewGeofence?.();
        return true;
      }
      mapWindow.setPreviewGeofence(preview.latitude, preview.longitude, preview.radiusMeters);
      return true;
    };
    if (push()) return;
    const timer = setInterval(() => {
      if (!cancelled && push()) clearInterval(timer);
    }, 100);
    const stop = setTimeout(() => clearInterval(timer), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [preview, ready]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !onMapPick) return;
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; latitude?: number; longitude?: number } | null;
      if (!data || data.type !== MAP_PICK_MESSAGE) return;
      if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return;
      if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) return;
      onMapPick(data.latitude, data.longitude);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMapPick]);

  if (Platform.OS !== 'web') {
    return <NativePerimeter radiusMeters={preview?.radiusMeters ?? null} />;
  }

  return React.createElement('iframe', {
    ref: (node: PreviewFrame | null) => {
      frameRef.current = node;
    },
    title: 'Discovery boundary map',
    srcDoc: html,
    onLoad: () => setReady(true),
    style: {
      border: '0',
      width: '100%',
      height: '100%',
      background: '#0a1120',
    },
  });
};

const NativePerimeter: React.FC<{ radiusMeters: number | null }> = ({ radiusMeters }) => {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = radiusMeters == null ? 0 : Math.min(1, radiusMeters / BOUNDARY_RADII.metro);
  const diameter = 48 + scale * 180;

  return (
    <View style={styles.nativeCanvas}>
      {radiusMeters != null ? (
        <>
          <Animated.View
            style={[
              styles.halo,
              { width: diameter, height: diameter, borderRadius: diameter / 2, opacity: pulse },
            ]}
          />
          <View
            style={[
              styles.core,
              {
                width: diameter * 0.42,
                height: diameter * 0.42,
                borderRadius: (diameter * 0.42) / 2,
              },
            ]}
          />
        </>
      ) : null}
      <View style={styles.anchor} />
    </View>
  );
};

const styles = StyleSheet.create({
  nativeCanvas: {
    flex: 1,
    backgroundColor: '#0a1120',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#06b6d4',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
  },
  core: {
    position: 'absolute',
    backgroundColor: 'rgba(6, 182, 212, 0.22)',
  },
  anchor: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22d3ee',
  },
});
