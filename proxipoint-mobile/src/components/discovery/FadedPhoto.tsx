import React, { useId } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

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
  return (
    // The photo is fully opaque and a gradient in the card's own color covers it. Same look as
    // fading the photo itself, without an SVG mask (unreliable on some Android versions).
    <View style={style} pointerEvents="none" testID={testID}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
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
