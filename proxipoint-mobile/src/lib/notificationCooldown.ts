export const NOTIFICATION_COOLDOWN_MS = 60 * 1000;

export function claimNotificationSlot(
  cache: Map<string, number>,
  targetEntityId: string,
  now: number,
  cooldownMs = NOTIFICATION_COOLDOWN_MS,
): boolean {
  const lastFired = cache.get(targetEntityId);
  if (lastFired !== undefined && now - lastFired < cooldownMs) return false;
  cache.set(targetEntityId, now);
  return true;
}
