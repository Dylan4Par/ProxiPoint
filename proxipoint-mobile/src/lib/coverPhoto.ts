import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ensurePhotoPolicyAccepted } from './photoPolicy';
import { requestCircleCrop } from './circleCrop';

/** Cover photos are stored as square JPEGs this size and shown as circles. */
export const COVER_PHOTO_SIZE = 512;

export interface CoverPhoto {
  uri: string;
  base64?: string;
}

/**
 * Opens the photo library, then ProxiPoint's own circle cropper (drag and pinch inside a
 * circle guide), and saves what's in the circle as a 512x512 JPEG.
 * Used for profile pictures and Point cover photos. Returns null if the person cancels at
 * any step. Throws if the photo can't be processed.
 */
export async function pickCoverPhoto(): Promise<CoverPhoto | null> {
  // First upload ever: the photo rules have to be accepted before the library opens.
  if (!(await ensurePhotoPolicyAccepted())) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // Our cropper replaces the phone's square one, so it can show the circle.
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled || !result.assets?.length) return null;
  return cropToCircle(result.assets[0]);
}

/** Circle-crop a picked photo (used by pickCoverPhoto and the Drop Point sheet). */
export async function cropToCircle(asset: { uri: string; width: number; height: number }): Promise<CoverPhoto | null> {
  let { width, height } = asset;
  if (!width || !height) {
    // Some sources don't report a size; ask the manipulator for it.
    const probe = await ImageManipulator.manipulateAsync(asset.uri, [], {});
    width = probe.width;
    height = probe.height;
  }
  const rect = await requestCircleCrop({ uri: asset.uri, width, height });
  if (!rect) return null;

  const output = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ crop: rect }, { resize: { width: COVER_PHOTO_SIZE, height: COVER_PHOTO_SIZE } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return { uri: output.uri, base64: output.base64 };
}
