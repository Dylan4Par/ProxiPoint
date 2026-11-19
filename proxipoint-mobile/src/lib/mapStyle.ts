/**
 * Settings → App settings → Default map style: the basemap's look, separate from the app's
 * Appearance. 'auto' follows the app (light screens, light map; dark screens, dark map).
 */
import { useEffect, useState } from 'react';

export type MapStyle = 'auto' | 'light' | 'dark';

export const MAP_STYLE_OPTIONS: Array<{ id: MapStyle; label: string }> = [
  { id: 'auto', label: 'Match app' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function isMapStyle(value: unknown): value is MapStyle {
  return value === 'auto' || value === 'light' || value === 'dark';
}

/** The map's light or dark tiles, given the setting and the app's current theme. */
export function resolveMapMode(style: MapStyle, appMode: 'light' | 'dark'): 'light' | 'dark' {
  return style === 'auto' ? appMode : style;
}

let current: MapStyle = 'auto';
const listeners = new Set<() => void>();

export const getMapStyle = (): MapStyle => current;

export function setMapStyle(next: MapStyle): void {
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

export function useMapStyle(): MapStyle {
  const [style, setStyle] = useState(current);
  useEffect(() => {
    const listener = () => setStyle(current);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return style;
}
