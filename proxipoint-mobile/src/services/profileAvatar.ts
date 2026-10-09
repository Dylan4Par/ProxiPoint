import { decodeAvatarPayload, writeStoredAvatar } from '../lib/profileAvatar';
import { useProfileAvatarStore } from '../stores/useProfileAvatarStore';
import { telemetryPingUrl } from './telemetryApi';

function avatarUrl(handle: string): string {
  const root = telemetryPingUrl().replace(/\/api\/v1\/telemetry\/ping$/, '');
  return `${root}/api/v1/profiles/${encodeURIComponent(handle)}/avatar`;
}

let picking = false;

export function chooseAvatarFile(): Promise<File | null> {
  if (picking || typeof document === 'undefined') return Promise.resolve(null);
  picking = true;
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif';
    input.id = 'profile-avatar-input';
    input.setAttribute('data-testid', 'profile-avatar-input');
    input.style.position = 'fixed';
    input.style.left = '0';
    input.style.top = '0';
    input.style.opacity = '0';
    input.style.width = '1px';
    input.style.height = '1px';
    document.body.appendChild(input);
    const finish = (file: File | null) => {
      picking = false;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    input.click();
  });
}

function squareJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context || image.width < 1 || image.height < 1) {
        URL.revokeObjectURL(url);
        reject(new Error('unreadable'));
        return;
      }
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    image.src = url;
  });
}

async function fileToAvatar(file: File): Promise<{ contentType: string; imageBase64: string; dataUri: string; error: string }> {
  const type = file.type.toLowerCase();
  if (type === 'image/jpeg' || type === 'image/png') {
    try {
      const dataUri = await squareJpeg(file);
      const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
      const decoded = decodeAvatarPayload('image/jpeg', base64);
      if (!decoded.error) return { contentType: 'image/jpeg', imageBase64: base64, dataUri: decoded.dataUri, error: '' };
    } catch {
      // Fall through and store the original file when the browser cannot draw it.
    }
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  const decoded = decodeAvatarPayload(type, btoa(binary));
  if (decoded.error) return { contentType: type, imageBase64: '', dataUri: '', error: decoded.error };
  return { contentType: decoded.contentType, imageBase64: decoded.dataUri.split(',')[1], dataUri: decoded.dataUri, error: '' };
}

export async function saveProfileAvatar(handle: string, file: File): Promise<string> {
  const prepared = await fileToAvatar(file);
  if (prepared.error) return prepared.error;

  const previous = useProfileAvatarStore.getState().byHandle[handle.trim().replace(/^@+/, '').toLowerCase()] ?? '';
  writeStoredAvatar(handle, prepared.dataUri);
  useProfileAvatarStore.getState().remember(handle, prepared.dataUri);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(avatarUrl(handle), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ contentType: prepared.contentType, imageBase64: prepared.imageBase64 }),
      signal: controller.signal,
    });
    if (response.status === 400) {
      writeStoredAvatar(handle, previous);
      useProfileAvatarStore.getState().remember(handle, previous);
      return 'Choose a JPEG, PNG, or GIF.';
    }
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
  return '';
}
