export type InviteKind = 'facebook' | 'proxipoint' | 'phone';

export interface BeaconInvite {
  kind: InviteKind;
  id: string;
  label: string;
}

export interface LinkedFacebookAccount {
  id: string;
  label: string;
}

/** Facebook accounts already linked to this operator. */
export const LINKED_FACEBOOK_ACCOUNTS: LinkedFacebookAccount[] = [
  { id: 'fb-maya-chen', label: 'Maya Chen' },
  { id: 'fb-jordan-ellis', label: 'Jordan Ellis' },
  { id: 'fb-sam-ortiz', label: 'Sam Ortiz' },
];

export interface InviteResult {
  invites: BeaconInvite[];
  error: string;
}

function sameInvite(invites: BeaconInvite[], kind: InviteKind, id: string): boolean {
  return invites.some((invite) => invite.kind === kind && invite.id === id);
}

export function toggleFacebookInvite(invites: BeaconInvite[], accountId: string): InviteResult {
  const account = LINKED_FACEBOOK_ACCOUNTS.find((item) => item.id === accountId);
  if (!account) {
    return { invites, error: 'That Facebook account is not linked.' };
  }
  if (sameInvite(invites, 'facebook', account.id)) {
    return {
      invites: invites.filter((invite) => !(invite.kind === 'facebook' && invite.id === account.id)),
      error: '',
    };
  }
  return {
    invites: [...invites, { kind: 'facebook', id: account.id, label: account.label }],
    error: '',
  };
}

export function addProxiPointInvite(invites: BeaconInvite[], handle: string): InviteResult {
  const clean = handle.trim().replace(/^@+/, '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,23}$/.test(clean)) {
    return { invites, error: 'Enter a ProxiPoint handle, such as ranger-7.' };
  }
  if (sameInvite(invites, 'proxipoint', clean)) {
    return { invites, error: 'That ProxiPoint account is already invited.' };
  }
  return {
    invites: [...invites, { kind: 'proxipoint', id: clean, label: `@${clean}` }],
    error: '',
  };
}

export function addPhoneInvite(invites: BeaconInvite[], raw: string): InviteResult {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return { invites, error: 'Enter a phone number with at least 10 digits.' };
  }
  const id = `${trimmed.startsWith('+') ? '+' : ''}${digits}`;
  if (sameInvite(invites, 'phone', id)) {
    return { invites, error: 'That phone number is already invited.' };
  }
  return {
    invites: [...invites, { kind: 'phone', id, label: trimmed }],
    error: '',
  };
}

export function removeInvite(invites: BeaconInvite[], id: string): BeaconInvite[] {
  return invites.filter((invite) => invite.id !== id);
}

export function inviteSummary(invites: BeaconInvite[] | undefined): string {
  const list = invites ?? [];
  if (list.length === 0) return '';
  if (list.length === 1) return `Invited ${list[0].label}`;
  return `Invited ${list.length}`;
}
