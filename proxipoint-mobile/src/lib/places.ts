import * as Location from 'expo-location';

/**
 * Cities for Discover: the built-in list for instant suggestions, the phone's geocoder for
 * anything else, and GPS for "Use my location".
 */

export interface CityPlace {
  /** e.g. "Denver" */
  name: string;
  /** e.g. "CO" (US states are shortened) */
  region?: string;
  latitude: number;
  longitude: number;
}

export function cityLabel(place: Pick<CityPlace, 'name' | 'region'> | null | undefined): string {
  if (!place?.name) return 'Your area';
  return place.region ? `${place.name}, ${place.region}` : place.name;
}

/** Instant suggestions (no network needed). Colorado first, then large US cities. */
export const CITY_LIST: CityPlace[] = [
  { name: 'Denver', region: 'CO', latitude: 39.7392, longitude: -104.9903 },
  { name: 'Boulder', region: 'CO', latitude: 40.015, longitude: -105.2705 },
  { name: 'Erie', region: 'CO', latitude: 40.0503, longitude: -105.05 },
  { name: 'Lafayette', region: 'CO', latitude: 39.9936, longitude: -105.0897 },
  { name: 'Louisville', region: 'CO', latitude: 39.9778, longitude: -105.1319 },
  { name: 'Broomfield', region: 'CO', latitude: 39.9205, longitude: -105.0867 },
  { name: 'Longmont', region: 'CO', latitude: 40.1672, longitude: -105.1019 },
  { name: 'Westminster', region: 'CO', latitude: 39.8367, longitude: -105.0372 },
  { name: 'Thornton', region: 'CO', latitude: 39.868, longitude: -104.9719 },
  { name: 'Arvada', region: 'CO', latitude: 39.8028, longitude: -105.0875 },
  { name: 'Lakewood', region: 'CO', latitude: 39.7047, longitude: -105.0814 },
  { name: 'Golden', region: 'CO', latitude: 39.7555, longitude: -105.2211 },
  { name: 'Aurora', region: 'CO', latitude: 39.7294, longitude: -104.8319 },
  { name: 'Fort Collins', region: 'CO', latitude: 40.5853, longitude: -105.0844 },
  { name: 'Loveland', region: 'CO', latitude: 40.3978, longitude: -105.075 },
  { name: 'Greeley', region: 'CO', latitude: 40.4233, longitude: -104.7091 },
  { name: 'Estes Park', region: 'CO', latitude: 40.3772, longitude: -105.5217 },
  { name: 'Colorado Springs', region: 'CO', latitude: 38.8339, longitude: -104.8214 },
  { name: 'Pueblo', region: 'CO', latitude: 38.2544, longitude: -104.6091 },
  { name: 'Breckenridge', region: 'CO', latitude: 39.4817, longitude: -106.0384 },
  { name: 'Vail', region: 'CO', latitude: 39.6403, longitude: -106.3742 },
  { name: 'Aspen', region: 'CO', latitude: 39.1911, longitude: -106.8175 },
  { name: 'Steamboat Springs', region: 'CO', latitude: 40.485, longitude: -106.8317 },
  { name: 'Durango', region: 'CO', latitude: 37.2753, longitude: -107.8801 },
  { name: 'Grand Junction', region: 'CO', latitude: 39.0639, longitude: -108.5506 },
  { name: 'Cheyenne', region: 'WY', latitude: 41.14, longitude: -104.8202 },
  { name: 'Salt Lake City', region: 'UT', latitude: 40.7608, longitude: -111.891 },
  { name: 'Albuquerque', region: 'NM', latitude: 35.0844, longitude: -106.6504 },
  { name: 'Phoenix', region: 'AZ', latitude: 33.4484, longitude: -112.074 },
  { name: 'Las Vegas', region: 'NV', latitude: 36.1699, longitude: -115.1398 },
  { name: 'Los Angeles', region: 'CA', latitude: 34.0522, longitude: -118.2437 },
  { name: 'San Diego', region: 'CA', latitude: 32.7157, longitude: -117.1611 },
  { name: 'San Francisco', region: 'CA', latitude: 37.7749, longitude: -122.4194 },
  { name: 'Mountain View', region: 'CA', latitude: 37.3861, longitude: -122.0839 },
  { name: 'Portland', region: 'OR', latitude: 45.5152, longitude: -122.6784 },
  { name: 'Seattle', region: 'WA', latitude: 47.6062, longitude: -122.3321 },
  { name: 'Austin', region: 'TX', latitude: 30.2672, longitude: -97.7431 },
  { name: 'Dallas', region: 'TX', latitude: 32.7767, longitude: -96.797 },
  { name: 'Houston', region: 'TX', latitude: 29.7604, longitude: -95.3698 },
  { name: 'San Antonio', region: 'TX', latitude: 29.4241, longitude: -98.4936 },
  { name: 'Kansas City', region: 'MO', latitude: 39.0997, longitude: -94.5786 },
  { name: 'Minneapolis', region: 'MN', latitude: 44.9778, longitude: -93.265 },
  { name: 'Chicago', region: 'IL', latitude: 41.8781, longitude: -87.6298 },
  { name: 'Nashville', region: 'TN', latitude: 36.1627, longitude: -86.7816 },
  { name: 'New Orleans', region: 'LA', latitude: 29.9511, longitude: -90.0715 },
  { name: 'Atlanta', region: 'GA', latitude: 33.749, longitude: -84.388 },
  { name: 'Miami', region: 'FL', latitude: 25.7617, longitude: -80.1918 },
  { name: 'Washington', region: 'DC', latitude: 38.9072, longitude: -77.0369 },
  { name: 'Philadelphia', region: 'PA', latitude: 39.9526, longitude: -75.1652 },
  { name: 'New York', region: 'NY', latitude: 40.7128, longitude: -74.006 },
  { name: 'Boston', region: 'MA', latitude: 42.3601, longitude: -71.0589 },
];

/** Suggestions for what's typed: names starting with it first, then names containing it. */
export function suggestCities(query: string, limit = 8): CityPlace[] {
  const q = query.trim().toLowerCase().replace(/,.*$/, '');
  if (!q) return [];
  const starts = CITY_LIST.filter((city) => city.name.toLowerCase().startsWith(q));
  const contains = CITY_LIST.filter((city) => !starts.includes(city) && city.name.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

const US_STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};

function shortRegion(region?: string | null, country?: string | null): string | undefined {
  if (!region) return country ?? undefined;
  return US_STATES[region.trim().toLowerCase()] ?? region;
}

/** City name for a spot, from the phone's geocoder. Null when it can't tell (offline, emulator). */
export async function cityAt(latitude: number, longitude: number): Promise<CityPlace | null> {
  try {
    const [hit] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!hit) return null;
    const name = hit.city || hit.subregion || hit.district || hit.name;
    if (!name) return null;
    return { name, region: shortRegion(hit.region, hit.isoCountryCode), latitude, longitude };
  } catch {
    return null;
  }
}

/** Look up any typed city with the phone's geocoder ("Moab, UT", "Paris"). */
export async function findCity(query: string): Promise<CityPlace | null> {
  const text = query.trim();
  if (!text) return null;
  try {
    const [hit] = await Location.geocodeAsync(text);
    if (!hit) return null;
    const named = await cityAt(hit.latitude, hit.longitude);
    // Keep the spot the geocoder found (the city's middle), with its proper name.
    return named
      ? { ...named, latitude: hit.latitude, longitude: hit.longitude }
      : { name: text.replace(/,.*$/, ''), latitude: hit.latitude, longitude: hit.longitude };
  } catch {
    return null;
  }
}

export interface FixResult {
  ok: boolean;
  latitude: number;
  longitude: number;
  /** Why it failed (ok: false). */
  reason?: 'denied' | 'unavailable';
}

/** Your current GPS position (asks for location permission if needed). */
export async function currentPosition(): Promise<FixResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return { ok: false, latitude: 0, longitude: 0, reason: 'denied' };
    const fix =
      (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { ok: true, latitude: fix.coords.latitude, longitude: fix.coords.longitude };
  } catch {
    return { ok: false, latitude: 0, longitude: 0, reason: 'unavailable' };
  }
}

/** Follow your position while tracking is on. Returns a function that stops it. */
export async function watchPosition(onMove: (latitude: number, longitude: number) => void): Promise<() => void> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') return () => undefined;
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 100, timeInterval: 30000 },
      (fix) => onMove(fix.coords.latitude, fix.coords.longitude),
    );
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}
