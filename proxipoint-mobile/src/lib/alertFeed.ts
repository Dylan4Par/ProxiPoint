import type { ActiveContact, ProximityAlert, ProximityAlertEvent } from '../types/telemetry';

export function sortAlertsByDistance<T extends { distanceMeters: number }>(alerts: readonly T[]): T[] {
  return [...alerts].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export interface RangedContacts<T> {
  inRange: T[];
  outOfRange: T[];
}

// The radar geofence and the alerts tab share one radius. Contacts inside it
// stay active; the rest remain visible in the secondary out-of-range section.
export function partitionContactsByRadius<T extends { distanceMeters: number }>(
  contacts: readonly T[],
  radiusMeters: number,
): RangedContacts<T> {
  const sorted = sortAlertsByDistance(contacts);
  return {
    inRange: sorted.filter((contact) => contact.distanceMeters <= radiusMeters),
    outOfRange: sorted.filter((contact) => contact.distanceMeters > radiusMeters),
  };
}

export function contactsEnteringRadius<T extends { id: string; distanceMeters: number }>(
  previous: readonly T[],
  next: readonly T[],
  radiusMeters: number,
): T[] {
  const alreadyInside = new Set(
    previous.filter((contact) => contact.distanceMeters <= radiusMeters).map((contact) => contact.id),
  );
  return next.filter((contact) => contact.distanceMeters <= radiusMeters && !alreadyInside.has(contact.id));
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function mergeActiveAlerts(
  previous: readonly ActiveContact[],
  incoming: readonly ProximityAlert[],
  now = Date.now(),
): { alerts: ActiveContact[]; entered: ActiveContact[] } {
  const previousById = new Map(previous.map((alert) => [alert.id, alert]));
  const entered: ActiveContact[] = [];
  const alerts = incoming.map((alert) => {
    const existing = previousById.get(alert.id);
    if (existing) {
      return { ...existing, ...alert, observedAt: existing.observedAt };
    }
    const contact: ActiveContact = { ...alert, observedAt: now };
    entered.push(contact);
    return contact;
  });
  return { alerts, entered };
}

export function toProximityAlertEvent(alert: ProximityAlert): ProximityAlertEvent {
  return {
    targetEntityId: alert.id,
    targetName: alert.label,
    distanceMeters: alert.distanceMeters,
    latitude: alert.latitude,
    longitude: alert.longitude,
    message: 'Target detected within radius',
  };
}
