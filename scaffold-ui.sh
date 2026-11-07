#!/usr/bin/env bash
set -euo pipefail
echo "=========================================="
echo "Scaffolding ProxiPoint Tactical Map & Radar"
echo "=========================================="
# 1. Install dependencies (Zustand, Lucide icons, MapLibre/RN-Maps helpers)
if [ -f "package.json" ]; then
  echo "Installing Zustand and Lucide icons..."
  npm install zustand lucide-react-native
else
  echo "Warning: package.json not found in current directory. Creating structure only."
fi
# 2. Create directory hierarchy
mkdir -p src/types
mkdir -p src/stores
mkdir -p src/hooks
mkdir -p src/components/map
mkdir -p src/components/radar
mkdir -p src/screens
# ----------------------------------------------------
# 3. Type Definitions
# ----------------------------------------------------
cat << 'OUT' > src/types/proximity.ts
export interface ProximityAlertItem {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
}
export interface ProximityAlertPacket {
  type: 'proximity_alerts';
  alerts: ProximityAlertItem[];
}
export interface ClientLocationPing {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  radiusMeters: number;
  timestamp: string;
}
OUT
# ----------------------------------------------------
# 4. Zustand Store
# ----------------------------------------------------
cat << 'OUT' > src/stores/useProximityStore.ts
import { create } from 'zustand';
import { ProximityAlertItem } from '../types/proximity';
interface Coordinates {
  latitude: number;
  longitude: number;
}
interface ProximityState {
  isConnected: boolean;
  activeRadiusMeters: number;
  myLocation: Coordinates | null;
  alerts: ProximityAlertItem[];
  selectedNodeId: string | null;
  setConnected: (status: boolean) => void;
  setRadius: (radius: number) => void;
  setMyLocation: (lat: number, lon: number) => void;
  setAlerts: (alerts: ProximityAlertItem[]) => void;
  selectNode: (id: string | null) => void;
}
export const useProximityStore = create<ProximityState>((set) => ({
  isConnected: false,
  activeRadiusMeters: 500,
  myLocation: { latitude: 40.061708, longitude: -105.038292 }, // Default fallback / Erie coordinates
  alerts: [],
  selectedNodeId: null,
  setConnected: (isConnected) => set({ isConnected }),
  setRadius: (activeRadiusMeters) => set({ activeRadiusMeters }),
  setMyLocation: (latitude, longitude) => set({ myLocation: { latitude, longitude } }),
  setAlerts: (alerts) => set({ alerts }),
  selectNode: (selectedNodeId) => set({ selectedNodeId }),
}));
OUT
# ----------------------------------------------------
# 5. Duplex WebSocket Hook
# ----------------------------------------------------
cat << 'OUT' > src/hooks/useProximitySocket.ts
import { useEffect, useRef } from 'react';
import { useProximityStore } from '../stores/useProximityStore';
import { ProximityAlertPacket } from '../types/proximity';
interface SocketConfig {
  baseUrl?: string;
  tenantId: string;
  userId: string;
  apiKey?: string;
}
export function useProximitySocket({
  baseUrl = 'ws://10.0.2.2:8080/api/v1/ingest', // Android Emulator default
  tenantId,
  userId,
  apiKey = '',
}: SocketConfig) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const setConnected = useProximityStore((s) => s.setConnected);
  const setAlerts = useProximityStore((s) => s.setAlerts);
  const myLocation = useProximityStore((s) => s.myLocation);
  const activeRadiusMeters = useProximityStore((s) => s.activeRadiusMeters);
  useEffect(() => {
    let unmounted = false;
    function connect() {
      const authParam = apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : '';
      const wsUrl = `${baseUrl}/${tenantId}/ws${authParam}`;
      console.log(`[WS] Connecting to ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;
      ws.onopen = () => {
        if (!unmounted) {
          console.log('[WS] Connected successfully');
          setConnected(true);
        }
      };
      ws.onmessage = (event) => {
        try {
          const packet: ProximityAlertPacket = JSON.parse(event.data);
          if (packet.type === 'proximity_alerts') {
            setAlerts(packet.alerts || []);
          }
        } catch (err) {
          console.warn('[WS] Parse error:', err);
        }
      };
      ws.onclose = () => {
        if (!unmounted) {
          console.log('[WS] Connection closed. Reconnecting in 3s...');
          setConnected(false);
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };
      ws.onerror = (err) => {
        console.warn('[WS] Error encountered:', err);
      };
    }
    connect();
    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [baseUrl, tenantId, apiKey, setConnected, setAlerts]);
  // Outbound telemetry push on location or radius changes
  useEffect(() => {
    if (
      !socketRef.current ||
      socketRef.current.readyState !== WebSocket.OPEN ||
      !myLocation
    ) {
      return;
    }
    const payload = {
      type: 'location_ping',
      payload: {
        userId,
        latitude: myLocation.latitude,
        longitude: myLocation.longitude,
        radiusMeters: activeRadiusMeters,
        timestamp: new Date().toISOString(),
      },
    };
    socketRef.current.send(JSON.stringify(payload));
  }, [myLocation, activeRadiusMeters, userId]);
}
OUT
# ----------------------------------------------------
# 6. Top Telemetry Status Bar Component
# ----------------------------------------------------
cat << 'OUT' > src/components/radar/StatusBar.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useProximityStore } from '../../stores/useProximityStore';
interface Props {
  callsign: string;
}
export const StatusBar: React.FC<Props> = ({ callsign }) => {
  const isConnected = useProximityStore((s) => s.isConnected);
  const alertCount = useProximityStore((s) => s.alerts.length);
  const activeRadius = useProximityStore((s) => s.activeRadiusMeters);
  return (
    <View style={styles.container}>
      <View style={styles.leftGroup}>
        <View style={[styles.statusDot, isConnected ? styles.online : styles.offline]} />
        <Text style={styles.callsignText}>{callsign}</Text>
      </View>
      <View style={styles.rightGroup}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{activeRadius}m Perimeter</Text>
        </View>
        <View style={[styles.badge, alertCount > 0 ? styles.badgeAlert : styles.badgeMuted]}>
          <Text style={styles.badgeText}>{alertCount} Active Nodes</Text>
        </View>
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  leftGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  online: { backgroundColor: '#10b981' },
  offline: { backgroundColor: '#ef4444' },
  callsignText: { color: '#f8fafc', fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  rightGroup: { flexDirection: 'row', gap: 6 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#1e293b',
  },
  badgeMuted: { backgroundColor: '#1e293b' },
  badgeAlert: { backgroundColor: '#0284c7' },
  badgeText: { color: '#f8fafc', fontSize: 11, fontWeight: '600' },
});
OUT
# ----------------------------------------------------
# 7. Bottom Sliding Sheet Radar List
# ----------------------------------------------------
cat << 'OUT' > src/components/radar/NodeRadarDrawer.tsx
import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useProximityStore } from '../../stores/useProximityStore';
import { ProximityAlertItem } from '../../types/proximity';
const RADII = [250, 500, 1000];
export const NodeRadarDrawer: React.FC = () => {
  const alerts = useProximityStore((s) => s.alerts);
  const activeRadius = useProximityStore((s) => s.activeRadiusMeters);
  const setRadius = useProximityStore((s) => s.setRadius);
  const selectedNodeId = useProximityStore((s) => s.selectedNodeId);
  const selectNode = useProximityStore((s) => s.selectNode);
  const renderItem = ({ item }: { item: ProximityAlertItem }) => {
    const isSelected = item.id === selectedNodeId;
    const isClose = item.distanceMeters < 150;
    return (
      <TouchableOpacity
        style={[styles.nodeCard, isSelected && styles.nodeCardSelected]}
        onPress={() => selectNode(isSelected ? null : item.id)}
      >
        <View>
          <Text style={styles.nodeTitle}>{item.label || item.id}</Text>
          <Text style={styles.nodeCoords}>
            {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
          </Text>
        </View>
        <View style={[styles.distBadge, isClose ? styles.distDanger : styles.distNormal]}>
          <Text style={styles.distText}>{Math.round(item.distanceMeters)}m</Text>
        </View>
      </TouchableOpacity>
    );
  };
  return (
    <View style={styles.drawer}>
      <View style={styles.radiusSelector}>
        <Text style={styles.selectorLabel}>Perimeter:</Text>
        <View style={styles.pillRow}>
          {RADII.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.pill, activeRadius === r && styles.pillActive]}
              onPress={() => setRadius(r)}
            >
              <Text style={[styles.pillText, activeRadius === r && styles.pillTextActive]}>
                {r >= 1000 ? `${r / 1000}km` : `${r}m`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No mesh nodes within {activeRadius}m</Text>
          </View>
        }
      />
    </View>
  );
};
const styles = StyleSheet.create({
  drawer: {
    maxHeight: 280,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 10,
  },
  radiusSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  selectorLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#1e293b',
  },
  pillActive: { backgroundColor: '#0284c7' },
  pillText: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  pillTextActive: { color: '#ffffff' },
  listContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  nodeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  nodeCardSelected: { borderColor: '#0284c7', backgroundColor: '#172554' },
  nodeTitle: { color: '#f8fafc', fontSize: 13, fontWeight: '700' },
  nodeCoords: { color: '#64748b', fontSize: 10, marginTop: 2 },
  distBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  distNormal: { backgroundColor: '#0369a1' },
  distDanger: { backgroundColor: '#dc2626' },
  distText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  emptyState: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 12 },
});
OUT
# ----------------------------------------------------
# 8. Main Tactical Radar Screen
# ----------------------------------------------------
cat << 'OUT' > src/screens/TacticalRadarScreen.tsx
import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from '../components/radar/StatusBar';
import { NodeRadarDrawer } from '../components/radar/NodeRadarDrawer';
import { useProximitySocket } from '../hooks/useProximitySocket';
import { useProximityStore } from '../stores/useProximityStore';
interface Props {
  tenantId?: string;
  userId?: string;
}
export const TacticalRadarScreen: React.FC<Props> = ({
  tenantId = 'tenant-alpha',
  userId = 'Ranger-F0A5ACCF',
}) => {
  // Initialize WebSocket connection
  useProximitySocket({ tenantId, userId });
  const myLocation = useProximityStore((s) => s.myLocation);
  const alerts = useProximityStore((s) => s.alerts);
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar callsign={userId} />
      {/* Map View Canvas Placeholder / Drop-in */}
      <View style={styles.mapCanvas}>
        <View style={styles.crosshair}>
          <Text style={styles.centerTargetText}>⊕</Text>
          <Text style={styles.coordsReadout}>
            Focal Center: {myLocation?.latitude.toFixed(5)}, {myLocation?.longitude.toFixed(5)}
          </Text>
          <Text style={styles.nodeCounter}>Tracking {alerts.length} peer targets in radius</Text>
        </View>
      </View>
      <NodeRadarDrawer />
    </SafeAreaView>
  );
};
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  mapCanvas: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshair: { alignItems: 'center' },
  centerTargetText: { color: '#0284c7', fontSize: 44, fontWeight: '200' },
  coordsReadout: { color: '#94a3b8', fontSize: 12, marginTop: 4, fontFamily: 'monospace' },
  nodeCounter: { color: '#059669', fontSize: 11, fontWeight: '700', marginTop: 4 },
});
OUT
echo "UI scaffold files created successfully in src/!"
