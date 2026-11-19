import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Map buttons shared by Explore Map and Create Drop's "Select on map", so both look and sit the
 * same: the round recenter crosshair in the top-right corner, with the + / − stack under it.
 */

/** Gap from the map's top-right corner; the zoom stack sits under the recenter button. */
export const MAP_CONTROL_INSET = 14;
const BUTTON = 38;
const STACK_GAP = 10;

/** Absolute positions for the two controls, from the top of the map's visible area. */
export function mapControlPositions(top = 0) {
  return {
    recenter: { top: top + MAP_CONTROL_INSET, right: MAP_CONTROL_INSET },
    zoom: { top: top + MAP_CONTROL_INSET + BUTTON + STACK_GAP, right: MAP_CONTROL_INSET },
  };
}

export const MapRecenterButton: React.FC<{
  onPress: () => void;
  /** Shows a spinner instead of the crosshair (e.g. while getting a GPS fix). */
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}> = ({ onPress, busy = false, style, accessibilityLabel = 'Center on my location', testID }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.round, style]}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {busy ? (
        <ActivityIndicator size="small" color={c.sky} />
      ) : (
        <View style={styles.crosshairOuter}>
          <View style={styles.crosshairInner} />
          <View style={styles.crosshairLineV} />
          <View style={styles.crosshairLineH} />
        </View>
      )}
    </TouchableOpacity>
  );
};

export const MapZoomStack: React.FC<{
  onZoomIn: () => void;
  onZoomOut: () => void;
  style?: StyleProp<ViewStyle>;
  testIDPrefix?: string;
}> = ({ onZoomIn, onZoomOut, style, testIDPrefix = 'map-zoom' }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.zoomStack, style]}>
      <TouchableOpacity
        style={styles.zoomBtn}
        activeOpacity={0.7}
        onPress={onZoomIn}
        accessibilityRole="button"
        accessibilityLabel="Zoom in"
        testID={`${testIDPrefix}-in`}
      >
        <Text style={styles.zoomText}>+</Text>
      </TouchableOpacity>
      <View style={styles.zoomDivider} />
      <TouchableOpacity
        style={styles.zoomBtn}
        activeOpacity={0.7}
        onPress={onZoomOut}
        accessibilityRole="button"
        accessibilityLabel="Zoom out"
        testID={`${testIDPrefix}-out`}
      >
        <Text style={styles.zoomText}>−</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    round: {
      position: 'absolute',
      width: BUTTON,
      height: BUTTON,
      borderRadius: BUTTON / 2,
      backgroundColor: c.glassStrong,
      borderWidth: 1.5,
      borderColor: 'rgba(56, 189, 248, 0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20,
      elevation: 4,
      shadowColor: c.sky,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
    },
    crosshairOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.sky,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    crosshairInner: { width: 4, height: 4, borderRadius: 2, backgroundColor: c.sky },
    crosshairLineV: { position: 'absolute', width: 2, height: 24, backgroundColor: c.sky, borderRadius: 1 },
    crosshairLineH: { position: 'absolute', width: 24, height: 2, backgroundColor: c.sky, borderRadius: 1 },
    zoomStack: {
      position: 'absolute',
      width: BUTTON,
      borderRadius: BUTTON / 2,
      backgroundColor: c.glassStrong,
      borderWidth: 1.5,
      borderColor: 'rgba(56, 189, 248, 0.4)',
      zIndex: 20,
      overflow: 'hidden',
    },
    zoomBtn: { height: BUTTON, alignItems: 'center', justifyContent: 'center' },
    zoomText: { color: c.sky, fontSize: 20, fontWeight: '700', lineHeight: 22 },
    zoomDivider: { height: 1, marginHorizontal: 8, backgroundColor: 'rgba(56, 189, 248, 0.25)' },
  });
