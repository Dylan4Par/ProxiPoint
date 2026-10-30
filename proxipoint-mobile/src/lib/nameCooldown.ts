/**
 * Your display name can be changed once every 72 hours (Settings → Edit profile). The time of the
 * last change is kept on the phone (Settings saves it under NAME_CHANGED_AT_KEY); the server should
 * enforce the same rule on PATCH /me.
 */
export const NAME_COOLDOWN_MS = 72 * 60 * 60 * 1000;
export const NAME_CHANGED_AT_KEY = 'pp.profile.nameChangedAt.v1';

export interface NameCooldown {
  allowed: boolean;
  /** When the next change is allowed (null when allowed now). */
  availableAt: Date | null;
}

export function nameCooldown(lastChangedAt: string | null, now = new Date()): NameCooldown {
  const last = lastChangedAt ? Date.parse(lastChangedAt) : NaN;
  if (!Number.isFinite(last)) return { allowed: true, availableAt: null };
  const next = last + NAME_COOLDOWN_MS;
  return next <= now.getTime() ? { allowed: true, availableAt: null } : { allowed: false, availableAt: new Date(next) };
}

/** "in 2 days", "in 5 hours", "in 12 minutes". */
export function waitLabel(availableAt: Date, now = new Date()): string {
  const minutes = Math.max(1, Math.ceil((availableAt.getTime() - now.getTime()) / 60000));
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.ceil(hours / 24);
  return `in ${days} days`;
}
