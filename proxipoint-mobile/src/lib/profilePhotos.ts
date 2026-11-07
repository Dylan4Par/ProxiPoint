import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ensurePhotoPolicyAccepted } from './photoPolicy';

/** Banner: wide 16:9 image across the top of the Profile page. */
export const BANNER_WIDTH = 1280;
export const BANNER_HEIGHT = 720;
/** Recap photos keep their shape, scaled so the long side is at most this. */
export const RECAP_PHOTO_MAX_SIDE = 1440;

/**
 * Pick a profile banner. Android opens a 16:9 crop screen; on iOS (whose cropper is always
 * square) the picked photo is center-cropped to 16:9 afterwards. Returns null if cancelled.
 */
export async function pickBannerPhoto(): Promise<string | null> {
  if (!(await ensurePhotoPolicyAccepted())) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [16, 9],
    quality: 1,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];

  const actions: ImageManipulator.Action[] = [];
  const targetRatio = BANNER_WIDTH / BANNER_HEIGHT;
  if (asset.width > 0 && asset.height > 0 && Math.abs(asset.width / asset.height - targetRatio) > 0.02) {
    const cropWidth = Math.min(asset.width, Math.round(asset.height * targetRatio));
    const cropHeight = Math.round(cropWidth / targetRatio);
    actions.push({
      crop: {
        originX: Math.floor((asset.width - cropWidth) / 2),
        originY: Math.floor((asset.height - cropHeight) / 2),
        width: cropWidth,
        height: cropHeight,
      },
    });
  }
  actions.push({ resize: { width: BANNER_WIDTH, height: BANNER_HEIGHT } });
  const output = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return output.uri;
}

/**
 * Pick up to `limit` recap photos at once (multi-select). Each is shrunk to a sensible size
 * so posts stay quick to upload. Returns [] if cancelled.
 */
export async function pickRecapPhotos(limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  if (!(await ensurePhotoPolicyAccepted())) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    orderedSelection: true,
    quality: 1,
  });
  if (result.canceled || !result.assets?.length) return [];

  const picked = result.assets.slice(0, limit);
  return Promise.all(
    picked.map(async (asset) => {
      const longSide = Math.max(asset.width, asset.height);
      const actions: ImageManipulator.Action[] =
        longSide > RECAP_PHOTO_MAX_SIDE
          ? [
              {
                resize:
                  asset.width >= asset.height ? { width: RECAP_PHOTO_MAX_SIDE } : { height: RECAP_PHOTO_MAX_SIDE },
              },
            ]
          : [];
      const output = await ImageManipulator.manipulateAsync(asset.uri, actions, {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      return output.uri;
    }),
  );
}
