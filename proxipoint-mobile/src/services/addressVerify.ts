import * as Location from 'expo-location';
import {
  interpretPhotonFeatures,
  type PhotonFeature,
  type VerifiedAddress,
} from '../lib/addressVerify';

const PHOTON_URL = 'https://photon.komoot.io';

interface PhotonCollection {
  features?: PhotonFeature[];
}

async function readPhoton(url: string): Promise<PhotonFeature[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error('Address lookup failed');
    }
    const body = (await response.json()) as PhotonCollection;
    return Array.isArray(body.features) ? body.features : [];
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyAddressQuery(query: string): Promise<VerifiedAddress | null> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return null;
  const url = `${PHOTON_URL}/api/?limit=1&lang=en&q=${encodeURIComponent(trimmed)}`;
  const features = await readPhoton(url);
  return interpretPhotonFeatures(trimmed, features);
}

export async function verifyCoordinates(latitude: number, longitude: number): Promise<VerifiedAddress | null> {
  const url = `${PHOTON_URL}/reverse?lang=en&lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`;
  const features = await readPhoton(url);
  const verified = interpretPhotonFeatures('', features);
  if (!verified) return null;
  return { ...verified, query: verified.label };
}

export async function readCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Location permission was denied');
  }
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}
