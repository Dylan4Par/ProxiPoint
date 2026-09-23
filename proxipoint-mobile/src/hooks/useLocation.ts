import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { useLocationJitterFilter } from './useLocationTracker';
import { postTelemetryPing } from '../services/telemetryApi';
import { TelemetrySocket } from '../services/telemetrySocket';
import { setTrackingConfig } from '../services/trackingConfig';
import { registerBackgroundLocationTracking } from '../tasks/backgroundLocation';
import { DEVICE_USER_ID, type LocationPingPayload, type ProximityAlert } from '../types/telemetry';

export interface DeviceFix {
  lat: number;
  lon: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

export type LocationStatus = 'idle' | 'watching' | 'denied' | 'error';
export type TelemetryTransport = 'websocket' | 'http' | 'none';

function toFix(position: Location.LocationObject): DeviceFix {
  return {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy,
    speed: position.coords.speed,
    heading: position.coords.heading,
    timestamp: position.timestamp,
  };
}

function toPayload(fix: DeviceFix, radiusMeters: number): LocationPingPayload {
  return {
    userId: DEVICE_USER_ID,
    latitude: fix.lat,
    longitude: fix.lon,
    accuracy: fix.accuracy,
    speed: fix.speed,
    heading: fix.heading,
    radiusMeters,
    timestamp: new Date(fix.timestamp).toISOString(),
  };
}

export function useLocation(radiusMeters: number) {
  const { shouldEmitPing } = useLocationJitterFilter();
  const [coords, setCoords] = useState<DeviceFix | null>(null);
  const [alerts, setAlerts] = useState<ProximityAlert[]>([]);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [transport, setTransport] = useState<TelemetryTransport>('none');

  const radiusRef = useRef(radiusMeters);
  const fixRef = useRef<DeviceFix | null>(null);
  const appActiveRef = useRef(true);
  const socketRef = useRef<TelemetrySocket | null>(null);
  const publishRef = useRef<(fix: DeviceFix) => Promise<void>>(async () => {});

  radiusRef.current = radiusMeters;

  useEffect(() => {
    setTrackingConfig({ userId: DEVICE_USER_ID, radiusMeters });
  }, [radiusMeters]);

  useEffect(() => {
    const socket = new TelemetrySocket();
    socketRef.current = socket;
    socket.start(setAlerts);
    return () => {
      socket.stop();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      appActiveRef.current = next === 'active';
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    publishRef.current = async (fix: DeviceFix) => {
      const payload = toPayload(fix, radiusRef.current);
      const socket = socketRef.current;
      const foregroundSocket = appActiveRef.current && socket?.isConnected();
      if (foregroundSocket && socket) {
        try {
          socket.sendPing(payload);
          setTransport('websocket');
          return;
        } catch (err) {
          console.warn('WebSocket telemetry failed, using HTTP fallback:', err);
        }
      }
      const nextAlerts = await postTelemetryPing(payload);
      setAlerts(nextAlerts);
      setTransport('http');
    };
  }, []);

  useEffect(() => {
    const fix = fixRef.current;
    if (!fix) return;
    void publishRef.current(fix).catch((err) => {
      console.warn('Radius change telemetry failed:', err);
    });
  }, [radiusMeters]);

  useEffect(() => {
    let watch: Location.LocationSubscription | null = null;
    let cancelled = false;

    function publishDemoFix(nextStatus: LocationStatus) {
      if (cancelled || fixRef.current) return;
      setStatus(nextStatus);
      const demo: DeviceFix = {
        lat: 37.7749,
        lon: -122.4194,
        accuracy: null,
        speed: null,
        heading: null,
        timestamp: Date.now(),
      };
      fixRef.current = demo;
      setCoords(demo);
      if (shouldEmitPing(demo.lat, demo.lon)) {
        void publishRef.current(demo);
      }
    }

    async function start() {
      try {
        const permissionPromise = Location.requestForegroundPermissionsAsync();
        const permission = await Promise.race([
          permissionPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
        ]);
        if (cancelled) return;
        if (!permission || permission.status !== 'granted') {
          publishDemoFix(permission ? 'denied' : 'idle');
          if (!permission) {
            const resolved = await permissionPromise;
            if (cancelled || resolved.status !== 'granted') return;
          } else {
            return;
          }
        }
        setStatus('watching');
        if (Platform.OS !== 'web') {
          await registerBackgroundLocationTracking();
        }
        watch = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 2000,
            distanceInterval: 0,
          },
          (position) => {
            const fix = toFix(position);
            fixRef.current = fix;
            setCoords(fix);
            if (!shouldEmitPing(fix.lat, fix.lon)) return;
            void publishRef.current(fix).catch((err) => {
              console.warn('Telemetry publish failed:', err);
            });
          },
        );
      } catch (err) {
        console.warn('Location watch failed:', err);
        if (!cancelled) publishDemoFix('error');
      }
    }

    void start();
    return () => {
      cancelled = true;
      watch?.remove();
    };
  }, [shouldEmitPing]);

  useEffect(() => {
    const timer = setInterval(() => {
      const fix = fixRef.current;
      if (!fix) return;
      if (!shouldEmitPing(fix.lat, fix.lon)) return;
      void publishRef.current(fix).catch((err) => {
        console.warn('Heartbeat telemetry failed:', err);
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [shouldEmitPing]);

  return { coords, alerts, status, transport, radiusMeters };
}
