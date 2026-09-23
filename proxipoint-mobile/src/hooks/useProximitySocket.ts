import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ConnectionStatus,
  LocationPingPayload,
  ProximityAlertEvent,
  ServerMessage,
} from '../types/telemetry';

const ALERT_TTL_MS = 15000;
const ALERT_SWEEP_MS = 3000;

interface UseProximitySocketOptions {
  url: string;
  userId: string;
  enabled?: boolean;
  maxReconnectAttempts?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isProximityAlertEvent(value: unknown): value is ProximityAlertEvent {
  if (!isRecord(value)) return false;

  return (
    typeof value.alertId === 'string' &&
    typeof value.targetEntityId === 'string' &&
    typeof value.distanceMeters === 'number' &&
    typeof value.thresholdMeters === 'number' &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number' &&
    typeof value.triggeredAt === 'string' &&
    (value.targetName === undefined || typeof value.targetName === 'string') &&
    (value.message === undefined || typeof value.message === 'string')
  );
}

export function useProximitySocket({
  url,
  userId,
  enabled = true,
  maxReconnectAttempts = 5,
}: UseProximitySocketOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [alerts, setAlerts] = useState<Map<string, ProximityAlertEvent>>(() => new Map());
  const [lastSentPing, setLastSentPing] = useState<LocationPingPayload | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const enabledRef = useRef(enabled);
  const maxReconnectAttemptsRef = useRef(maxReconnectAttempts);

  useEffect(() => {
    enabledRef.current = enabled;
    maxReconnectAttemptsRef.current = maxReconnectAttempts;
  }, [enabled, maxReconnectAttempts]);

  useEffect(() => {
    const sweepInterval = setInterval(() => {
      const now = Date.now();
      setAlerts((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [id, alert] of next.entries()) {
          const alertTime = new Date(alert.triggeredAt).getTime();
          if (!Number.isFinite(alertTime) || now - alertTime > ALERT_TTL_MS) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, ALERT_SWEEP_MS);

    return () => clearInterval(sweepInterval);
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current < maxReconnectAttemptsRef.current && enabledRef.current) {
      const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 10000);
      reconnectAttemptsRef.current += 1;
      setStatus('reconnecting');
      reconnectTimeoutRef.current = setTimeout(() => {
        connectRef.current();
      }, delay);
      return;
    }

    setStatus('disconnected');
  }, []);

  const connect = useCallback(() => {
    clearReconnectTimer();

    const detach = (socket: WebSocket | null) => {
      if (!socket) return;
      socket.onclose = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };

    if (!enabled || !url) {
      detach(socketRef.current);
      socketRef.current = null;
      setStatus('disconnected');
      return;
    }

    const existing = socketRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    detach(existing);
    socketRef.current = null;

    setStatus(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    socketRef.current = ws;

    ws.onopen = () => {
      if (socketRef.current !== ws) return;
      setStatus('connected');
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      if (socketRef.current !== ws) return;

      try {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'proximity_alert' && isProximityAlertEvent(message.payload)) {
          const newAlert = message.payload;
          setAlerts((prev) => new Map(prev).set(newAlert.targetEntityId, newAlert));
        }
      } catch {
        // Ignore non-JSON or malformed frames.
      }
    };

    ws.onerror = () => {
      // ws.onclose handles reconnection.
    };

    ws.onclose = () => {
      if (socketRef.current === ws) {
        socketRef.current = null;
      }
      scheduleReconnect();
    };
  }, [url, enabled, clearReconnectTimer, scheduleReconnect]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    reconnectAttemptsRef.current = 0;
    connect();

    return () => {
      clearReconnectTimer();
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connect, clearReconnectTimer]);

  const sendLocationPing = useCallback(
    (
      latitude: number,
      longitude: number,
      accuracy: number | null = null,
      speed: number | null = null,
      heading: number | null = null,
    ): boolean => {
      if (socketRef.current?.readyState !== WebSocket.OPEN) {
        return false;
      }

      const ping: LocationPingPayload = {
        userId,
        latitude,
        longitude,
        accuracy,
        speed,
        heading,
        timestamp: new Date().toISOString(),
      };

      // overwatchcore treats kind "ping" as a location fix and answers with proximity_alert.
      socketRef.current.send(
        JSON.stringify({
          kind: 'ping',
          latitude,
          longitude,
          label: userId,
          userId,
          accuracy,
          speed,
          heading,
          timestamp: ping.timestamp,
        }),
      );
      setLastSentPing(ping);
      return true;
    },
    [userId],
  );

  return {
    status,
    alerts,
    lastSentPing,
    sendLocationPing,
  };
}
