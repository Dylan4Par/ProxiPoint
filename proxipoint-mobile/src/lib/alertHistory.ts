export const ALERT_HISTORY_STORAGE_KEY = '@proxipoint_alert_history';
export const ALERT_HISTORY_LIMIT = 100;

export interface AlertHistoryEntry {
  targetEntityId: string;
  targetName: string;
  distanceMeters: number;
  latitude: number;
  longitude: number;
  seenAt: number;
}

export function prependAlertHistory(
  history: readonly AlertHistoryEntry[],
  entry: AlertHistoryEntry,
  limit = ALERT_HISTORY_LIMIT,
): AlertHistoryEntry[] {
  return [entry, ...history].slice(0, limit);
}

export function isAlertHistoryEntry(value: unknown): value is AlertHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<AlertHistoryEntry>;
  return (
    typeof entry.targetEntityId === 'string' &&
    typeof entry.targetName === 'string' &&
    typeof entry.distanceMeters === 'number' &&
    typeof entry.latitude === 'number' &&
    typeof entry.longitude === 'number' &&
    typeof entry.seenAt === 'number'
  );
}
