import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Check } from 'lucide-react-native';
import { TIME_PRESETS, setTimePreset, setTimeWindow, type TimeWindow } from '../../lib/timeWindow';
import {
  ALL_POST_KINDS,
  DEFAULT_POST_FILTER,
  POST_AGE_CHOICES,
  isDefaultPostFilter,
  setMapPostFilter,
  toggleKind,
  type MapPostFilter,
} from '../../lib/mapFilters';
import { kindInfo } from '../../lib/postKinds';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Explore Map's filters: WHEN for Points (quick presets or Calendar dates), and which channel
 * posts show as bubbles (by kind and how recent). The cards under the map follow the same WHEN.
 */
export const MapFilterSheet: React.FC<{
  visible: boolean;
  window: TimeWindow;
  postFilter: MapPostFilter;
  onClose: () => void;
  /** "Pick dates…": the Calendar (its Show on map sets the dates). */
  onPickDates: () => void;
}> = ({ visible, window, postFilter, onClose, onPickDates }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const anyChanged = window.custom || !isDefaultPostFilter(postFilter);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close filters" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} testID="map-filter-sheet">
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>Map filters</Text>
          {anyChanged ? (
            <TouchableOpacity
              onPress={() => {
                setTimeWindow(null);
                setMapPostFilter(DEFAULT_POST_FILTER);
              }}
              accessibilityRole="button"
              testID="map-filter-reset"
            >
              <Text style={styles.reset}>Reset</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.label}>WHEN · POINTS</Text>
        <View style={styles.chips}>
          {TIME_PRESETS.map((preset) => {
            const active = window.preset === preset.id;
            return (
              <TouchableOpacity
                key={preset.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setTimePreset(preset.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                testID={`map-when-${preset.id}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset.label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.chip, styles.chipRow, window.preset == null && styles.chipActive]}
            onPress={onPickDates}
            accessibilityRole="button"
            testID="map-when-dates"
          >
            <CalendarDays size={13} color={window.preset == null ? c.base : c.accent} strokeWidth={2.5} />
            <Text style={[styles.chipText, window.preset == null && styles.chipTextActive]}>Pick dates…</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, styles.spaced]}>POSTS ON THE MAP</Text>
        <View style={styles.chips}>
          {ALL_POST_KINDS.map((kind) => {
            const active = postFilter.kinds.includes(kind);
            return (
              <TouchableOpacity
                key={kind}
                style={[styles.chip, styles.chipRow, active && styles.chipViolet]}
                onPress={() => setMapPostFilter(toggleKind(postFilter, kind))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                testID={`map-post-kind-${kind}`}
              >
                {active ? <Check size={12} color={c.white} strokeWidth={3} /> : null}
                <Text style={[styles.chipText, active && styles.chipTextViolet]}>{kindInfo(kind).label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {postFilter.kinds.length === 0 ? <Text style={styles.hint}>Post bubbles are hidden.</Text> : null}

        <Text style={[styles.label, styles.spaced]}>POSTED IN THE LAST</Text>
        <View style={styles.chips}>
          {POST_AGE_CHOICES.map((choice) => {
            const active = postFilter.maxAgeHours === choice.hours;
            return (
              <TouchableOpacity
                key={choice.label}
                style={[styles.chip, active && styles.chipViolet]}
                onPress={() => setMapPostFilter({ ...postFilter, maxAgeHours: choice.hours })}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                testID={`map-post-age-${choice.hours ?? 'any'}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextViolet]}>{choice.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>Bubbles come from channels you follow, while their pins last.</Text>

        <TouchableOpacity style={styles.doneBtn} onPress={onClose} accessibilityRole="button" testID="map-filter-done">
          <Text style={styles.doneText}>DONE</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
      backgroundColor: c.sheet,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderTopWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 18,
      paddingTop: 10,
    },
    grabber: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: 12 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    title: { color: c.text, fontSize: 18, fontWeight: '800' },
    reset: { color: c.accent, fontSize: 14, fontWeight: '800' },
    label: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
    spaced: { marginTop: 18 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    chipActive: { backgroundColor: c.accent, borderColor: c.accent },
    chipViolet: { backgroundColor: c.violet, borderColor: c.violet },
    chipText: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
    chipTextActive: { color: c.base },
    chipTextViolet: { color: c.white },
    hint: { color: c.textFaint, fontSize: 12, marginTop: 8 },
    doneBtn: {
      marginTop: 20,
      minHeight: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
    },
    doneText: { color: c.base, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  });
