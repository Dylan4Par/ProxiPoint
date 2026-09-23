import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Circle, Map as LeafletMap, Marker } from 'leaflet';

import { TILE_LAYER_URL } from '@/constants/mapStyle';
import { useLeafletDarkTheme } from '@/src/hooks/useLeafletDarkTheme';
import type { MapCoordinate, MapTarget } from '@/src/types/map';
import '../styles/leaflet.css';

type LeafletNamespace = typeof import('leaflet');

type ProximityMapProps = {
  user: MapCoordinate;
  radiusMeters: number;
  targets: MapTarget[];
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function pinIcon(L: LeafletNamespace, color: string, label: string) {
  return L.divIcon({
    className: 'proxipoint-pin',
    html: `<div style="display:flex;flex-direction:column;align-items:center;width:140px;pointer-events:none">
      <div style="width:16px;height:16px;border-radius:8px;background:${color};border:3px solid #fff;box-shadow:0 0 0 6px ${color}33"></div>
      <div style="margin-top:4px;color:${color};font:700 11px/1.2 sans-serif;text-align:center;text-shadow:0 1px 2px #020617">${escapeHtml(label)}</div>
    </div>`,
    iconSize: [140, 36],
    iconAnchor: [70, 8],
  });
}

export default function ProximityMap({ user, radiusMeters, targets }: ProximityMapProps) {
  useLeafletDarkTheme();
  const [failed, setFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const userRef = useRef(user);
  const leafletRef = useRef<LeafletNamespace | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const targetMarkersRef = useRef<Map<string, Marker>>(new Map());
  const circleRef = useRef<Circle | null>(null);
  const fittedKeyRef = useRef<string | null>(null);
  userRef.current = user;

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    const onResize = () => mapRef.current?.invalidateSize();

    (async () => {
      try {
        const loaded = await import('leaflet');
        if (disposed) return;
        const candidate = loaded.default as Partial<LeafletNamespace> | undefined;
        const L =
          candidate && typeof candidate.map === 'function'
            ? (candidate as LeafletNamespace)
            : (loaded as unknown as LeafletNamespace);
        const parent = document.getElementById('proximity-map-host');
        if (!parent) {
          console.error('proximity map host missing');
          setFailed(true);
          return;
        }
        const map = L.map(parent, { zoomControl: true, attributionControl: true }).setView(
          [userRef.current.lat, userRef.current.lon],
          15,
        );
        L.tileLayer(TILE_LAYER_URL, {
          attribution: '&copy; OpenStreetMap contributors',
          subdomains: 'abc',
          maxZoom: 19,
        }).addTo(map);
        leafletRef.current = L;
        mapRef.current = map;
        setMapReady(true);
        frame = requestAnimationFrame(() => map.invalidateSize());
        window.addEventListener('resize', onResize);
      } catch (error) {
        console.error('proximity map failed', error);
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      userMarkerRef.current = null;
      targetMarkersRef.current.clear();
      circleRef.current = null;
      fittedKeyRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L || failed) return;

    const userLatLng = L.latLng(user.lat, user.lon);
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(userLatLng, {
        icon: pinIcon(L, '#38bdf8', 'You'),
        interactive: false,
        zIndexOffset: 500,
      }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng(userLatLng);
    }

    if (!circleRef.current) {
      circleRef.current = L.circle(userLatLng, {
        radius: radiusMeters,
        color: '#38bdf8',
        weight: 1.5,
        fillColor: '#38bdf8',
        fillOpacity: 0.16,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(userLatLng);
      circleRef.current.setRadius(radiusMeters);
    }

    const liveIds = new Set(targets.map((item) => item.id));
    for (const [id, marker] of targetMarkersRef.current) {
      if (!liveIds.has(id)) {
        marker.remove();
        targetMarkersRef.current.delete(id);
      }
    }

    for (const item of targets) {
      const targetLatLng = L.latLng(item.lat, item.lon);
      const icon = pinIcon(L, '#facc15', item.name);
      const existing = targetMarkersRef.current.get(item.id);
      if (!existing) {
        targetMarkersRef.current.set(
          item.id,
          L.marker(targetLatLng, {
            icon,
            interactive: false,
            zIndexOffset: 600,
          }).addTo(map),
        );
      } else {
        existing.setLatLng(targetLatLng);
        existing.setIcon(icon);
      }
    }

    if (targets.length > 0) {
      const fitKey = targets
        .map((item) => `${item.id}:${item.lat.toFixed(5)},${item.lon.toFixed(5)}`)
        .sort()
        .join('|');
      if (fittedKeyRef.current !== fitKey) {
        fittedKeyRef.current = fitKey;
        const bounds = L.latLngBounds([
          userLatLng,
          ...targets.map((item) => L.latLng(item.lat, item.lon)),
        ]);
        map.fitBounds(bounds.pad(0.8), {
          paddingTopLeft: [32, 32],
          paddingBottomRight: [32, 200],
          maxZoom: 16,
          animate: true,
        });
      }
    } else {
      fittedKeyRef.current = null;
      map.panTo(userLatLng);
    }
  }, [failed, mapReady, radiusMeters, targets, user.lat, user.lon]);

  if (failed) {
    return (
      <View style={styles.fallback}>
        <View style={styles.ringOuter} />
        <View style={styles.ringInner} />
        <View style={styles.userPin}>
          <View style={styles.userDot} />
          <Text style={styles.userLabel}>You</Text>
        </View>
        {targets.map((item, index) => (
          <View key={item.id} style={[styles.targetPin, { top: `${30 + index * 10}%` }]}>
            <View style={styles.targetDot} />
            <Text style={styles.targetLabel}>{item.name}</Text>
          </View>
        ))}
      </View>
    );
  }

  return <View nativeID="proximity-map-host" style={styles.host} />;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#0f172a',
  },
  fallback: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  ringOuter: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    borderStyle: 'dashed',
  },
  ringInner: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  userPin: {
    alignItems: 'center',
  },
  userDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#38bdf8',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  userLabel: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  targetPin: {
    position: 'absolute',
    top: '35%',
    left: '60%',
    alignItems: 'center',
  },
  targetDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#facc15',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  targetLabel: {
    color: '#facc15',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
});
