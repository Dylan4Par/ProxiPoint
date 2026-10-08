export const MAX_AVATAR_BYTES = 1536 * 1024;

const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);

export function avatarHandle(handle: string): string {
  return handle.trim().replace(/^@+/, '').toLowerCase();
}

export function avatarStorageKey(handle: string): string {
  return `proxipoint.avatar.${avatarHandle(handle)}`;
}

export function avatarDataUri(contentType: string, base64: string): string {
  return `data:${contentType};base64,${base64}`;
}

type AvatarStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function browserStorage(): AvatarStorage | null {
  if (typeof globalThis.localStorage === 'undefined') return null;
  return globalThis.localStorage;
}

export function readStoredAvatar(handle: string, storage: AvatarStorage | null = browserStorage()): string {
  if (!storage) return '';
  const value = storage.getItem(avatarStorageKey(handle)) ?? '';
  return value.startsWith('data:image/') ? value : '';
}

export function writeStoredAvatar(handle: string, dataUri: string, storage: AvatarStorage | null = browserStorage()): void {
  if (!storage) return;
  const key = avatarStorageKey(handle);
  if (!dataUri) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, dataUri);
}

export function bytesFromBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function looksLikeImage(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === 'image/png') {
    return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (contentType === 'image/jpeg') return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if (contentType === 'image/gif') return bytes.length > 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  return false;
}

export function decodeAvatarPayload(
  contentType: string,
  base64: string,
): { contentType: string; dataUri: string; error: string } {
  const type = contentType.toLowerCase().split(';')[0].trim();
  const cleaned = base64.replace(/\s+/g, '');
  if (!AVATAR_TYPES.has(type) || cleaned.length === 0) {
    return { contentType: type, dataUri: '', error: 'Choose a JPEG, PNG, or GIF.' };
  }
  if (cleaned.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 4) {
    return { contentType: type, dataUri: '', error: 'That picture is too large.' };
  }
  const bytes = bytesFromBase64(cleaned);
  if (!bytes || bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES || !looksLikeImage(type, bytes)) {
    return { contentType: type, dataUri: '', error: 'Choose a JPEG, PNG, or GIF.' };
  }
  return { contentType: type, dataUri: avatarDataUri(type, cleaned), error: '' };
}
