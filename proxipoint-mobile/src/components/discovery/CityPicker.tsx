import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Clock, Home, MapPin, Navigation, Search, X } from 'lucide-react-native';
import { useKeyboardHeight } from '../common/KeyboardAwareScrollView';
import { cityAt, cityLabel, currentPosition, findCity, suggestCities, type CityPlace } from '../../lib/places';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

export type PickKind = 'gps' | 'home' | 'search';

// Cities you looked at recently (this session).
let recent: CityPlace[] = [];
function remember(place: CityPlace) {
  recent = [place, ...recent.filter((p) => cityLabel(p) !== cityLabel(place))].slice(0, 5);
}

/** Pill on the Discover map: which city you're looking at. Tap to change it. */
export const CityPill: React.FC<{
  label: string;
  /** True when looking at a searched city (not your area / home). */
  exploring: boolean;
  tracking: boolean;
  onPress: () => void;
  /** Back to your own area (only shown while exploring). */
  onReturn: () => void;
  /** In a header row (Explore Map's top bar) instead of floating over the map. */
  inline?: boolean;
}> = ({ label, exploring, tracking, onPress, onReturn, inline = false }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <View style={inline ? styles.pillRowInline : styles.pillRow} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.pill, exploring && styles.pillExploring]}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${exploring ? 'Exploring' : 'Viewing'} ${label}. Change city`}
        testID="discover-city"
      >
        {tracking && !exploring ? (
          <Navigation size={13} color={c.accent} fill={c.accent} strokeWidth={2} />
        ) : (
          <MapPin size={14} color={exploring ? c.violetText : c.accent} strokeWidth={2.5} />
        )}
        <View style={styles.pillCopy}>
          {exploring ? <Text style={styles.pillKicker}>EXPLORING</Text> : null}
          <Text style={styles.pillText} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <ChevronDown size={14} color={c.textMuted} strokeWidth={2.5} />
      </TouchableOpacity>
      {exploring ? (
        <TouchableOpacity
          style={styles.returnBtn}
          onPress={onReturn}
          accessibilityRole="button"
          accessibilityLabel="Back to my area"
          testID="discover-city-return"
        >
          <X size={14} color={c.text} strokeWidth={2.5} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

/** Sheet to pick a city: your location, home, recent, built-in suggestions, or any typed city. */
export const CityPickerSheet: React.FC<{
  visible: boolean;
  title: string;
  /** Shown as a shortcut (view mode). */
  home?: CityPlace | null;
  onPick: (place: CityPlace, kind: PickKind) => void;
  onClose: () => void;
}> = ({ visible, title, home = null, onPick, onClose }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  // Android: lift the sheet above the keyboard (iOS uses KeyboardAvoidingView).
  const keyboardHeight = useKeyboardHeight();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'gps' | 'search' | null>(null);
  const [error, setError] = useState('');

  const close = () => {
    setQuery('');
    setError('');
    setBusy(null);
    onClose();
  };

  const pick = (place: CityPlace, kind: PickKind) => {
    if (kind === 'search') remember(place);
    setQuery('');
    setError('');
    setBusy(null);
    onPick(place, kind);
  };

  const useMyLocation = async () => {
    setBusy('gps');
    setError('');
    const fix = await currentPosition();
    if (!fix.ok) {
      setBusy(null);
      setError(
        fix.reason === 'denied'
          ? 'Location is off for ProxiPoint. Allow it in your phone’s settings.'
          : 'Couldn’t get your location right now.',
      );
      return;
    }
    const named = await cityAt(fix.latitude, fix.longitude);
    pick(named ?? { name: 'Your location', latitude: fix.latitude, longitude: fix.longitude }, 'gps');
  };

  const search = async () => {
    const text = query.trim();
    if (!text) return;
    const quick = suggestCities(text, 1)[0];
    if (quick && quick.name.toLowerCase() === text.toLowerCase().replace(/,.*$/, '')) {
      pick(quick, 'search');
      return;
    }
    setBusy('search');
    setError('');
    const found = await findCity(text);
    if (found) pick(found, 'search');
    else {
      setBusy(null);
      setError(`Couldn’t find “${text}”. Try adding the state, e.g. “Moab, UT”.`);
    }
  };

  const suggestions = suggestCities(query);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + 16 },
              Platform.OS === 'android' && keyboardHeight ? { marginBottom: keyboardHeight, maxHeight: '60%' } : null,
            ]}
            testID="city-picker"
          >
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={close} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
                <X size={18} color={c.textMuted} strokeWidth={2.25} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchRow}>
              <Search size={16} color={c.textMuted} strokeWidth={2.25} />
              <TextInput
                value={query}
                onChangeText={(text) => {
                  setQuery(text);
                  setError('');
                }}
                onSubmitEditing={search}
                placeholder="Type a city, e.g. Denver"
                placeholderTextColor={c.textFaint}
                autoCorrect={false}
                returnKeyType="search"
                style={styles.input}
                testID="city-search"
              />
              {busy === 'search' ? <ActivityIndicator color={c.accent} /> : null}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {query.trim() ? (
                <>
                  {suggestions.map((place) => (
                    <Row key={cityLabel(place)} Icon={MapPin} label={cityLabel(place)} onPress={() => pick(place, 'search')} />
                  ))}
                  <Row
                    Icon={Search}
                    label={`Search for “${query.trim()}”`}
                    hint="Any city or town"
                    onPress={search}
                    accent
                  />
                </>
              ) : (
                <>
                  <Row
                    Icon={Navigation}
                    label="Use my current location"
                    hint="Uses your phone’s GPS"
                    onPress={useMyLocation}
                    busy={busy === 'gps'}
                    accent
                  />
                  {home ? (
                    <Row Icon={Home} label={`Home · ${cityLabel(home)}`} onPress={() => pick(home, 'home')} />
                  ) : null}
                  {recent.length ? <Text style={styles.label}>RECENT</Text> : null}
                  {recent.map((place) => (
                    <Row key={cityLabel(place)} Icon={Clock} label={cityLabel(place)} onPress={() => pick(place, 'search')} />
                  ))}
                  <Text style={styles.label}>POPULAR</Text>
                  {['Denver', 'Boulder', 'Fort Collins', 'Colorado Springs', 'Austin', 'Seattle']
                    .map((name) => suggestCities(name, 1)[0])
                    .filter(Boolean)
                    .map((place) => (
                      <Row key={cityLabel(place)} Icon={MapPin} label={cityLabel(place)} onPress={() => pick(place, 'search')} />
                    ))}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const Row: React.FC<{
  Icon: typeof MapPin;
  label: string;
  hint?: string;
  onPress: () => void;
  busy?: boolean;
  accent?: boolean;
}> = ({ Icon, label, hint, onPress, busy = false, accent = false }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={busy} accessibilityRole="button">
      <Icon size={17} color={accent ? c.accent : c.textSecondary} strokeWidth={2.25} />
      <View style={styles.rowCopy}>
        <Text style={[styles.rowText, accent && styles.rowTextAccent]} numberOfLines={1}>
          {label}
        </Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {busy ? <ActivityIndicator color={c.accent} /> : null}
    </TouchableOpacity>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    pillRow: { position: 'absolute', top: 14, left: 14, right: 70, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 15 },
    pillRowInline: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
    pillCopy: { flexShrink: 1, minWidth: 0 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      maxWidth: '100%',
      flexShrink: 1,
      paddingHorizontal: 12,
      minHeight: 38,
      borderRadius: 19,
      backgroundColor: c.glassStrong,
      borderWidth: 1.5,
      borderColor: 'rgba(56, 189, 248, 0.4)',
    },
    pillExploring: { borderColor: c.violetSoft },
    pillKicker: { color: c.violetText, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginBottom: -1 },
    pillText: { color: c.text, fontSize: 13, fontWeight: '800', flexShrink: 1 },
    returnBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.glassStrong,
      borderWidth: 1,
      borderColor: c.border,
    },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 6, 23, 0.65)' },
    sheet: {
      maxHeight: '85%',
      backgroundColor: c.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 16,
      paddingTop: 10,
    },
    handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: 'center', marginBottom: 8 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    title: { color: c.text, fontSize: 18, fontWeight: '800' },
    closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.base,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
    },
    input: { flex: 1, color: c.text, fontSize: 15, paddingVertical: 11 },
    error: { color: c.amber, fontSize: 12, fontWeight: '600', marginTop: 8 },
    list: { marginTop: 6 },
    label: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 14, marginBottom: 2 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowCopy: { flex: 1, gap: 1 },
    rowText: { color: c.text, fontSize: 15, fontWeight: '600' },
    rowTextAccent: { color: c.accent, fontWeight: '800' },
    rowHint: { color: c.textMuted, fontSize: 12 },
  });
