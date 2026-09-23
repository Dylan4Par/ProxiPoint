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
