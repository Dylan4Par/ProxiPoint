import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useDeviceProfile } from './useDeviceProfile';
import { useLocation, type DeviceFix, type LocationStatus, type TelemetryTransport } from './useLocation';
import { requestNotificationPermissions } from '../services/notifications';
import { DEFAULT_RADIUS_METERS, type ActiveContact } from '../types/telemetry';

interface RadarSessionValue {
  callsign: string;
  isTelemetryEnabled: boolean;
  profileLoading: boolean;
  coords: DeviceFix | null;
  alerts: ActiveContact[];
  status: LocationStatus;
  transport: TelemetryTransport;
  radiusMeters: number;
  setRadiusMeters: (radius: number) => void;
}

const RadarSessionContext = createContext<RadarSessionValue | null>(null);

export function RadarSessionProvider({ children }: { children: ReactNode }) {
  const profile = useDeviceProfile();
  const [radiusMeters, setRadiusMeters] = useState<number>(DEFAULT_RADIUS_METERS);
  const location = useLocation(radiusMeters, {
    userId: profile.loading ? '' : profile.callsign,
    telemetryEnabled: !profile.loading && profile.isTelemetryEnabled,
  });

  useEffect(() => {
    void requestNotificationPermissions();
  }, []);

  return (
    <RadarSessionContext.Provider
      value={{
        callsign: profile.callsign,
        isTelemetryEnabled: profile.isTelemetryEnabled,
        profileLoading: profile.loading,
        coords: location.coords,
        alerts: location.alerts,
        status: location.status,
        transport: location.transport,
        radiusMeters,
        setRadiusMeters,
      }}
    >
      {children}
    </RadarSessionContext.Provider>
  );
}

export function useRadarSession(): RadarSessionValue {
  const session = useContext(RadarSessionContext);
  if (!session) {
    throw new Error('useRadarSession must be used inside RadarSessionProvider');
  }
  return session;
}
