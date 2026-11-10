import React, { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

/** Boost amber (same as the bolt pill and the gold pin rim). */
const AMBER = '#f59e0b';
/**
 * How strong the amber is at the card's left and right edges: a light orange on the left,
 * deepening to the right. Dark mode needs a little more to show on the dark card.
 */
const STRENGTH = {
  light: { left: 0.06, right: 0.3 },
  dark: { left: 0.08, right: 0.34 },
} as const;

/**
 * The boosted card's ombre: a see-through amber wash, light on the left and darker on the right,
 * over the whole card. Draw it right after the card's photo (if any) and before its content, so it
 * warms the photo slightly and sits under the text and buttons. The card needs overflow: 'hidden'
 * so the wash follows its rounded corners.
 *
 * The wash is drawn at the card's measured size: an SVG sized only by "100%" inside an absolutely
 * placed box fell back to SVG's default 300 × 150 on Android, so it stopped partway across.
 */
export const BoostOmbre: React.FC = () => {
  const { mode } = useTheme();
  const s = STRENGTH[mode === 'light' ? 'light' : 'dark'];
  // SVG ids must be plain names; useId gives ":r1:"-style ones.
  const id = `boost-ombre-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      testID="boost-ombre"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!size || Math.abs(size.width - width) > 0.5 || Math.abs(size.height - height) > 0.5) setSize({ width, height });
      }}
    >
      {size ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2={size.width} y2="0" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={AMBER} stopOpacity={s.left} />
              <Stop offset="1" stopColor={AMBER} stopOpacity={s.right} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.width} height={size.height} fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
};
