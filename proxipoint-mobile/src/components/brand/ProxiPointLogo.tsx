import React from 'react';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

/** Brand colors. The tile is the pale cyan from the app's palette; navy matches the map background. */
export const BRAND_NAVY = '#0a1120';
export const BRAND_TILE = '#67e8f9';
export const BRAND_CYAN = '#22d3ee';

/**
 * Logo geometry in a 120x120 box: a map pin with a big P cut through it (Nov 2026 mark).
 *  - Pin: a circle (centre 60,49.3, radius 30.85) with straight sides meeting in a sharp tip.
 *  - P: one thick stroke. The stem runs down the bowl's left side and out through the pin's
 *    lower-left edge; the bowl is a ring around the pin's centre, closed by a bar at the bottom.
 * Fitted to the master artwork; assets/proxipoint-logo.svg and the app icons use the same paths.
 */
export const LOGO_VIEWBOX = 120;
const PIN_PATH = 'M60,102.5 L34.87,67.19 A30.85,30.85 0 1,1 85.13,67.19 Z';
const P_PATH = 'M45.5,112 L45.5,48.6 A14.5,14.5 0 1,1 60,63.1 L46,63.1';
const P_STROKE = 8.6;
/** Where the pin's tip sits, as a fraction of the logo size (for ripples and shadows). */
export const PIN_TIP = { x: 60 / LOGO_VIEWBOX, y: 102.5 / LOGO_VIEWBOX };
/** Pin height (top of the circle to the tip), as a fraction of the logo size. */
export const PIN_HEIGHT = (102.5 - (49.3 - 30.85)) / LOGO_VIEWBOX;

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
        <Path d={P_PATH} fill="none" stroke={letterColor} strokeWidth={P_STROKE} strokeLinejoin="round" />
      </G>
    </Svg>
  );
};
