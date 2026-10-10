import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PulsingDot } from './PulsingDot';

export const RADAR_EMPTY_MESSAGE = 'Sector clear. Drop a point to signal your network.';

interface Props {
  kicker?: string;
  message?: string;
  compact?: boolean;
}

export const RadarEmptyState: React.FC<Props> = ({
  kicker,
  message = RADAR_EMPTY_MESSAGE,
  compact = false,
}) => {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
      <View style={[styles.stage, compact && styles.stageCompact]}>
        <View style={styles.glow} />
        <View style={[styles.ring, styles.ringOuter]} />
        <View style={[styles.ring, styles.ringMid]} />
        <View style={[styles.ring, styles.ringInner]} />
        <View style={styles.crossH} />
        <View style={styles.crossV} />
        <View style={[styles.tick, styles.tickN]} />
        <View style={[styles.tick, styles.tickE]} />
        <View style={[styles.tick, styles.tickS]} />
        <View style={[styles.tick, styles.tickW]} />
        <View style={[styles.bracket, styles.bracketNw]} />
        <View style={[styles.bracket, styles.bracketNe]} />
        <View style={[styles.bracket, styles.bracketSw]} />
        <View style={[styles.bracket, styles.bracketSe]} />
        <PulsingDot color="#22d3ee" size={compact ? 6 : 7} />
      </View>
      <Text style={[styles.message, compact && styles.messageCompact]}>{message}</Text>
    </View>
  );
};

const STAGE = 148;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 18,
  },
  wrapCompact: {
    paddingVertical: 16,
  },
  kicker: {
    color: '#22d3ee',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 14,
  },
  stage: {
    width: STAGE,
    height: STAGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageCompact: {
    transform: [{ scale: 0.72 }],
    marginVertical: -18,
  },
  glow: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 999,
  },
  ringOuter: {
    width: 132,
    height: 132,
    borderColor: 'rgba(34, 211, 238, 0.55)',
  },
  ringMid: {
    width: 88,
    height: 88,
    borderColor: 'rgba(34, 211, 238, 0.28)',
  },
  ringInner: {
    width: 44,
    height: 44,
    borderColor: 'rgba(34, 211, 238, 0.7)',
  },
  crossH: {
    position: 'absolute',
    width: 132,
    height: 1,
    backgroundColor: 'rgba(34, 211, 238, 0.35)',
  },
  crossV: {
    position: 'absolute',
    width: 1,
    height: 132,
    backgroundColor: 'rgba(34, 211, 238, 0.35)',
  },
  tick: {
    position: 'absolute',
    backgroundColor: '#67e8f9',
  },
  tickN: { width: 1, height: 8, top: 4 },
  tickS: { width: 1, height: 8, bottom: 4 },
  tickE: { width: 8, height: 1, right: 4 },
  tickW: { width: 8, height: 1, left: 4 },
  bracket: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: 'rgba(34, 211, 238, 0.85)',
  },
  bracketNw: {
    top: 0,
    left: 0,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
  },
  bracketNe: {
    top: 0,
    right: 0,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
  },
  bracketSw: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
  },
  bracketSe: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
  },
  message: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 16,
    maxWidth: 280,
  },
  messageCompact: {
    fontSize: 13,
    marginTop: 4,
  },
});
