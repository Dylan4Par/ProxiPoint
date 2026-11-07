/**
 * In-app circle cropper for profile pictures and Point cover photos.
 * The phone's own crop screen only shows a square, so pickers ask for this instead:
 *   const crop = await requestCircleCrop({ uri, width, height });
 * The CircleCropHost (mounted once on the Discover screen) shows the cropper and resolves with
 * the square to keep, in the photo's own pixels, or null if the person cancels.
 */

export interface CropSource {
  uri: string;
  width: number;
  height: number;
}

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

interface CropRequest {
  source: CropSource;
  resolve: (rect: CropRect | null) => void;
}

let current: CropRequest | null = null;
const listeners = new Set<() => void>();

function changed() {
  listeners.forEach((listener) => listener());
}

export function requestCircleCrop(source: CropSource): Promise<CropRect | null> {
  // Only one at a time; a new request cancels an old one.
  current?.resolve(null);
  return new Promise((resolve) => {
    current = { source, resolve };
    changed();
  });
}

export function getCropRequest(): CropSource | null {
  return current?.source ?? null;
}

export function finishCrop(rect: CropRect | null) {
  const request = current;
  current = null;
  changed();
  request?.resolve(rect);
}

export function subscribeCrop(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
