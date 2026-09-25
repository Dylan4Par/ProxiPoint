import { useEffect, useRef, useCallback } from 'react';
import { useDiscoveryStore } from '../stores/useDiscoveryStore';

const HEARTBEAT_INTERVAL_MS = 5000;
const RECONNECT_DELAY_MS = 3000;

export interface LocationPingPayload {
  type: 'location_ping';
  device_id: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  battery_pct: number;
  status: 'online' | 'standby' | 'offline';
}

export interface InboundProximityAlert {
  type: 'proximity_alerts';
  timestamp: string;
  nodes: Array<{
    id: string;
    distance_meters: number;
    latitude: number;
    longitude: number;
    status: 'online' | 'standby' | 'offline';
    title?: string;
    category?: string;
    host?: string;
    attendees_count?: number;
    battery_pct?: number;
  }>;
}

export const useProximitySocket = () => {
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const tenantId = useDiscoveryStore((state) => state.tenantId);
  const deviceId = useDiscoveryStore((state) => state.deviceId);
  const wsEndpoint = useDiscoveryStore((state) => state.wsEndpoint);
  const selfCoordinates = useDiscoveryStore((state) => state.selfCoordinates);
  const searchRadiusMeters = useDiscoveryStore((state) => state.searchRadiusMeters);
  const batteryPct = useDiscoveryStore((state) => state.batteryPct);
  const setSocketConnected = useDiscoveryStore((state) => state.setSocketConnected);

  const sendLocationPing = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload: LocationPingPayload = {
      type: 'location_ping',
      device_id: deviceId,
      latitude: selfCoordinates.latitude,
      longitude: selfCoordinates.longitude,
      radius_meters: searchRadiusMeters,
      battery_pct: batteryPct,
      status: 'online',
    };

    socketRef.current.send(JSON.stringify(payload));
  }, [deviceId, selfCoordinates, searchRadiusMeters, batteryPct]);

  const connect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    const normalizedBase = wsEndpoint.endsWith('/') ? wsEndpoint.slice(0, -1) : wsEndpoint;
    const socketUrl = `${normalizedBase}/${tenantId}/ws`;

    const ws = new WebSocket(socketUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setSocketConnected(true);
      sendLocationPing();

      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
      heartbeatTimerRef.current = setInterval(sendLocationPing, HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'proximity_alerts' && Array.isArray(payload.nodes)) {
          // Update store directly, bypassing intermediate state vars
          useDiscoveryStore.getState().syncProximityNodes(payload.nodes, payload.timestamp);
        }
      } catch {
        // Drop malformed frame silently to maintain frame-rate
      }
    };

    ws.onclose = () => {
      setSocketConnected(false);
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
      // Reconnect after delay
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [tenantId, wsEndpoint, setSocketConnected, sendLocationPing]);

  // Transmit immediate update whenever coordinates shift (map pan recents, etc.)
  useEffect(() => {
    sendLocationPing();
  }, [sendLocationPing]);

  // Manage socket connection lifecycle
  useEffect(() => {
    connect();

    return () => {
      // Cleanup on unmount
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  return {
    reconnect: connect,
    sendPing: sendLocationPing,
  };
};
