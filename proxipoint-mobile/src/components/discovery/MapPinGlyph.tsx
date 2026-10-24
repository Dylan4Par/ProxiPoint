import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { teardropPath } from '../../lib/pinShape';

/** Drawing box; the head's center sits at (C, C). */
const BOX_W = 32;
const BOX_H = 36;
const C = 16;
const HEAD_R = 10;
const TIP_Y = C + HEAD_R + 7;
const PIN_PATH = teardropPath(C, C, HEAD_R, TIP_Y);

/**
 * A map pin drawn as one vector shape: round head, pointed tip, and one rim of even width all the
 * way round. Vector paths stay crisp and even under the map's zoom / counter-zoom scaling, which
 * View borders don't.
 *
 * Takes the same space in the pin column as the old 22px head + tip (the extra drawing room for
 * the boost glow and the rim hangs outside via negative margins), so labels don't move.
 */
export const MapPinGlyph: React.FC<{
  fill: string;
  rim: string;
  rimWidth?: number;
  /** Soft colored glow behind the head (Boosted). */
  glow?: string | null;
  /** Head a little bigger, as before for the selected pin. */
  enlarged?: boolean;
  dotColor?: string;
}> = ({ fill, rim, rimWidth = 2.5, glow = null, enlarged = false, dotColor = '#ffffff' }) => (
  <View
    pointerEvents="none"
    style={{
      width: BOX_W,
      height: BOX_H,
      // The old head was 22 wide and started at the column's padding; keep the head center there.
      marginHorizontal: -(BOX_W - 22) / 2,
      marginTop: -(C - 11),
      marginBottom: -(BOX_H - (C - 11) - 27),
      transformOrigin: [C, C, 0],
      transform: [{ scale: enlarged ? 1.2 : 1 }],
    }}
  >
    <Svg width={BOX_W} height={BOX_H} viewBox={`0 0 ${BOX_W} ${BOX_H}`}>
      {glow ? <Circle cx={C} cy={C} r={HEAD_R + 4.5} fill={glow} opacity={0.35} /> : null}
      <Path d={PIN_PATH} fill={fill} stroke={rim} strokeWidth={rimWidth} strokeLinejoin="round" />
      <Circle cx={C} cy={C} r={3} fill={dotColor} />
    </Svg>
  </View>
);
