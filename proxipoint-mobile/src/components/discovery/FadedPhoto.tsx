import React, { useId, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import { placePhoto, type PhotoPlacement } from '../../lib/photoFit';

/** Photo strength over its left side (1 = full strength). */
export const PHOTO_OPACITY = 1;
/** Share of the photo's width, at its right edge, that fades out to the card's color. */
export const PHOTO_FADE = 0.42;
/**
 * Where the details start, as a share of the photo's width: the fade has all but finished by here
 * (about 1% photo at the first letter), so no text sits on the photo itself.
 */
export const PHOTO_CONTENT_RATIO = 92 / 98;
/**
 * Where the photo's middle goes, as a share of its box's width: the middle of the part you can
 * see (the clear left side plus the start of the fade), not the box's middle, which is in the fade.
 */
export const PHOTO_FOCUS_X = (1 - PHOTO_FADE) * 0.6;

/**
 * Stops for the cover over the photo: even (1 - PHOTO_OPACITY) up to the fade, then an eased
 * (smoothstep) ramp to solid, reaching it a little before the edge so no sliver of photo shows.
 */
const FADE_STOPS: { offset: number; opacity: number }[] = (() => {
  const start = 1 - PHOTO_FADE;
  const end = 0.96;
  return [
    { offset: 0, opacity: 1 - PHOTO_OPACITY },
    ...[0, 0.25, 0.5, 0.75, 1].map((t) => ({
      offset: start + (end - start) * t,
      opacity: 1 - PHOTO_OPACITY + PHOTO_OPACITY * t * t * (3 - 2 * t),
    })),
    { offset: 1, opacity: 1 },
  ];
})();

/**
 * An event's cover photo down a card's left edge, fading smoothly into the card on its right.
 * Used by Point cards and the Featured Recommendations deck so both look the same.
 * Place it with `style` (absolute, left/top/bottom, width); draw it first so the card's content
 * sits on top. The card needs overflow: 'hidden' to keep it inside the rounded corners.
 */
export const FadedPhoto: React.FC<{ uri: string; style?: StyleProp<ViewStyle>; testID?: string }> = ({ uri, style, testID }) => {
  const { colors: c } = useTheme();
  // SVG ids must be plain names; useId gives ":r1:"-style ones.
  const fadeId = `faded-photo-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // The box's size and the photo's own size, to center the photo on the visible part and zoom
  // in just enough to leave no gap (lib/photoFit). Until both are known the photo is hidden, so
  // it doesn't jump; if the photo's size never comes, it falls back to a plain centered cover.
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  // Kept with its photo's address, so a card that switches photos (the deck) waits for the new one.
  const [loaded, setLoaded] = useState<{ uri: string; size: { width: number; height: number } | 'unknown' } | null>(null);
  const natural = loaded && loaded.uri === uri ? loaded.size : null;
  const placed: PhotoPlacement | null =
    box && natural && natural !== 'unknown' ? placePhoto(box, natural, PHOTO_FOCUS_X) : null;
  const fallback = natural === 'unknown' || (box != null && natural != null && !placed);
  return (
    // The photo is fully opaque and a gradient in the card's own color covers it. Same look as
    // fading the photo itself, without an SVG mask (unreliable on some Android versions).
    <View
      style={[style, styles.clip]}
      pointerEvents="none"
      testID={testID}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!box || Math.abs(box.width - width) > 0.5 || Math.abs(box.height - height) > 0.5) setBox({ width, height });
      }}
    >
      {/* The photo stops EDGE_INSET short of the box's right edge, where the fade is already solid:
          drawn right up to it, a hairline of photo showed at the edge (the box's edge falls between
          pixels and the fade's last pixel was only partly covering it). */}
      <View style={styles.photoClip}>
        <Image
          source={{ uri }}
          style={
            // BLEED past every edge: the box's edges fall between pixels, and a photo ending exactly
            // on them could be rounded a pixel short, leaving a thin line under it. The box trims it.
            placed
              ? {
                  position: 'absolute',
                  left: placed.left - BLEED,
                  top: placed.top - BLEED,
                  width: placed.width + 2 * BLEED,
                  height: placed.height + 2 * BLEED,
                }
              : [styles.fallback, { opacity: fallback ? 1 : 0 }]
          }
          resizeMode="cover"
          onLoad={(e) => {
            const src = (e.nativeEvent as { source?: { width?: number; height?: number } }).source;
            setLoaded({ uri, size: src?.width && src?.height ? { width: src.width, height: src.height } : 'unknown' });
          }}
          onError={() => setLoaded({ uri, size: 'unknown' })}
        />
      </View>
      {/* Sized to the measured box: an SVG sized only by "100%" can fall back to 300 × 150. */}
      <Svg style={StyleSheet.absoluteFill} width={box?.width ?? '100%'} height={box?.height ?? '100%'}>
        <Defs>
          <LinearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
            {FADE_STOPS.map((st) => (
              <Stop key={st.offset} offset={st.offset} stopColor={c.surface} stopOpacity={st.opacity} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${fadeId})`} />
      </Svg>
    </View>
  );
};

/** Points at the box's right edge with no photo under the (solid) end of the fade. */
const EDGE_INSET = 2;
/** How far the photo is drawn past the box's other edges (trimmed by the box), so no gap shows. */
const BLEED = 1;

const styles = StyleSheet.create({
  // The photo can be drawn wider than its box (zoomed to fill around its focus point).
  clip: { overflow: 'hidden' },
  photoClip: { position: 'absolute', top: 0, bottom: 0, left: 0, right: EDGE_INSET, overflow: 'hidden' },
  // Before the photo's size is known (or if it never is): plain cover, also bled past the edges.
  fallback: { position: 'absolute', top: -BLEED, bottom: -BLEED, left: -BLEED, right: -BLEED },
});
