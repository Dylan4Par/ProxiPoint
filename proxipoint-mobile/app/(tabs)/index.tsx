import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useRadarSession } from '../../src/hooks/RadarSession';
import {
  boundsForActivePins,
  fitLeafletBounds,
  focusLeafletOnTarget,
  installMarkerTransitionStyles,
  parseFocusTarget,
  type FocusTarget,
} from '../../src/lib/mapCamera';
import { RADIUS_PRESETS, type ProximityAlert } from '../../src/types/telemetry';
import type { DeviceFix } from '../../src/hooks/useLocation';

type LeafletNamespace = {
  map: (node: HTMLElement, options?: object) => LeafletMap;
  tileLayer: (url: string, options?: object) => { addTo: (map: LeafletMap) => unknown };
  marker: (latlng: [number, number], options?: object) => LeafletMarker;
  circle: (latlng: [number, number], options?: object) => LeafletCircle;
  divIcon: (options: object) => object;
};

type LeafletMap = {
  setView: (center: [number, number], zoom: number) => LeafletMap;
  remove: () => void;
  invalidateSize: () => void;
  fitBounds: (bounds: [[number, number], [number, number]], options?: object) => void;
};

type LeafletMarker = {
  setLatLng: (latlng: [number, number]) => void;
  addTo: (map: LeafletMap) => LeafletMarker;
  remove: () => void;
};

type LeafletCircle = {
  setLatLng: (latlng: [number, number]) => void;
  setRadius: (radius: number) => void;
  addTo: (map: LeafletMap) => LeafletCircle;
};

function pinIcon(L: LeafletNamespace, color: string, label?: string) {
  return L.divIcon({
    className: 'leaflet-marker-icon proxipoint-pin',
    html: `<div style="width:16px;height:16px;border-radius:999px;background:${color};border:2px solid #f8fafc;box-shadow:0 0 0 6px ${color}33"></div>${
      label
        ? `<div style="margin-top:4px;color:#e8eef7;font:600 11px sans-serif;text-shadow:0 1px 2px #000;white-space:nowrap">${label}</div>`
        : ''
    }`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export default function RadarScreen() {
  const { coords, alerts, status, transport, radiusMeters, setRadiusMeters, callsign, profileLoading } =
    useRadarSession();
  const params = useLocalSearchParams<{
    focusLat?: string | string[];
    focusLon?: string | string[];
    focusId?: string | string[];
  }>();
  const focus = useMemo(
    () => parseFocusTarget(params),
    [params.focusId, params.focusLat, params.focusLon],
  );

  return (
    <View style={styles.root}>
      {Platform.OS === 'web' ? (
        <WebRadar coords={coords} alerts={alerts} radiusMeters={radiusMeters} focus={focus} />
      ) : (
        <NativeRadar coords={coords} alerts={alerts} radiusMeters={radiusMeters} focus={focus} />
      )}
      <View style={styles.topBar} pointerEvents="none">
        <Text style={styles.brand}>PROXIPOINT</Text>
        <Text style={styles.meta} accessibilityLabel="Active callsign">
          {profileLoading ? 'Loading callsign' : callsign} · {status === 'denied' ? 'Demo fix' : status} · {transport} ·{' '}
          {alerts.length} alert{alerts.length === 1 ? '' : 's'}
          {focus ? ` · focus ${focus.id || 'target'}` : ''}
        </Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Geofence radius</Text>
        <View style={styles.pills}>
          {RADIUS_PRESETS.map((preset) => {
            const selected = preset === radiusMeters;
            return (
              <Pressable
                key={preset}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setRadiusMeters(preset)}
                style={[styles.pill, selected && styles.pillSelected]}
              >
                <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{preset}m</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function WebRadar({
  coords,
  alerts,
  radiusMeters,
  focus,
}: {
  coords: DeviceFix | null;
  alerts: ProximityAlert[];
  radiusMeters: number;
  focus: FocusTarget | null;
}) {
  const mapNode = useRef<HTMLElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletNamespace | null>(null);
  const userMarker = useRef<LeafletMarker | null>(null);
  const circle = useRef<LeafletCircle | null>(null);
  const alertMarkers = useRef(new Map<string, LeafletMarker>());
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const node = mapNode.current;
    if (!node) return;
    let cancelled = false;

    void (async () => {
      const imported = (await import('leaflet')) as unknown as { default: LeafletNamespace };
      const L = imported.default;
      if (cancelled) return;
      ensureLeafletCss();
      installMarkerTransitionStyles();
      const map = L.map(node, { zoomControl: false, attributionControl: true }).setView([37.7749, -122.4194], 16);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      map.invalidateSize();
      mapRef.current = map;
      leafletRef.current = L;
      setMapReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      userMarker.current = null;
      circle.current = null;
      alertMarkers.current.clear();
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !map || !coords) return;

    const center: [number, number] = [coords.lat, coords.lon];
    if (!userMarker.current) {
      userMarker.current = L.marker(center, { icon: pinIcon(L, '#3b82f6') }).addTo(map);
    } else {
      userMarker.current.setLatLng(center);
    }

    if (!circle.current) {
      circle.current = L.circle(center, {
        radius: radiusMeters,
        color: '#3b82f6',
        weight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 0.12,
      }).addTo(map);
    } else {
      circle.current.setLatLng(center);
      circle.current.setRadius(radiusMeters);
    }

    const seen = new Set<string>();
    for (const alert of alerts) {
      seen.add(alert.id);
      const latlng: [number, number] = [alert.latitude, alert.longitude];
      const existing = alertMarkers.current.get(alert.id);
      if (existing) {
        existing.setLatLng(latlng);
      } else {
        const marker = L.marker(latlng, { icon: pinIcon(L, '#f59e0b', alert.label) }).addTo(map);
        alertMarkers.current.set(alert.id, marker);
      }
    }
    for (const [id, marker] of alertMarkers.current) {
      if (!seen.has(id)) {
        marker.remove();
        alertMarkers.current.delete(id);
      }
    }
  }, [alerts, coords, mapReady, radiusMeters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !coords) return;
    if (focus) {
      focusLeafletOnTarget(map, focus);
      return;
    }
    if (alerts.length === 0) return;
    const bounds = boundsForActivePins({ lat: coords.lat, lon: coords.lon }, alerts);
    if (!bounds) return;
    fitLeafletBounds(map, bounds);
  }, [alerts, coords, focus, mapReady]);

  return (
    <View style={styles.map}>
      <View
        style={styles.map}
        ref={(node) => {
          mapNode.current = node as unknown as HTMLElement | null;
        }}
      />
    </View>
  );
}

function NativeRadar({
  coords,
  alerts,
  radiusMeters,
  focus,
}: {
  coords: DeviceFix | null;
  alerts: ProximityAlert[];
  radiusMeters: number;
  focus: FocusTarget | null;
}) {
  return (
    <View style={styles.native}>
      <Text style={styles.nativeTitle}>{radiusMeters}m geofence</Text>
      <Text style={styles.meta}>
        {coords ? `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}` : 'Waiting for GPS'}
      </Text>
      {focus ? (
        <Text style={styles.meta}>
          Focused on {focus.id || 'target'} · {focus.latitude.toFixed(5)}, {focus.longitude.toFixed(5)}
        </Text>
      ) : null}
      {alerts.map((alert) => (
        <Text key={alert.id} style={styles.alertRow}>
          {alert.label} · {Math.round(alert.distanceMeters)}m
        </Text>
      ))}
    </View>
  );
}

function ensureLeafletCss() {
  if (document.getElementById('leaflet-css')) return;
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070b12' },
  map: { flex: 1, backgroundColor: '#070b12' },
  topBar: {
    position: 'absolute',
    top: 20,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  brand: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  meta: { color: '#93a4bd', marginTop: 4, fontSize: 13 },
  panel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    zIndex: 1000,
    backgroundColor: 'rgba(7, 11, 18, 0.88)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  panelLabel: {
    color: '#93a4bd',
    fontSize: 12,
    marginBottom: 10,
    letterSpacing: 0.4,
  },
  pills: { flexDirection: 'row', gap: 8 },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: '#121826',
    borderWidth: 1,
    borderColor: '#243044',
  },
  pillSelected: {
    backgroundColor: '#1d4ed8',
    borderColor: '#60a5fa',
  },
  pillText: { color: '#dbe7f5', fontWeight: '600' },
  pillTextSelected: { color: '#ffffff' },
  native: { flex: 1, padding: 24, paddingTop: 72 },
  nativeTitle: { color: '#f8fafc', fontSize: 28, fontWeight: '700', marginBottom: 8 },
  alertRow: { color: '#f8fafc', fontSize: 16, marginTop: 8 },
});
