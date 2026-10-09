import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { createBeaconDraft, formatBroadcastReach, GEOCODE_DEBOUNCE_MS } from '../../lib/beaconDraft';
import {
  BOUNDARY_RADII,
  getRecommendedTier,
  inferPlaceType,
  resolveBoundaryTiers,
} from '../../lib/boundaryTiers';
import { captureCurrentFix, geocodePlaces } from '../../services/placeGeocoder';
import { DiscoveryLeafletMap } from './DiscoveryLeafletMap';
import {
  BEACON_DURATIONS,
  type BeaconDuration,
  type BeaconVisibility,
  type BoundaryTierLevel,
  type PlaceSuggestion,
} from '../../types/beacon';

const NAV_BAR_HEIGHT = 72;

interface DropPointModalProps {
  visible: boolean;
  onClose: () => void;
}

const VISIBILITY_OPTIONS: Array<{ id: BeaconVisibility; label: string; accent: string }> = [
  { id: 'private', label: 'Private', accent: '#f59e0b' },
  { id: 'tag_network', label: '((o)) Tag Net', accent: '#38bdf8' },
  { id: 'public', label: 'Public', accent: '#34d399' },
];

export const DropPointModal: React.FC<DropPointModalProps> = ({ visible, onClose }) => {
  const selfCoordinates = useDiscoveryStore((state) => state.selfCoordinates);
  const dropBeacon = useDiscoveryStore((state) => state.dropBeacon);
  const setPreviewGeofence = useDiscoveryStore((state) => state.setPreviewGeofence);

  const [visibility, setVisibility] = useState<BeaconVisibility>('tag_network');
  const [isLiveNow, setIsLiveNow] = useState(true);
  const [duration, setDuration] = useState<BeaconDuration>('2 hrs');
  const [scheduledStart, setScheduledStart] = useState('18:00');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedTier, setSelectedTier] = useState<BoundaryTierLevel>('micro');
  const [selectedRadiusMeters, setSelectedRadiusMeters] = useState<number>(BOUNDARY_RADII.micro);
  const [placeLabel, setPlaceLabel] = useState('');
  const [placeType, setPlaceType] = useState<string | undefined>(undefined);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const skipSearch = useRef(false);
  const selectedLabel = useRef<string | null>(null);

  const boundaryTiers = useMemo(
    () => resolveBoundaryTiers({ placeName: placeLabel, placeType }),
    [placeLabel, placeType],
  );
  const activeTier = boundaryTiers.find((tier) => tier.id === selectedTier) ?? boundaryTiers[0];

  useEffect(() => {
    if (!visible) return;
    setVisibility('tag_network');
    setIsLiveNow(true);
    setDuration('2 hrs');
    setScheduledStart('18:00');
    setTitle('');
    setTags('');
    setLocationSearch('');
    setCoords(null);
    setSelectedTier('micro');
    setSelectedRadiusMeters(BOUNDARY_RADII.micro);
    setPlaceLabel('');
    setPlaceType(undefined);
    setSuggestions([]);
    setSearching(false);
    setLocating(false);
    setFormError(null);
    skipSearch.current = false;
    selectedLabel.current = null;
    setPreviewGeofence(null);
  }, [visible, setPreviewGeofence]);

  useEffect(() => {
    if (!visible || !coords) {
      setPreviewGeofence(null);
      return;
    }
    setPreviewGeofence({
      latitude: coords.lat,
      longitude: coords.lon,
      radiusMeters: selectedRadiusMeters,
    });
  }, [visible, coords, selectedRadiusMeters, setPreviewGeofence]);

  useEffect(() => {
    if (!visible) return;
    if (skipSearch.current) {
      skipSearch.current = false;
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const trimmed = locationSearch.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void geocodePlaces(trimmed)
        .then((results) => {
          if (!cancelled) setSuggestions(results);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, GEOCODE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [locationSearch, visible]);

  const applyPlace = (place: PlaceSuggestion) => {
    skipSearch.current = true;
    selectedLabel.current = place.label;
    setLocationSearch(place.label);
    setCoords({ lat: place.latitude, lon: place.longitude });
    setSuggestions([]);
    setFormError(null);
    const semantic = inferPlaceType(place.label, place.placeType);
    const tier = getRecommendedTier(semantic);
    setPlaceLabel(place.label);
    setPlaceType(semantic);
    setSelectedTier(tier);
    setSelectedRadiusMeters(BOUNDARY_RADII[tier]);
  };

  const handleUseCurrentLocation = () => {
    if (locating) return;
    setLocating(true);
    setFormError(null);
    void captureCurrentFix(selfCoordinates)
      .then((fix) => {
        applyPlace(fix);
      })
      .finally(() => setLocating(false));
  };

  const handleDropBeacon = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !coords) {
      setFormError(trimmedTitle ? 'Choose a place or tap GPS to set coordinates.' : 'Add a title before dropping this beacon.');
      return;
    }

    dropBeacon(
      createBeaconDraft({
        title: trimmedTitle,
        tags,
        visibility,
        venue: locationSearch.trim() || 'Dropped beacon',
        latitude: coords.lat,
        longitude: coords.lon,
        isLiveNow,
        duration,
        scheduledStart,
        radiusMeters: selectedRadiusMeters,
        tierLevel: selectedTier,
      }),
    );
    onClose();
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.mapBand}>
        <DiscoveryLeafletMap />
      </View>
      <KeyboardAvoidingView
        style={styles.sheetContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
          <View style={styles.pullBar} />
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>DROP BEACON</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close drop beacon">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.visibilityContainer}>
              {VISIBILITY_OPTIONS.map((option) => {
                const active = visibility === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.visibilityTab,
                      active && {
                        backgroundColor: `${option.accent}22`,
                        borderWidth: 1,
                        borderColor: option.accent,
                      },
                    ]}
                    onPress={() => setVisibility(option.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.visibilityText, active && { color: option.accent }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.groupedContainer}>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Title</Text>
                <TextInput
                  placeholder="e.g. Boulder Tech & GIS Meetup"
                  placeholderTextColor="#475569"
                  style={styles.textInput}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>
              <View style={styles.hairline} />
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Tags</Text>
                <TextInput
                  placeholder="#TechMeetup, #PostGIS"
                  placeholderTextColor="#475569"
                  style={styles.textInput}
                  value={tags}
                  onChangeText={setTags}
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View>
              <View style={styles.locationContainer}>
                <View style={styles.locationCopy}>
                  <TextInput
                    placeholder="Search location or venue..."
                    placeholderTextColor="#475569"
                    style={styles.locationInput}
                    value={locationSearch}
                    onChangeText={(value) => {
                      setLocationSearch(value);
                      setFormError(null);
                      if (value !== selectedLabel.current) {
                        selectedLabel.current = null;
                        setCoords(null);
                        setPlaceLabel('');
                        setPlaceType(undefined);
                        setSelectedTier('micro');
                        setSelectedRadiusMeters(BOUNDARY_RADII.micro);
                      }
                    }}
                    autoCorrect={false}
                  />
                  {coords ? (
                    <Text style={styles.coordReadout}>
                      {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={handleUseCurrentLocation}
                  style={styles.targetIconBtn}
                  accessibilityLabel="Use current location"
                  disabled={locating}
                >
                  {locating ? (
                    <ActivityIndicator size="small" color="#38bdf8" />
                  ) : (
                    <Text style={styles.targetIcon}>⌖</Text>
                  )}
                </TouchableOpacity>
              </View>

              {searching && suggestions.length === 0 ? (
                <Text style={styles.searchingText}>Searching places…</Text>
              ) : null}

              {suggestions.length > 0 ? (
                <View style={styles.suggestionList}>
                  {suggestions.map((place) => (
                    <TouchableOpacity
                      key={place.id}
                      style={styles.suggestionRow}
                      onPress={() => applyPlace(place)}
                    >
                      <Text style={styles.suggestionLabel}>{place.label}</Text>
                      <Text style={styles.suggestionSubtitle}>{place.subtitle}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.scaleRailContainer}>
              <View style={styles.scaleRailHeaderRow}>
                <Text style={styles.scaleRailHeading}>BROADCAST PERIMETER</Text>
                <Text style={styles.scaleRailRadiusBadge}>{activeTier.displayRadius}</Text>
              </View>
              <View style={styles.scaleChipsRow}>
                {boundaryTiers.map((tier) => {
                  const isActive = selectedTier === tier.id;
                  return (
                    <TouchableOpacity
                      key={tier.id}
                      style={[styles.scaleChip, isActive && styles.scaleChipActive]}
                      onPress={() => {
                        setSelectedTier(tier.id);
                        setSelectedRadiusMeters(tier.radiusMeters);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[styles.scaleChipText, isActive && styles.scaleChipTextActive]}
                        numberOfLines={1}
                      >
                        {tier.icon} {tier.label}
                      </Text>
                      <Text style={[styles.scaleChipSub, isActive && styles.scaleChipSubActive]}>
                        {tier.displayRadius}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.broadcastSubtext}>
                {formatBroadcastReach(tags, activeTier.displayRadius)}
              </Text>
            </View>

            <View style={styles.groupedContainer}>
              <View style={styles.timeToggleRow}>
                <TouchableOpacity
                  style={[styles.pillToggle, isLiveNow && styles.pillToggleActive]}
                  onPress={() => setIsLiveNow(true)}
                >
                  <Text style={[styles.pillToggleText, isLiveNow && styles.pillToggleTextActive]}>🚀 Live Now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pillToggle, !isLiveNow && styles.pillToggleActive]}
                  onPress={() => setIsLiveNow(false)}
                >
                  <Text style={[styles.pillToggleText, !isLiveNow && styles.pillToggleTextActive]}>📅 Schedule</Text>
                </TouchableOpacity>
              </View>

              {!isLiveNow ? (
                <>
                  <View style={styles.hairline} />
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>Starts</Text>
                    <TextInput
                      placeholder="18:00"
                      placeholderTextColor="#475569"
                      style={styles.textInput}
                      value={scheduledStart}
                      onChangeText={setScheduledStart}
                    />
                  </View>
                </>
              ) : null}

              <View style={styles.hairline} />
              <View style={styles.durationRow}>
                {BEACON_DURATIONS.map((option) => {
                  const active = duration === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.durationChip, active && styles.durationChipActive]}
                      onPress={() => setDuration(option)}
                    >
                      <Text style={[styles.durationText, active && styles.durationTextActive]}>{option}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          <View style={styles.ctaDock}>
            {formError ? <Text style={styles.formError}>{formError}</Text> : null}
            <TouchableOpacity style={styles.primaryDropBtn} onPress={handleDropBeacon} activeOpacity={0.85}>
              <Text style={styles.primaryDropText}>DROP BEACON</Text>
            </TouchableOpacity>
          </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: NAV_BAR_HEIGHT,
    flexDirection: 'column',
    zIndex: 30,
    backgroundColor: '#070b13',
  },
  mapBand: {
    flex: 1,
    minHeight: 160,
    backgroundColor: '#0a1120',
  },
  sheetContainer: {
    backgroundColor: '#090f1d',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: '#1e293b',
    maxHeight: '68%',
    width: '100%',
    paddingHorizontal: 20,
  },
  pullBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 8,
  },
  visibilityContainer: {
    flexDirection: 'row',
    backgroundColor: '#070b13',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 4,
  },
  visibilityTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  visibilityText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  groupedContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  inputLabel: {
    color: '#94a3b8',
    width: 60,
    fontSize: 12,
    fontWeight: '600',
  },
  textInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 13,
    padding: 0,
  },
  hairline: {
    height: 1,
    backgroundColor: '#1e293b',
    marginVertical: 10,
  },
  scaleRailContainer: {
    backgroundColor: '#070b13',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  scaleRailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scaleRailHeading: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  scaleRailRadiusBadge: {
    color: '#06b6d4',
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  scaleChipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  scaleChip: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleChipActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: '#06b6d4',
  },
  scaleChipText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  scaleChipTextActive: {
    color: '#38bdf8',
  },
  scaleChipSub: {
    color: '#475569',
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  scaleChipSubActive: {
    color: '#06b6d4',
    fontWeight: '700',
  },
  broadcastSubtext: {
    color: '#0ea5e9',
    fontSize: 11,
    fontStyle: 'italic',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#0284c7',
    paddingHorizontal: 14,
    minHeight: 48,
    paddingVertical: 8,
  },
  locationCopy: {
    flex: 1,
  },
  locationInput: {
    color: '#f8fafc',
    fontSize: 13,
    padding: 0,
  },
  coordReadout: {
    color: '#38bdf8',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  targetIconBtn: {
    padding: 6,
    minWidth: 32,
    alignItems: 'center',
  },
  targetIcon: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: '700',
  },
  searchingText: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 6,
    marginLeft: 8,
  },
  suggestionList: {
    marginTop: 8,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  suggestionLabel: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
  },
  suggestionSubtitle: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  timeToggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pillToggle: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#070b13',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillToggleActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: '#06b6d4',
  },
  pillToggleText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  pillToggleTextActive: {
    color: '#38bdf8',
  },
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  durationChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#070b13',
    alignItems: 'center',
  },
  durationChipActive: {
    backgroundColor: '#0284c7',
  },
  durationText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  durationTextActive: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  ctaDock: {
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#090f1d',
  },
  formError: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  primaryDropBtn: {
    backgroundColor: '#06b6d4',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  primaryDropText: {
    color: '#070b13',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
});
