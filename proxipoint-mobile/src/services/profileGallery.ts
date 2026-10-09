import { decodeAvatarPayload, writeStoredAvatar } from '../lib/profileAvatar';
import {
  applyEmojiReaction,
  localGallery,
  type HostGallery,
  type HostPhoto,
  type PhotoReaction,
} from '../lib/profileGallery';
import { telemetryPingUrl } from './telemetryApi';

interface ProfileResponse {
  handle?: string;
  displayName?: string;
  following?: number;
  followers?: number;
  activities?: number;
  avatarType?: string;
  avatarBase64?: string;
  photos?: Array<{
    id?: string;
    eventTitle?: string;
    eventPlace?: string;
    territory?: string;
    eventAt?: string;
    contentType?: string;
    imageBase64?: string;
    reactions?: PhotoReaction[];
  }>;
}

function profileUrl(handle: string): string {
  const root = telemetryPingUrl().replace(/\/api\/v1\/telemetry\/ping$/, '');
  return `${root}/api/v1/profiles/${encodeURIComponent(handle)}`;
}

function mapPhoto(photo: NonNullable<ProfileResponse['photos']>[number], fallback: HostPhoto | undefined): HostPhoto | null {
  if (!photo.id || !photo.eventTitle || !photo.eventAt) return null;
  const imageUri = photo.imageBase64
    ? `data:${photo.contentType || 'image/png'};base64,${photo.imageBase64}`
    : fallback?.imageUri;
  if (!imageUri) return null;
  return {
    id: photo.id,
    eventTitle: photo.eventTitle,
    eventPlace: photo.eventPlace || fallback?.eventPlace || '',
    territory: photo.territory || fallback?.territory || '',
    eventAt: photo.eventAt,
    imageUri,
    reactions: Array.isArray(photo.reactions) ? photo.reactions : [],
  };
}

export async function loadHostGallery(handle: string): Promise<HostGallery> {
  const fallback = localGallery(handle);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(profileUrl(handle), { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) return fallback;
    const body = (await response.json()) as ProfileResponse;
    const photos = (body.photos ?? [])
      .map((photo) => mapPhoto(photo, fallback.photos.find((item) => item.id === photo.id)))
      .filter((photo): photo is HostPhoto => photo !== null);
    if (photos.length === 0) return fallback;
    let avatarUri = fallback.avatarUri;
    if (body.avatarBase64 && body.avatarType) {
      const decoded = decodeAvatarPayload(body.avatarType, body.avatarBase64);
      if (!decoded.error) {
        avatarUri = decoded.dataUri;
        writeStoredAvatar(body.handle || fallback.handle, avatarUri);
      }
    }
    return {
      handle: body.handle || fallback.handle,
      displayName: body.displayName || fallback.displayName,
      following: body.following ?? fallback.following,
      followers: body.followers ?? fallback.followers,
      activities: body.activities ?? photos.length,
      avatarUri,
      photos,
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export async function reactToHostPhoto(
  gallery: HostGallery,
  photoId: string,
  actor: string,
  emoji: string,
): Promise<{ gallery: HostGallery; error: string }> {
  const photo = gallery.photos.find((item) => item.id === photoId);
  if (!photo) return { gallery, error: 'That photo is no longer on the profile.' };
  const next = applyEmojiReaction(photo.reactions, actor, emoji);
  if (next.error) return { gallery, error: next.error };

  const updated = {
    ...gallery,
    photos: gallery.photos.map((item) => (item.id === photoId ? { ...item, reactions: next.reactions } : item)),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${profileUrl(gallery.handle)}/photos/${encodeURIComponent(photoId)}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ actor, emoji }),
      signal: controller.signal,
    });
    if (response.status === 400) {
      return { gallery, error: 'Photos can only be reacted to with an emoji.' };
    }
  } catch {
    return { gallery: updated, error: '' };
  } finally {
    clearTimeout(timer);
  }
  return { gallery: updated, error: '' };
}
