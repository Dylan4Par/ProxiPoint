import * as Location from 'expo-location';
import { nearestPlace, searchPlaces } from '../lib/placeSearch';
import type { PlaceSuggestion } from '../types/beacon';

const RESULT_LIMIT = 5;
const GPS_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('location timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function formatReverseLabel(place: Location.LocationGeocodedAddress): string | null {
  const parts = [place.name, place.street, place.city].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;
  return parts.slice(0, 2).join(', ');
}

/**
 * Debounced callers should wait before invoking this.
 * Local venue matches resolve immediately; unmatched queries fall through to device geocoding.
 */
export async function geocodePlaces(query: string): Promise<PlaceSuggestion[]> {
  const local = searchPlaces(query, RESULT_LIMIT);
  if (local.length > 0) return local;

  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const remote = await Location.geocodeAsync(trimmed);
    return remote.slice(0, RESULT_LIMIT).map((hit, index) => ({
      id: `geo-${index}-${hit.latitude.toFixed(4)}-${hit.longitude.toFixed(4)}`,
      label: trimmed,
      subtitle: `${hit.latitude.toFixed(4)}, ${hit.longitude.toFixed(4)}`,
      latitude: hit.latitude,
      longitude: hit.longitude,
      placeType: 'address',
    }));
  } catch {
    return [];
  }
}

async function readDeviceFix(): Promise<PlaceSuggestion | null> {
  const existing = await Location.getForegroundPermissionsAsync();
  const status =
    existing.status === 'granted'
      ? existing.status
      : (await Location.requestForegroundPermissionsAsync()).status;
  if (status !== 'granted') return null;

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  let label = nearestPlace(latitude, longitude)?.label ?? null;
  try {
    const reversed = await Location.reverseGeocodeAsync({ latitude, longitude });
    const formatted = reversed[0] ? formatReverseLabel(reversed[0]) : null;
    if (formatted) label = formatted;
  } catch {
    // Nearest catalog label is enough when reverse geocoding is unavailable.
  }
  return {
    id: 'gps',
    label: label ? `${label} (Current Location)` : 'Current Location',
    subtitle: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    latitude,
    longitude,
    placeType: 'address',
  };
}

/** One-tap GPS fix. Falls back to the discovery baseline when permission or hardware is unavailable. */
export async function captureCurrentFix(fallback: {
  latitude: number;
  longitude: number;
}): Promise<PlaceSuggestion> {
  try {
    const fix = await withTimeout(readDeviceFix(), GPS_TIMEOUT_MS);
    if (fix) return fix;
  } catch {
    // Use the Boulder baseline already held by the discovery store.
  }

  const nearest = nearestPlace(fallback.latitude, fallback.longitude);
  return {
    id: 'gps-baseline',
    label: nearest ? `${nearest.label} (Current Location)` : 'Current Location',
    subtitle: `${fallback.latitude.toFixed(5)}, ${fallback.longitude.toFixed(5)}`,
    latitude: fallback.latitude,
    longitude: fallback.longitude,
    placeType: 'address',
  };
}
