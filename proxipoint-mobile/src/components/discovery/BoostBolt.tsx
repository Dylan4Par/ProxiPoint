import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';

/** Amber pill colors: soft tint in light mode, glow-style in dark mode. */
const COLORS = {
  dark: { bg: 'rgba(245, 158, 11, 0.14)', border: '#b45309', fg: '#fbbf24' },
  light: { bg: '#fef3c7', border: '#f59e0b', fg: '#92400e' },
} as const;

/**
 * The Boost mark: a small amber pill with just a lightning bolt. Used on Point cards and on the
 * Featured Recommendations deck so a boosted Point looks the same everywhere.
 * With onPress it's a button (e.g. "Why am I seeing this?"); without, it's a plain label.
 */
export const BoostBolt: React.FC<{
  onPress?: () => void;
  /** What screen readers say. */
  accessibilityLabel?: string;
  testID?: string;
}> = ({ onPress, accessibilityLabel = 'Boosted', testID }) => {
  const { mode } = useTheme();
  const col = COLORS[mode === 'light' ? 'light' : 'dark'];
  const pill = [styles.pill, { backgroundColor: col.bg, borderColor: col.border }];
  const bolt = <Zap size={11} color={col.fg} fill={col.fg} strokeWidth={2.5} />;
  if (!onPress) {
    return (
      <View style={pill} accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel} testID={testID}>
        {bolt}
      </View>
    );
  }
  return (
    <TouchableOpacity style={pill} onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={accessibilityLabel} testID={testID}>
      {bolt}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // Just the bolt in a small pill, so it fits beside a #tag or the LIVE NOW pill without crowding.
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
  },
});
