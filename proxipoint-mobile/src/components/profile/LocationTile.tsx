import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight, Home, Navigation } from 'lucide-react-native';
import { CityPickerSheet } from '../discovery/CityPicker';
import { cityLabel, currentPosition, type CityPlace } from '../../lib/places';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Profile → LOCATION: your home city, and whether Discover follows your GPS.
 * Tracking on: Discover opens where you are and moves with you.
 * Tracking off: Discover opens on your home city (nothing is read from GPS).
 */
export const LocationTile: React.FC<{
  homeCity: CityPlace | null;
  /** Name for the app's default area while no home city is set. */
  defaultAreaLabel: string;
  trackLocation: boolean;
  onChangeHome: (city: CityPlace) => void;
  onChangeTracking: (on: boolean) => void;
}> = ({ homeCity, defaultAreaLabel, trackLocation, onChangeHome, onChangeTracking }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const toggleTracking = async (on: boolean) => {
    setError('');
    if (!on) {
      onChangeTracking(false);
      return;
    }
    // Ask for permission up front so the switch only turns on if it can actually work.
    setChecking(true);
    const fix = await currentPosition();
    setChecking(false);
    if (!fix.ok) {
      setError(
        fix.reason === 'denied'
          ? 'Location is off for ProxiPoint. Allow it in your phone’s settings to follow your location.'
          : 'Couldn’t get your location right now. Try again in a moment.',
      );
      return;
    }
    onChangeTracking(true);
  };

  return (
    <View style={styles.tile} testID="profile-location">
      <TouchableOpacity
        style={styles.row}
        onPress={() => setPicking(true)}
        accessibilityRole="button"
        accessibilityLabel={`Home city: ${homeCity ? cityLabel(homeCity) : defaultAreaLabel}. Change`}
        testID="profile-home-city"
      >
        <Home size={18} color={c.accent} strokeWidth={2.25} />
        <View style={styles.copy}>
          <Text style={styles.label}>Home city</Text>
          <Text style={styles.value} numberOfLines={1}>
            {homeCity ? cityLabel(homeCity) : `${defaultAreaLabel} (default)`}
          </Text>
        </View>
        <ChevronRight size={16} color={c.iconFaint} strokeWidth={2.25} />
      </TouchableOpacity>

      <View style={styles.divider} />

      <View style={styles.row}>
        <Navigation size={18} color={trackLocation ? c.accent : c.textMuted} strokeWidth={2.25} />
        <View style={styles.copy}>
          <Text style={styles.label}>Follow my location</Text>
          <Text style={styles.hint}>
            {trackLocation
              ? 'Discover opens where you are and follows you.'
              : 'Off: Discover opens on your home city.'}
          </Text>
        </View>
        <Switch
          value={trackLocation}
          onValueChange={(on) => void toggleTracking(on)}
          disabled={checking}
          trackColor={{ false: c.borderStrong, true: c.accentTrack }}
          thumbColor={trackLocation ? c.accent : c.textMuted}
          accessibilityLabel="Follow my location"
          testID="profile-track-location"
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <CityPickerSheet
        visible={picking}
        title="Set home city"
        onClose={() => setPicking(false)}
        onPick={(place) => {
          setPicking(false);
          onChangeHome(place);
        }}
      />
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    tile: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 4,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    copy: { flex: 1, gap: 2 },
    label: { color: c.text, fontSize: 14, fontWeight: '700' },
    value: { color: c.accent, fontSize: 13, fontWeight: '700' },
    hint: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    divider: { height: 1, backgroundColor: c.border },
    error: { color: c.amber, fontSize: 12, fontWeight: '600', paddingBottom: 10, lineHeight: 17 },
  });
