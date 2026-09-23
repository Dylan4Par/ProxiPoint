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
