import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Crosshair, EyeOff, ImagePlus, Lock, MapPin, RotateCcw, X } from 'lucide-react-native';
import { DiscoveryLeafletMap } from '../discovery/DiscoveryLeafletMap';
import { nearestPlace } from '../../lib/placeSearch';
import {
  GEOCODE_DEBOUNCE_MS,
  BEACON_DESCRIPTION_WORD_LIMIT,
  clampBeaconDescription,
  countBeaconWords,
  parseBeaconTags,
} from '../../lib/beaconDraft';
import {
  applyDateInput,
  applyTimeInput,
  changeWindowEnd,
  changeWindowStart,
  formatBeaconDate,
  formatBeaconTime,
} from '../../lib/beaconWindow';
import { pickCoverPhoto } from '../../lib/coverPhoto';
import { cleanVenueLabel, pointStatus, type DroppedPoint } from '../../lib/droppedPoint';
import { captureCurrentFix, geocodePlaces } from '../../services/placeGeocoder';
import { lookupPrivacyRegions } from '../../services/regionLookup';
import type { PlaceSuggestion } from '../../types/beacon';
import { WhenChip } from '../discovery/WhenChip';
import { PhotoRulesNote } from '../safety/PhotoRulesNote';
import { tagsToInput } from '../../lib/tagInput';
import { TagPicker } from '../discovery/TagPicker';
import { canonicalizeTags } from '../../lib/hashtags';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * What a host can change after dropping. Visibility and the location-privacy level stay fixed;
 * moving the location re-finds the hidden area (same level) around the new spot.
 */
export type PointDetailEdits = Pick<
  DroppedPoint,
  | 'title'
  | 'description'
  | 'tags'
  | 'coverPhotoUri'
  | 'startsAt'
  | 'endsAt'
  | 'venue'
  | 'latitude'
  | 'longitude'
  | 'locationPrivacy'
>;

interface EditPointDetailsProps {
  point: DroppedPoint;
  onSave: (edits: PointDetailEdits) => void;
  onCancel: () => void;
}

export const EditPointDetails: React.FC<EditPointDetailsProps> = ({ point, onSave, onCancel }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const status = pointStatus(point);
  const [title, setTitle] = useState(point.title);
  // Only listed tags carry over (old spellings map onto the list).
  const [tagsText, setTagsText] = useState(tagsToInput(canonicalizeTags(point.tags)));
  // Same source of hashtag suggestions as the Drop Point sheet.
  const knownBeacons = useDiscoveryStore((state) => {
    const store = state as unknown as { beacons?: unknown[]; events?: unknown[] };
    return store.beacons ?? store.events;
  });
  const [description, setDescription] = useState(point.description);
  const [photoUri, setPhotoUri] = useState<string | null>(point.coverPhotoUri);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [startsAt, setStartsAt] = useState(new Date(point.startsAt));
  const [endsAt, setEndsAt] = useState(new Date(point.endsAt));
  const [error, setError] = useState<string | null>(null);

  // ---- Location ----
  const selfCoordinates = useDiscoveryStore((state) => state.selfCoordinates);
  const originalVenue = cleanVenueLabel(point.venue);
  const [venueText, setVenueText] = useState(originalVenue);
  const [coords, setCoords] = useState({ latitude: point.latitude, longitude: point.longitude });
  const [searching, setSearching] = useState(false);
  const [typing, setTyping] = useState(false); // typed something that isn't a chosen place yet
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [locating, setLocating] = useState(false);
  const [regionName, setRegionName] = useState(point.locationPrivacy?.regionName ?? null);
  const [regionLoading, setRegionLoading] = useState(false);
  const locationMoved = coords.latitude !== point.latitude || coords.longitude !== point.longitude;
  const [mapPicking, setMapPicking] = useState(false);
  const insets = useSafeAreaInsets();

  /** Tap on the full-screen map: snap to a known place nearby, or use the exact spot. */
  const handleMapPick = (latitude: number, longitude: number) => {
    const nearby = nearestPlace(latitude, longitude);
    applyPlace(
      nearby ?? {
        id: `map-${latitude.toFixed(5)}-${longitude.toFixed(5)}`,
        label: 'Selected on map',
        subtitle: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        latitude,
        longitude,
        placeType: 'address',
      },
    );
    setMapPicking(false);
  };

  // Place search while typing (same search as the Drop Point sheet).
  useEffect(() => {
    if (!typing) return;
    const query = venueText.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void geocodePlaces(query)
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
  }, [venueText, typing]);

  const applyPlace = (place: PlaceSuggestion) => {
    setVenueText(cleanVenueLabel(place.label));
    setCoords({ latitude: place.latitude, longitude: place.longitude });
    setSuggestions([]);
    setTyping(false);
    setError(null);
    // Location privacy: find the same kind of area (street / neighborhood / city) around the new spot.
    const level = point.locationPrivacy?.level;
    if (!level) return;
    setRegionLoading(true);
    void lookupPrivacyRegions({ latitude: place.latitude, longitude: place.longitude })
      .then((result) => {
        const match = result.regions.find((region) => region.level === level) ?? result.regions[0];
        setRegionName(match?.name ?? point.locationPrivacy?.regionName ?? null);
      })
      .catch(() => setRegionName(point.locationPrivacy?.regionName ?? null))
      .finally(() => setRegionLoading(false));
  };

  const useCurrentLocation = () => {
    if (locating) return;
    setLocating(true);
    void captureCurrentFix(selfCoordinates)
      .then(applyPlace)
      .finally(() => setLocating(false));
  };

  const resetLocation = () => {
    setVenueText(originalVenue);
    setCoords({ latitude: point.latitude, longitude: point.longitude });
    setRegionName(point.locationPrivacy?.regionName ?? null);
    setSuggestions([]);
    setTyping(false);
    setError(null);
  };

  const startLocked = status !== 'upcoming'; // can't move the start of something already happening
  const endLocked = status === 'past';

  const changePhoto = async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      const photo = await pickCoverPhoto();
      if (photo) setPhotoUri(photo.uri);
    } catch {
      setError('Couldn’t load that photo. Try a different one.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const commitStart = (kind: 'date' | 'time', value: string) => {
    const next = kind === 'date' ? applyDateInput(startsAt, value) : applyTimeInput(startsAt, value);
    if (!next) return;
    const updated = changeWindowStart(startsAt, endsAt, next);
    setStartsAt(updated.startsAt);
    setEndsAt(updated.endsAt);
    setError(null);
  };

  const commitEnd = (kind: 'date' | 'time', value: string) => {
    const next = kind === 'date' ? applyDateInput(endsAt, value) : applyTimeInput(endsAt, value);
    if (!next) return;
    setEndsAt(changeWindowEnd(startsAt, next, kind));
    setError(null);
  };

  const save = () => {
    if (typing && venueText.trim() !== originalVenue) {
      setError('Pick a place from the list, or tap GPS, to change the location.');
      return;
    }
    if (regionLoading) {
      setError('Still finding the hidden area for the new spot. Try again in a moment.');
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Add a title.');
      return;
    }
    const now = Date.now();
    if (endsAt.getTime() <= startsAt.getTime()) {
      setError('End must be after start.');
      return;
    }
    if (!endLocked && endsAt.getTime() <= now) {
      setError('The end time has already passed. Pick a later end.');
      return;
    }
    if (!startLocked && startsAt.getTime() < now - 60 * 1000) {
      setError('Start is in the past. Pick a later start.');
      return;
    }
    onSave({
      title: trimmedTitle,
      description: description.trim(),
      tags: parseBeaconTags(tagsText).map((tag) => tag.replace(/^#+/, '')),
      coverPhotoUri: photoUri,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      venue: locationMoved ? venueText.trim() || 'Dropped Point' : point.venue,
      latitude: coords.latitude,
      longitude: coords.longitude,
      locationPrivacy:
        point.locationPrivacy && regionName
          ? { ...point.locationPrivacy, regionName }
          : point.locationPrivacy,
    });
  };

  const words = countBeaconWords(description);

  return (
    <View style={styles.card} testID="manage-edit">
      <View style={styles.headerRow}>
        <Text style={styles.heading}>EDIT DETAILS</Text>
        <TouchableOpacity onPress={onCancel} accessibilityRole="button" testID="manage-edit-cancel">
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.photoRow}>
        <TouchableOpacity
          onPress={changePhoto}
          disabled={photoBusy}
          style={[styles.photoCircle, photoUri ? styles.photoCircleFilled : null]}
          accessibilityRole="button"
          accessibilityLabel={photoUri ? 'Change cover photo' : 'Add cover photo'}
        >
          {photoBusy ? (
            <ActivityIndicator color={c.accent} />
          ) : photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoImage} />
          ) : (
            <ImagePlus size={20} color={c.accent} strokeWidth={2} />
          )}
        </TouchableOpacity>
        <View style={styles.photoCopy}>
          <Text style={styles.photoHint}>{photoUri ? 'Tap to change the cover photo.' : 'Add a cover photo.'}</Text>
          <PhotoRulesNote />
        </View>
        {photoUri && !photoBusy ? (
          <TouchableOpacity
            onPress={() => setPhotoUri(null)}
            style={styles.photoRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Remove cover photo"
          >
            <X size={15} color={c.textMuted} strokeWidth={2.25} />
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.label}>Title</Text>
      <TextInput
        value={title}
        onChangeText={(value) => {
          setTitle(value);
          setError(null);
        }}
        placeholder="e.g. Boulder Tech & GIS Meetup"
        placeholderTextColor={c.textFaint}
        style={styles.input}
        testID="manage-edit-title"
      />

      <Text style={styles.label}>Tags</Text>
      {/* Picked from the allowed list only (lib/hashtags). */}
      <TagPicker
        value={tagsText}
        onChange={setTagsText}
        mine={point.tags}
        known={knownBeacons}
        label={null}
        testID="manage-edit-tags"
      />

      <View style={styles.labelRow}>
        <Text style={styles.label}>Description</Text>
        <Text style={[styles.count, words >= BEACON_DESCRIPTION_WORD_LIMIT && styles.countFull]}>
          {words} / {BEACON_DESCRIPTION_WORD_LIMIT}
        </Text>
      </View>
      <TextInput
        value={description}
        onChangeText={(value) => setDescription(clampBeaconDescription(value))}
        placeholder="What should people nearby know?"
        placeholderTextColor={c.textFaint}
        multiline
        textAlignVertical="top"
        style={[styles.input, styles.multiline]}
        testID="manage-edit-description"
      />

      <Text style={styles.label}>When</Text>
      <View style={styles.whenRow}>
        <Text style={styles.whenLabel}>Start</Text>
        {startLocked ? (
          <Text style={styles.lockedText}>
            Started {formatBeaconDate(startsAt)}, {formatBeaconTime(startsAt)}
          </Text>
        ) : (
          <View style={styles.chips}>
            <WhenChip
              kind="date"
              date={startsAt}
              minimumDate={new Date()}
              display={formatBeaconDate(startsAt)}
              onCommit={(value) => commitStart('date', value)}
              testID="manage-edit-start-date"
              label="Start date"
            />
            <WhenChip
              kind="time"
              date={startsAt}
              display={formatBeaconTime(startsAt)}
              onCommit={(value) => commitStart('time', value)}
              testID="manage-edit-start-time"
              label="Start time"
            />
          </View>
        )}
      </View>
      <View style={styles.whenRow}>
        <Text style={styles.whenLabel}>End</Text>
        {endLocked ? (
          <Text style={styles.lockedText}>
            Ended {formatBeaconDate(endsAt)}, {formatBeaconTime(endsAt)}
          </Text>
        ) : (
          <View style={styles.chips}>
            <WhenChip
              kind="date"
              date={endsAt}
              minimumDate={startsAt}
              display={formatBeaconDate(endsAt)}
              onCommit={(value) => commitEnd('date', value)}
              testID="manage-edit-end-date"
              label="End date"
            />
            <WhenChip
              kind="time"
              date={endsAt}
              display={formatBeaconTime(endsAt)}
              onCommit={(value) => commitEnd('time', value)}
              testID="manage-edit-end-time"
              label="End time"
            />
          </View>
        )}
      </View>

      <View style={styles.labelRow}>
        <Text style={styles.label}>Location</Text>
        {locationMoved ? (
          <TouchableOpacity onPress={resetLocation} style={styles.resetLink} accessibilityRole="button">
            <RotateCcw size={12} color={c.textMuted} strokeWidth={2.25} />
            <Text style={styles.resetText}>Undo</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={[styles.locationBox, locationMoved && styles.locationBoxMoved]}>
        <View style={styles.locationRow}>
          <MapPin size={16} color={locationMoved ? c.accent : c.textMuted} strokeWidth={2.25} />
          <TextInput
            value={venueText}
            onChangeText={(value) => {
              setVenueText(value);
              setTyping(true);
              setError(null);
            }}
            placeholder="Search a new place or venue"
            placeholderTextColor={c.textFaint}
            style={styles.locationInput}
            testID="manage-edit-location"
          />
          <TouchableOpacity
            onPress={useCurrentLocation}
            disabled={locating}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Use my current location"
            testID="manage-edit-gps"
          >
            {locating ? <ActivityIndicator size="small" color={c.accent} /> : <Crosshair size={18} color={c.accent} strokeWidth={2.25} />}
          </TouchableOpacity>
        </View>
        <Text style={styles.coordsText}>
          {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
          {locationMoved ? '  · moved' : ''}
        </Text>
        <TouchableOpacity
          onPress={() => {
            setSuggestions([]);
            setMapPicking(true);
          }}
          style={styles.mapLink}
          accessibilityRole="button"
          testID="manage-edit-select-on-map"
        >
          <MapPin size={14} color={c.accent} strokeWidth={2.5} />
          <Text style={styles.mapLinkText}>Select on map</Text>
        </TouchableOpacity>
        {searching ? <ActivityIndicator size="small" color={c.accent} style={styles.searchSpinner} /> : null}
        {suggestions.length > 0 ? (
          <View style={styles.suggestionList}>
            {suggestions.slice(0, 5).map((place) => (
              <TouchableOpacity
                key={place.id}
                style={styles.placeRow}
                onPress={() => applyPlace(place)}
                accessibilityRole="button"
                accessibilityLabel={`Move to ${place.label}`}
              >
                <Text style={styles.placeLabel} numberOfLines={1}>
                  {place.label}
                </Text>
                {place.subtitle ? (
                  <Text style={styles.placeSub} numberOfLines={1}>
                    {place.subtitle}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {point.locationPrivacy ? (
          <View style={styles.privacyRow}>
            <EyeOff size={13} color={c.violetSoft} strokeWidth={2.25} />
            <Text style={styles.privacyText}>
              {regionLoading ? 'Finding the hidden area…' : `Others will see: somewhere in ${regionName ?? '…'}`}
            </Text>
          </View>
        ) : null}
      </View>
      {locationMoved && point.invites.length > 0 ? (
        <Text style={styles.moveWarning}>Your invitees will need to know the new place. You can text them after saving.</Text>
      ) : null}

      <Modal visible={mapPicking} animationType="slide" onRequestClose={() => setMapPicking(false)} statusBarTranslucent>
        <View style={styles.mapModal} testID="manage-edit-map">
          <DiscoveryLeafletMap
            center={coords}
            showGeofence={false}
            onMapPick={handleMapPick}
            // Shows a still pin on the Point's current spot (no animation).
            dropAnimation={{ key: 1, latitude: coords.latitude, longitude: coords.longitude, reducedMotion: true }}
          />
          <View style={[styles.mapBar, { top: insets.top + 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mapBarTitle}>Tap the map to move this Point</Text>
              <Text style={styles.mapBarSub}>The pin shows where it is now.</Text>
            </View>
            <TouchableOpacity onPress={() => setMapPicking(false)} accessibilityRole="button" testID="manage-edit-map-cancel">
              <Text style={styles.mapBarCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.fixedNote}>
        <Lock size={13} color={c.textMuted} strokeWidth={2.25} />
        <Text style={styles.fixedText}>
          Visibility and location-privacy level can’t be changed after dropping, so guests aren’t surprised.
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.saveBtn} onPress={save} accessibilityRole="button" testID="manage-edit-save">
        <Text style={styles.saveText}>SAVE CHANGES</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: c.accent,
    padding: 14,
    gap: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  heading: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  cancel: { color: c.textMuted, fontSize: 14, fontWeight: '700' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  photoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.accent,
    backgroundColor: c.base,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoCircleFilled: { borderStyle: 'solid', borderWidth: 2 },
  photoImage: { width: '100%', height: '100%' },
  photoCopy: { flex: 1, gap: 3 },
  photoHint: { color: c.textMuted, fontSize: 12 },
  photoRemove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.border,
  },
  label: { color: c.textMuted, fontSize: 12, fontWeight: '600', marginTop: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { color: c.textFaint, fontSize: 11, fontWeight: '700', marginTop: 4 },
  countFull: { color: c.amber },
  input: {
    backgroundColor: c.base,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  multiline: { minHeight: 72, maxHeight: 120 },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 38 },
  whenLabel: { color: c.textSecondary, fontSize: 14, fontWeight: '500', width: 44 },
  chips: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  lockedText: { flex: 1, color: c.textMuted, fontSize: 13, textAlign: 'right' },
  resetLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  resetText: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
  locationBox: {
    backgroundColor: c.base,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  locationBoxMoved: { borderColor: c.accent },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationInput: { flex: 1, color: c.text, fontSize: 14, paddingVertical: 4 },
  coordsText: { color: c.sky, fontSize: 11, marginLeft: 26 },
  mapLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 26, marginTop: 2 },
  mapLinkText: { color: c.accent, fontSize: 13, fontWeight: '800' },
  mapModal: { flex: 1, backgroundColor: c.mapBase },
  mapBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: c.barGlass,
  },
  mapBarTitle: { color: c.text, fontSize: 14, fontWeight: '800' },
  mapBarSub: { color: c.textMuted, fontSize: 11, marginTop: 1 },
  mapBarCancel: { color: c.accent, fontSize: 14, fontWeight: '800' },
  searchSpinner: { alignSelf: 'flex-start', marginLeft: 26 },
  suggestionList: { borderTopWidth: 1, borderTopColor: c.border, marginTop: 2 },
  placeRow: { paddingVertical: 8, paddingLeft: 26, borderBottomWidth: 1, borderBottomColor: c.divider },
  placeLabel: { color: c.text, fontSize: 13, fontWeight: '700' },
  placeSub: { color: c.textFaint, fontSize: 11, marginTop: 1 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 3, marginTop: 2 },
  privacyText: { flex: 1, color: c.violetSoft, fontSize: 12 },
  moveWarning: { color: c.amber, fontSize: 11, lineHeight: 15 },
  fixedNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  fixedText: { flex: 1, color: c.textMuted, fontSize: 11, lineHeight: 15 },
  error: { color: c.amber, fontSize: 12, fontWeight: '600' },
  saveBtn: {
    marginTop: 6,
    backgroundColor: c.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveText: { color: c.base, fontSize: 13, fontWeight: '900', letterSpacing: 1.1 },
});
