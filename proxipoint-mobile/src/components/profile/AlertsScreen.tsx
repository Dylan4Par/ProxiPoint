import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronDown, Zap } from 'lucide-react-native';
import {
  CHANNEL_ALERT_OPTIONS,
  VENUE_ALERT_OPTIONS,
  alertRadiusOptions,
  formatHour,
  radiusLabel,
} from '../../lib/alertPrefs';
import { clearActivity, markAllActivityRead, timeAgo, useActivity } from '../../lib/activity';
import { useBoosts } from '../../lib/boost';
import { useUnits } from '../../lib/units';
import { useAlertPrefs } from '../../hooks/useAlertPrefs';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Profile → Notifications & Proximity Alerts: proximity push alerts (radius), your followed
 * interests, channel and venue alerts, quiet hours, and a log of recent alerts.
 */
export const AlertsScreen: React.FC<{
  interestTags: string[];
  /** Edit → the Followed Tags tile on Profile. */
  onEditTags: () => void;
  /** A logged alert: show its Point. */
  onOpenPoint: (id: string) => void;
}> = ({ interestTags, onEditTags, onOpenPoint }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const units = useUnits();
  const now = useBoosts(); // ticks, so "2h ago" stays current
  const [prefs, update] = useAlertPrefs();
  const items = useActivity();
  React.useEffect(() => {
    markAllActivityRead();
  }, [items.length]);

  const [picker, setPicker] = useState<null | 'radius' | 'channels' | 'venues' | 'quietStart' | 'quietEnd'>(null);
  const hours = Array.from({ length: 24 }, (_, h) => ({ id: h, label: formatHour(h) }));
  const pickerConfig =
    picker === 'radius'
      ? {
          title: 'Alert radius',
          options: alertRadiusOptions(units).map((o) => ({ id: o.meters, label: o.label })),
          value: alertRadiusOptions(units).find((o) => o.label === radiusLabel(prefs.radiusMeters, units))?.meters,
          onPick: (id: number | string) => update({ radiusMeters: id as number }),
        }
      : picker === 'channels'
        ? { title: 'Joined channels', options: CHANNEL_ALERT_OPTIONS, value: prefs.joinedChannels, onPick: (id: number | string) => update({ joinedChannels: id as never }) }
        : picker === 'venues'
          ? { title: 'Claimed / saved venues', options: VENUE_ALERT_OPTIONS, value: prefs.venues, onPick: (id: number | string) => update({ venues: id as never }) }
          : picker === 'quietStart'
            ? { title: 'Mute from', options: hours, value: prefs.quietStart, onPick: (id: number | string) => update({ quietStart: id as number }) }
            : picker === 'quietEnd'
              ? { title: 'Mute until', options: hours, value: prefs.quietEnd, onPick: (id: number | string) => update({ quietEnd: id as number }) }
              : null;

  const Select: React.FC<{ label: string; which: NonNullable<typeof picker>; testID: string; disabled?: boolean }> = ({
    label,
    which,
    testID,
    disabled,
  }) => (
    <TouchableOpacity
      style={[styles.select, disabled && styles.disabled]}
      onPress={() => setPicker(which)}
      disabled={disabled}
      accessibilityRole="button"
      testID={testID}
    >
      <Text style={styles.selectText}>{label}</Text>
      <ChevronDown size={14} color={c.accent} strokeWidth={2.5} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} testID="alerts-screen">
        {/* Proximity push alerts */}
        <Text style={[styles.section, styles.sectionFirst]}>PROXIMITY PUSH ALERTS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowText}>Notify when followed interests go live near me</Text>
            <Switch
              value={prefs.proximityOn}
              onValueChange={(on) => update({ proximityOn: on })}
              trackColor={{ false: c.borderStrong, true: c.accentTrack }}
              thumbColor={prefs.proximityOn ? c.accent : c.textMuted}
              accessibilityLabel="Proximity push alerts"
              testID="alerts-proximity"
            />
          </View>
          <View style={[styles.row, styles.divider]}>
            <Text style={styles.rowLabel}>Alert Radius</Text>
            <Select
              label={radiusLabel(prefs.radiusMeters, units)}
              which="radius"
              testID="alerts-radius"
              disabled={!prefs.proximityOn}
            />
          </View>
        </View>

        {/* Followed interests */}
        <View style={styles.sectionRow}>
          <Text style={[styles.section, styles.sectionInline]}>FOLLOWED INTERESTS ({interestTags.length})</Text>
          <TouchableOpacity onPress={onEditTags} hitSlop={10} accessibilityRole="button" testID="alerts-edit-tags">
            <Text style={styles.edit}>Edit</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {interestTags.length ? (
            <View style={styles.chips}>
              {interestTags.map((tag) => (
                <View key={tag} style={styles.chip}>
                  <Text style={styles.chipText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>No followed #tags yet. Tap Edit to add some.</Text>
          )}
        </View>

        {/* Channels & venues */}
        <Text style={styles.section}>CHANNELS & VENUES</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Joined Channels</Text>
            <Select
              label={CHANNEL_ALERT_OPTIONS.find((o) => o.id === prefs.joinedChannels)?.label ?? ''}
              which="channels"
              testID="alerts-channels"
            />
          </View>
          <View style={[styles.row, styles.divider]}>
            <Text style={styles.rowLabel}>Claimed / Saved Venues</Text>
            <Select
              label={VENUE_ALERT_OPTIONS.find((o) => o.id === prefs.venues)?.label ?? ''}
              which="venues"
              testID="alerts-venues"
            />
          </View>
        </View>

        {/* Quiet hours */}
        <Text style={styles.section}>QUIET HOURS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowText}>
              Mute alerts between {formatHour(prefs.quietStart)} – {formatHour(prefs.quietEnd)}
            </Text>
            <Switch
              value={prefs.quietOn}
              onValueChange={(on) => update({ quietOn: on })}
              trackColor={{ false: c.borderStrong, true: c.accentTrack }}
              thumbColor={prefs.quietOn ? c.accent : c.textMuted}
              accessibilityLabel="Quiet hours"
              testID="alerts-quiet"
            />
          </View>
          <View style={[styles.row, styles.divider]}>
            <Text style={styles.rowLabel}>From</Text>
            <Select label={formatHour(prefs.quietStart)} which="quietStart" testID="alerts-quiet-start" disabled={!prefs.quietOn} />
            <Text style={styles.rowLabel}>to</Text>
            <Select label={formatHour(prefs.quietEnd)} which="quietEnd" testID="alerts-quiet-end" disabled={!prefs.quietOn} />
          </View>
        </View>

        {/* Recent alerts log */}
        <View style={styles.logHead}>
          <Text style={[styles.section, styles.sectionInline]}>RECENT ALERTS LOG</Text>
        </View>
        <View style={styles.card}>
          {items.length ? (
            items.slice(0, 20).map((item, i) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.logRow, i > 0 && styles.divider]}
                onPress={() => onOpenPoint(item.pointId)}
                accessibilityRole="button"
                testID={`alerts-log-${item.id}`}
              >
                {item.kind === 'boost' ? (
                  <Zap size={12} color="#f59e0b" fill="#f59e0b" strokeWidth={2} />
                ) : (
                  <View style={styles.bullet} />
                )}
                <Text style={styles.logText} numberOfLines={2}>
                  <Text style={styles.logStrong}>{item.title}</Text>
                  {item.body ? ` · ${item.body}` : ''}
                  <Text style={styles.logTime}> ({timeAgo(item.createdAt, now)})</Text>
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.muted}>No alerts yet.</Text>
          )}
          {items.length ? (
            <TouchableOpacity style={styles.clearBtn} onPress={clearActivity} accessibilityRole="button" testID="alerts-clear">
              <Text style={styles.clearText}>Clear History</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      {/* Dropdown options */}
      <Modal visible={pickerConfig != null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>{pickerConfig?.title}</Text>
            <ScrollView style={styles.sheetList}>
              {pickerConfig?.options.map((option) => {
                const on = option.id === pickerConfig.value;
                return (
                  <TouchableOpacity
                    key={String(option.id)}
                    style={styles.option}
                    onPress={() => {
                      pickerConfig.onPick(option.id);
                      setPicker(null);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.optionText, on && styles.optionTextOn]}>{option.label}</Text>
                    {on ? <Check size={16} color={c.accent} strokeWidth={3} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.base },
    content: { paddingHorizontal: 16, paddingBottom: 32 },
    sectionFirst: { marginTop: 6 },
    section: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 18, marginBottom: 8 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 },
    sectionInline: { marginTop: 0, marginBottom: 0 },
    edit: { color: c.accent, fontSize: 13, fontWeight: '800' },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    rowText: { flex: 1, color: c.text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
    rowLabel: { color: c.textSecondary, fontSize: 14, fontWeight: '600', flexShrink: 1 },
    select: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.accentBorder,
      backgroundColor: c.accentWash,
    },
    selectText: { color: c.accent, fontSize: 13, fontWeight: '800' },
    disabled: { opacity: 0.45 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: c.accentTint, borderWidth: 1, borderColor: c.accentBorder },
    chipText: { color: c.accent, fontSize: 13, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 13, paddingVertical: 12 },
    logHead: { marginTop: 18, marginBottom: 8 },
    logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
    bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent, marginTop: 6 },
    logText: { flex: 1, color: c.textSecondary, fontSize: 13, lineHeight: 18 },
    logStrong: { color: c.text, fontWeight: '700' },
    logTime: { color: c.textFaint },
    clearBtn: {
      alignSelf: 'flex-start',
      marginVertical: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    clearText: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
    backdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.5)', justifyContent: 'center', padding: 28 },
    sheet: { backgroundColor: c.sheet, borderRadius: 18, padding: 16, maxHeight: '70%' },
    sheetTitle: { color: c.text, fontSize: 16, fontWeight: '800', marginBottom: 8 },
    sheetList: { flexGrow: 0 },
    option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
    optionText: { color: c.textSecondary, fontSize: 15, fontWeight: '600' },
    optionTextOn: { color: c.accent, fontWeight: '800' },
  });
