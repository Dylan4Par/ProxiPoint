/**
 * Profile → Notifications & Proximity Alerts: what to be told about, and when not to be.
 * Pure (no React / storage), so it's testable and the server can use the same rules.
 * Server side: PUT /me/alert-prefs with this shape; push is sent by the server.
 */

export type ChannelAlerts = 'all' | 'boosted_live' | 'off';
export type VenueAlerts = 'all' | 'new_shows' | 'off';

export interface AlertPrefs {
  /** Push when a followed #tag goes live within radiusMeters of you. */
  proximityOn: boolean;
  radiusMeters: number;
  joinedChannels: ChannelAlerts;
  venues: VenueAlerts;
  quietOn: boolean;
  /** Hours 0–23, local time. Quiet from quietStart until quietEnd (may cross midnight). */
  quietStart: number;
  quietEnd: number;
}

const MILE = 1609.344;

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  proximityOn: true,
  radiusMeters: Math.round(5 * MILE),
  joinedChannels: 'all',
  venues: 'new_shows',
  quietOn: true,
  quietStart: 22,
  quietEnd: 8,
};

export const CHANNEL_ALERT_OPTIONS: Array<{ id: ChannelAlerts; label: string }> = [
  { id: 'all', label: 'All Events' },
  { id: 'boosted_live', label: 'Live & Boosted Only' },
  { id: 'off', label: 'Off' },
];

export const VENUE_ALERT_OPTIONS: Array<{ id: VenueAlerts; label: string }> = [
  { id: 'all', label: 'All Events' },
  { id: 'new_shows', label: 'New Shows Only' },
  { id: 'off', label: 'Off' },
];

/** Alert radius choices in the units from Settings. */
export function alertRadiusOptions(units: 'metric' | 'imperial'): Array<{ meters: number; label: string }> {
  return units === 'imperial'
    ? [1, 3, 5, 10, 25].map((mi) => ({ meters: Math.round(mi * MILE), label: `${mi} ${mi === 1 ? 'mile' : 'miles'}` }))
    : [2, 5, 10, 25, 50].map((km) => ({ meters: km * 1000, label: `${km} km` }));
}

/** The closest listed radius label (so a saved miles value still reads well in km). */
export function radiusLabel(meters: number, units: 'metric' | 'imperial'): string {
  const options = alertRadiusOptions(units);
  return options.reduce((best, o) => (Math.abs(o.meters - meters) < Math.abs(best.meters - meters) ? o : best)).label;
}

/** "10:00 PM", "8:00 AM", "12:00 AM". */
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
}

/** Whether a push at this time would be muted by quiet hours. */
export function inQuietHours(prefs: Pick<AlertPrefs, 'quietOn' | 'quietStart' | 'quietEnd'>, at: Date): boolean {
  if (!prefs.quietOn || prefs.quietStart === prefs.quietEnd) return false;
  const h = at.getHours();
  return prefs.quietStart < prefs.quietEnd
    ? h >= prefs.quietStart && h < prefs.quietEnd
    : h >= prefs.quietStart || h < prefs.quietEnd;
}

/** Saved prefs merged over the defaults (unknown or broken values fall back). */
export function readAlertPrefs(raw: unknown): AlertPrefs {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<AlertPrefs>;
  const hour = (x: unknown, d: number) => (typeof x === 'number' && x >= 0 && x <= 23 ? Math.floor(x) : d);
  return {
    proximityOn: typeof v.proximityOn === 'boolean' ? v.proximityOn : DEFAULT_ALERT_PREFS.proximityOn,
    radiusMeters: typeof v.radiusMeters === 'number' && v.radiusMeters > 0 ? v.radiusMeters : DEFAULT_ALERT_PREFS.radiusMeters,
    joinedChannels: CHANNEL_ALERT_OPTIONS.some((o) => o.id === v.joinedChannels) ? (v.joinedChannels as ChannelAlerts) : DEFAULT_ALERT_PREFS.joinedChannels,
    venues: VENUE_ALERT_OPTIONS.some((o) => o.id === v.venues) ? (v.venues as VenueAlerts) : DEFAULT_ALERT_PREFS.venues,
    quietOn: typeof v.quietOn === 'boolean' ? v.quietOn : DEFAULT_ALERT_PREFS.quietOn,
    quietStart: hour(v.quietStart, DEFAULT_ALERT_PREFS.quietStart),
    quietEnd: hour(v.quietEnd, DEFAULT_ALERT_PREFS.quietEnd),
  };
}
