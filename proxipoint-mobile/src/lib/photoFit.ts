/**
 * Where to draw a card's cover photo so its middle sits in the part of the photo you can see
 * (the photo fades out on its right side, lib FadedPhoto), filling the whole box with no gaps.
 * Pure, so it's tested.
 */

export interface PhotoPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Like resizeMode 'cover', but with the photo's middle at `focusX` (a share of the box's width)
 * instead of the box's middle. Zooms in only as far as needed so the photo still reaches both
 * edges; vertically it stays centered.
 */
export function placePhoto(
  box: { width: number; height: number },
  photo: { width: number; height: number },
  focusX: number,
): PhotoPlacement | null {
  if (!(box.width > 0 && box.height > 0 && photo.width > 0 && photo.height > 0)) return null;
  const cx = box.width * Math.min(1, Math.max(0, focusX));
  const cover = Math.max(box.height / photo.height, box.width / photo.width);
  // Wide enough that half the photo reaches from its middle to the farther edge.
  const reach = (2 * Math.max(cx, box.width - cx)) / photo.width;
  const scale = Math.max(cover, reach);
  const width = photo.width * scale;
  const height = photo.height * scale;
  return { left: cx - width / 2, top: (box.height - height) / 2, width, height };
}
