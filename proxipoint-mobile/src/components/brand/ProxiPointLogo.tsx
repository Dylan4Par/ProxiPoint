import React from 'react';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

/** Brand colors. The tile is the pale cyan from the app's palette; navy matches the map background. */
export const BRAND_NAVY = '#0a1120';
export const BRAND_TILE = '#67e8f9';
export const BRAND_CYAN = '#22d3ee';

/** Logo geometry in a 120x120 box: a map pin with a P cut through it. */
export const LOGO_VIEWBOX = 120;
const PIN_PATH = 'M60,103 C50,90 30,70 30,48 A30,30 0 1,1 90,48 C90,70 70,90 60,103 Z';
const P_PATH = 'M51,108 L51,48 A13,13 0 1,1 64,61 L52,61';
/** Where the pin's tip sits, as a fraction of the logo size (for ripples and shadows). */
export const PIN_TIP = { x: 60 / LOGO_VIEWBOX, y: 103 / LOGO_VIEWBOX };

let clipCounter = 0;

/**
 * The ProxiPoint mark.
 *  - variant "tile": the app icon (pale cyan rounded tile, navy pin, cyan P)
 *  - variant "pin":  just the pin, with your own colors (used by the splash animation)
 */
export const ProxiPointLogo: React.FC<{
  size: number;
  variant?: 'tile' | 'pin';
  pinColor?: string;
  letterColor?: string;
}> = ({ size, variant = 'tile', pinColor = BRAND_NAVY, letterColor = BRAND_TILE }) => {
  // Each instance needs its own clip id, or several logos on one screen would share one.
  const clipId = React.useMemo(() => `pp-pin-${(clipCounter += 1)}`, []);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${LOGO_VIEWBOX} ${LOGO_VIEWBOX}`}>
      <Defs>
        <ClipPath id={clipId}>
          <Path d={PIN_PATH} />
        </ClipPath>
      </Defs>
      {variant === 'tile' ? <Rect x={0} y={0} width={120} height={120} rx={27} fill={BRAND_TILE} /> : null}
      <Path d={PIN_PATH} fill={pinColor} />
      {/* The P is drawn as a thick line, clipped to the pin so its stem exits through the edge. */}
      <G clipPath={`url(#${clipId})`}>
        <Path d={P_PATH} fill="none" stroke={letterColor} strokeWidth={9} strokeLinejoin="round" />
      </G>
    </Svg>
  );
};
