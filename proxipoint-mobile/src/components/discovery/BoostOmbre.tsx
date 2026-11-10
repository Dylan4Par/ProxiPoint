import React, { useId } from 'react';
import { StyleSheet } from 'react-native';
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
 */
export const BoostOmbre: React.FC = () => {
  const { mode } = useTheme();
  const s = STRENGTH[mode === 'light' ? 'light' : 'dark'];
  // SVG ids must be plain names; useId gives ":r1:"-style ones.
  const id = `boost-ombre-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none" testID="boost-ombre">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={AMBER} stopOpacity={s.left} />
          <Stop offset="1" stopColor={AMBER} stopOpacity={s.right} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
};
