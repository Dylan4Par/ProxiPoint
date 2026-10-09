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
import { Building2, Calendar, Crosshair, Landmark, MapPin, Rocket, UserPlus } from 'lucide-react-native';
import {
  LINKED_FACEBOOK_ACCOUNTS,
  addPhoneInvite,
  addProxiPointInvite,
  removeInvite,
  toggleFacebookInvite,
  type BeaconInvite,
  type InviteKind,
} from '../../lib/beaconInvite';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import {
  BEACON_DESCRIPTION_WORD_LIMIT,
  clampBeaconDescription,
  countBeaconWords,
  createBeaconDraft,
  formatBroadcastReach,
  GEOCODE_DEBOUNCE_MS,
  parseBeaconTags,
  toBeaconCreatePayload,
} from '../../lib/beaconDraft';
import { BeaconApiError, postBeacon } from '../../services/beaconApi';
import {
  BOUNDARY_RADII,
  getRecommendedTier,
  inferPlaceType,
  resolveBoundaryTiers,
} from '../../lib/boundaryTiers';
import { captureCurrentFix, geocodePlaces } from '../../services/placeGeocoder';
import { nearestPlace } from '../../lib/placeSearch';
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
  { id: 'tag_network', label: '((o)) Tag Net', accent: '#22d3ee' },
  { id: 'public', label: 'Public', accent: '#34d399' },
];

function TierGlyph({ id, active }: { id: BoundaryTierLevel; active: boolean }) {
  const color = active ? '#f8fafc' : '#94a3b8';
  const props = { size: 14, color, strokeWidth: 2.25 };
  if (id === 'micro') return <MapPin {...props} />;
  if (id === 'neighborhood') return <Building2 {...props} />;
  return <Landmark {...props} />;
}

export const DropPointModal: React.FC<DropPointModalProps> = ({ visible, onClose }) => {
  const selfCoordinates = useDiscoveryStore((state) => state.selfCoordinates);
  const dropBeacon = useDiscoveryStore((state) => state.dropBeacon);
  const adoptPersistedBeacon = useDiscoveryStore((state) => state.adoptPersistedBeacon);
  const setPreviewGeofence = useDiscoveryStore((state) => state.setPreviewGeofence);

  const [visibility, setVisibility] = useState<BeaconVisibility>('tag_network');
  const [isLiveNow, setIsLiveNow] = useState(true);
  const [duration, setDuration] = useState<BeaconDuration>('2 hrs');
  const [scheduledStart, setScheduledStart] = useState('18:00');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
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
  const [submitting, setSubmitting] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [invites, setInvites] = useState<BeaconInvite[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteKind, setInviteKind] = useState<InviteKind>('facebook');
  const [handleInput, setHandleInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [mapPicking, setMapPicking] = useState(false);
  const [perimeterOn, setPerimeterOn] = useState(false);
  const skipSearch = useRef(false);
  const selectedLabel = useRef<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const boundaryTiers = useMemo(
    () => resolveBoundaryTiers({ placeName: placeLabel, placeType }),
    [placeLabel, placeType],
  );
  const activeTier = boundaryTiers.find((tier) => tier.id === selectedTier) ?? boundaryTiers[0];

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    setVisibility('tag_network');
    setIsLiveNow(true);
    setDuration('2 hrs');
    setScheduledStart('18:00');
    setTitle('');
    setDescription('');
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
    setSubmitting(false);
    setRevealing(false);
    setInvites([]);
    setInviteOpen(false);
    setInviteKind('facebook');
    setHandleInput('');
    setPhoneInput('');
    setInviteError('');
    setMapPicking(false);
    setPerimeterOn(false);
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

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setRevealing(true);
    closeTimer.current = setTimeout(() => onClose(), 700);
  };

  const handleDropBeacon = () => {
    if (submitting) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !coords) {
      setFormError(trimmedTitle ? 'Choose a place or tap GPS to set coordinates.' : 'Add a title before dropping this beacon.');
      return;
    }

    const draft = createBeaconDraft({
      title: trimmedTitle,
      description,
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
    });

    setSubmitting(true);
    setFormError(null);
    void postBeacon(toBeaconCreatePayload(draft))
      .then((saved) => {
        adoptPersistedBeacon(saved, draft);
        scheduleClose();
      })
      .catch((error: unknown) => {
        if (error instanceof BeaconApiError && error.status >= 400 && error.status < 500) {
          setFormError('The beacon service rejected this drop. Check the title and place, then try again.');
          setSubmitting(false);
          return;
        }
        dropBeacon(draft);
        scheduleClose();
      });
  };

  if (!visible) return null;

  const titleAndTagsComplete = title.trim().length > 0 && parseBeaconTags(tags).length > 0;
  const sheetCovered = revealing || mapPicking;

  return (
    <View style={styles.overlay} testID="drop-beacon-sheet">
      <View style={styles.mapBand} testID="drop-beacon-map" pointerEvents={sheetCovered ? 'auto' : 'none'}>
        <DiscoveryLeafletMap onMapPick={mapPicking ? handleMapPick : undefined} />
      </View>
      {mapPicking ? (
        <View style={styles.mapPickBar} testID="map-pick-bar">
          <Text style={styles.mapPickHint}>Tap the map to set the location</Text>
          <TouchableOpacity onPress={() => setMapPicking(false)} testID="map-pick-cancel" accessibilityRole="button">
            <Text style={styles.mapPickCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <KeyboardAvoidingView
        style={[styles.sheetContainer, sheetCovered && styles.sheetHidden]}
        pointerEvents={sheetCovered ? 'none' : 'auto'}
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
                    testID={`drop-visibility-${option.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.visibilityText, active && styles.visibilityTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.groupedContainer, titleAndTagsComplete && styles.fieldGlow]} testID="drop-details">
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Title</Text>
                <TextInput
                  placeholder="e.g. Boulder Tech & GIS Meetup"
                  placeholderTextColor="#64748b"
                  style={styles.textInput}
                  value={title}
                  onChangeText={setTitle}
                  testID="drop-title"
                />
              </View>
              <View style={styles.hairline} />
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Tags</Text>
                <TextInput
                  placeholder="#TechMeetup, #PostGIS"
                  placeholderTextColor="#64748b"
                  style={styles.textInput}
                  value={tags}
                  onChangeText={setTags}
                  autoCapitalize="none"
                  testID="drop-tags"
                />
              </View>
              <View style={styles.hairline} />
              <View style={styles.descriptionBlock}>
                <View style={styles.descriptionHeader}>
                  <Text style={styles.descriptionLabel}>Description</Text>
                  <Text
                    style={[
                      styles.wordCount,
                      countBeaconWords(description) >= BEACON_DESCRIPTION_WORD_LIMIT && styles.wordCountFull,
                    ]}
                    testID="drop-description-count"
                  >
                    {countBeaconWords(description)} / {BEACON_DESCRIPTION_WORD_LIMIT}
                  </Text>
                </View>
                <TextInput
                  placeholder="What should people nearby know?"
                  placeholderTextColor="#64748b"
                  style={styles.descriptionInput}
                  value={description}
                  onChangeText={(value) => setDescription(clampBeaconDescription(value))}
                  multiline
                  textAlignVertical="top"
                  testID="drop-description"
                />
              </View>
            </View>

            <View style={styles.locationBlock}>
              <View style={[styles.locationContainer, coords && styles.fieldGlow]}>
                <View style={styles.locationCopy}>
                  <TextInput
                    placeholder="Search location or venue..."
                    placeholderTextColor="#64748b"
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
                    testID="drop-place"
                  />
                  {coords ? (
                    <>
                      <View style={styles.locationDivider} />
                      <Text style={styles.coordReadout} testID="drop-coordinates">
                        {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
                      </Text>
                    </>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => {
                      setSuggestions([]);
                      setMapPicking(true);
                    }}
                    style={styles.mapPickBtn}
                    testID="drop-select-on-map"
                    accessibilityRole="button"
                  >
                    <MapPin size={14} color="#22d3ee" strokeWidth={2.25} />
                    <Text style={styles.mapPickBtnText}>Select on map</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={handleUseCurrentLocation}
                  style={styles.targetIconBtn}
                  accessibilityLabel="Use current location"
                  disabled={locating}
                  testID="drop-gps"
                >
                  {locating ? (
                    <ActivityIndicator size="small" color="#22d3ee" />
                  ) : (
                    <Crosshair size={20} color="#22d3ee" strokeWidth={2} />
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
                      testID={`drop-place-option-${place.id}`}
                    >
                      <Text style={styles.suggestionLabel}>{place.label}</Text>
                      <Text style={styles.suggestionSubtitle}>{place.subtitle}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={[styles.scaleRailContainer, perimeterOn && styles.fieldGlow]} testID="drop-perimeter">
              <View style={styles.scaleRailHeaderRow}>
                <Text style={styles.scaleRailHeading}>BROADCAST PERIMETER</Text>
                <View style={styles.perimeterControls}>
                  {perimeterOn ? <Text style={styles.scaleRailRadiusBadge}>{activeTier.displayRadius}</Text> : null}
                  <TouchableOpacity
                    onPress={() => setPerimeterOn((on) => !on)}
                    style={[styles.perimeterToggle, perimeterOn ? styles.perimeterToggleOn : styles.perimeterToggleOff]}
                    testID="drop-perimeter-toggle"
                    accessibilityRole="switch"
                    accessibilityLabel="Broadcast perimeter"
                    accessibilityState={{ checked: perimeterOn }}
                  >
                    <View style={[styles.perimeterThumb, perimeterOn && styles.perimeterThumbOn]} />
                  </TouchableOpacity>
                </View>
              </View>
              {perimeterOn ? (
              <View testID="drop-perimeter-body">
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
                      testID={`drop-tier-${tier.id}`}
                    >
                      <View style={styles.scaleChipLabel}>
                        <TierGlyph id={tier.id} active={isActive} />
                        <Text
                          style={[styles.scaleChipText, isActive && styles.scaleChipTextActive]}
                          numberOfLines={1}
                        >
                          {tier.label}
                        </Text>
                      </View>
                      <Text style={[styles.scaleChipSub, isActive && styles.scaleChipSubActive]}>
                        {tier.displayRadius}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.broadcastSubtext} testID="drop-broadcast">
                {formatBroadcastReach(tags, activeTier.displayRadius)}
              </Text>
              </View>
              ) : null}
            </View>

            <View style={styles.groupedContainer}>
              <View style={styles.timeToggleRow}>
                <TouchableOpacity
                  style={[styles.pillToggle, isLiveNow && styles.pillToggleActive]}
                  onPress={() => setIsLiveNow(true)}
                  testID="drop-live"
                >
                  <Rocket size={14} color={isLiveNow ? '#22d3ee' : '#64748b'} strokeWidth={2.25} />
                  <Text style={[styles.pillToggleText, isLiveNow && styles.pillToggleTextActive]}>Live Now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pillToggle, !isLiveNow && styles.pillToggleActive]}
                  onPress={() => setIsLiveNow(false)}
                  testID="drop-schedule"
                >
                  <Calendar size={14} color={!isLiveNow ? '#22d3ee' : '#64748b'} strokeWidth={2.25} />
                  <Text style={[styles.pillToggleText, !isLiveNow && styles.pillToggleTextActive]}>Schedule</Text>
                </TouchableOpacity>
              </View>

              {!isLiveNow ? (
                <>
                  <View style={styles.hairline} />
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>Starts</Text>
                    <TextInput
                      placeholder="18:00"
                      placeholderTextColor="#64748b"
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
                      testID={`drop-duration-${option.replace(/\s+/g, '-')}`}
                    >
                      <Text style={[styles.durationText, active && styles.durationTextActive]}>{option}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={styles.inviteBlock}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ expanded: inviteOpen }}
                testID="invite-button"
                style={styles.inviteBtn}
                onPress={() => {
                  setInviteOpen((openPanel) => !openPanel);
                  setInviteError('');
                }}
              >
                <UserPlus size={16} color="#22d3ee" strokeWidth={2.25} />
                <Text style={styles.inviteBtnText}>
                  {invites.length > 0 ? `Invite · ${invites.length}` : 'Invite'}
                </Text>
              </TouchableOpacity>

              {invites.length > 0 ? (
                <View style={styles.inviteChips}>
                  {invites.map((invite) => (
                    <View key={`${invite.kind}-${invite.id}`} style={styles.inviteChip}>
                      <Text style={styles.inviteChipText}>{invite.label}</Text>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${invite.label}`}
                        onPress={() => setInvites((current) => removeInvite(current, invite.id))}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.inviteChipRemove}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}

              {inviteOpen ? (
                <View style={styles.invitePanel} testID="invite-panel">
                  <Text style={styles.inviteHeading}>INVITE BY</Text>
                  <View style={styles.inviteKinds}>
                    {(
                      [
                        ['facebook', 'Facebook'],
                        ['proxipoint', 'ProxiPoint'],
                        ['phone', 'Phone'],
                      ] as const
                    ).map(([kind, label]) => {
                      const selected = inviteKind === kind;
                      return (
                        <TouchableOpacity
                          key={kind}
                          testID={`invite-kind-${kind}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          style={[styles.inviteKind, selected && styles.inviteKindSelected]}
                          onPress={() => {
                            setInviteKind(kind);
                            setInviteError('');
                          }}
                        >
                          <Text style={[styles.inviteKindText, selected && styles.inviteKindTextSelected]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {inviteKind === 'facebook' ? (
                    <View style={styles.inviteList}>
                      {LINKED_FACEBOOK_ACCOUNTS.map((account) => {
                        const selected = invites.some((invite) => invite.kind === 'facebook' && invite.id === account.id);
                        return (
                          <TouchableOpacity
                            key={account.id}
                            testID={`invite-facebook-${account.id}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            style={[styles.inviteRow, selected && styles.inviteRowSelected]}
                            onPress={() => {
                              const next = toggleFacebookInvite(invites, account.id);
                              setInvites(next.invites);
                              setInviteError(next.error);
                            }}
                          >
                            <Text style={styles.inviteRowText}>{account.label}</Text>
                            <Text style={styles.inviteRowMeta}>{selected ? 'Invited' : 'Linked'}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}

                  {inviteKind === 'proxipoint' ? (
                    <View style={styles.inviteEntry}>
                      <TextInput
                        testID="invite-handle-input"
                        value={handleInput}
                        onChangeText={setHandleInput}
                        onSubmitEditing={() => {
                          const next = addProxiPointInvite(invites, handleInput);
                          setInvites(next.invites);
                          setInviteError(next.error);
                          if (!next.error) setHandleInput('');
                        }}
                        placeholder="@ranger-7"
                        placeholderTextColor="#64748b"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.inviteInput}
                      />
                      <TouchableOpacity
                        accessibilityRole="button"
                        style={styles.inviteAddBtn}
                        onPress={() => {
                          const next = addProxiPointInvite(invites, handleInput);
                          setInvites(next.invites);
                          setInviteError(next.error);
                          if (!next.error) setHandleInput('');
                        }}
                      >
                        <Text style={styles.inviteAddText}>Add</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {inviteKind === 'phone' ? (
                    <View style={styles.inviteEntry}>
                      <TextInput
                        testID="invite-phone-input"
                        value={phoneInput}
                        onChangeText={setPhoneInput}
                        onSubmitEditing={() => {
                          const next = addPhoneInvite(invites, phoneInput);
                          setInvites(next.invites);
                          setInviteError(next.error);
                          if (!next.error) setPhoneInput('');
                        }}
                        placeholder="(303) 555-0148"
                        placeholderTextColor="#64748b"
                        keyboardType="phone-pad"
                        style={styles.inviteInput}
                      />
                      <TouchableOpacity
                        accessibilityRole="button"
                        style={styles.inviteAddBtn}
                        onPress={() => {
                          const next = addPhoneInvite(invites, phoneInput);
                          setInvites(next.invites);
                          setInviteError(next.error);
                          if (!next.error) setPhoneInput('');
                        }}
                      >
                        <Text style={styles.inviteAddText}>Add</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {inviteError ? <Text style={styles.inviteError} testID="invite-error">{inviteError}</Text> : null}
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View style={styles.ctaDock}>
            {formError ? <Text style={styles.formError} testID="drop-error">{formError}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryDropBtn, submitting && styles.primaryDropBtnBusy]}
              onPress={handleDropBeacon}
              activeOpacity={0.85}
              disabled={submitting}
              testID="drop-submit"
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting }}
            >
              {submitting ? <ActivityIndicator color="#070b13" style={styles.dropSpinner} /> : null}
              <Text style={styles.primaryDropText}>{submitting ? 'DROPPING' : 'DROP BEACON'}</Text>
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
    backgroundColor: '#0a1120',
  },
  sheetContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#090f1d',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
  },
  sheetHidden: {
    opacity: 0,
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
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 8,
    flexGrow: 1,
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
    fontSize: 12,
    fontWeight: '700',
  },
  visibilityTextActive: {
    color: '#f8fafc',
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
  descriptionLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  descriptionBlock: {
    paddingTop: 2,
    gap: 6,
  },
  descriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  descriptionInput: {
    color: '#f8fafc',
    fontSize: 13,
    minHeight: 40,
    maxHeight: 88,
    padding: 0,
  },
  wordCount: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  wordCountFull: {
    color: '#f59e0b',
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
    backgroundColor: 'rgba(14, 165, 233, 0.32)',
    borderColor: '#22d3ee',
  },
  scaleChipLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  scaleChipText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  scaleChipTextActive: {
    color: '#f8fafc',
  },
  scaleChipSub: {
    color: '#475569',
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  scaleChipSubActive: {
    color: '#e0f2fe',
    fontWeight: '700',
  },
  broadcastSubtext: {
    color: '#38bdf8',
    fontSize: 11,
    fontStyle: 'italic',
  },
  locationBlock: {
    position: 'relative',
    zIndex: 4,
  },
  fieldGlow: {
    borderColor: '#22d3ee',
    borderWidth: 1.5,
    shadowColor: '#22d3ee',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 8,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingHorizontal: 14,
    minHeight: 56,
    paddingVertical: 10,
  },
  locationCopy: {
    flex: 1,
  },
  locationInput: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '600',
    padding: 0,
  },
  locationDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginTop: 8,
    marginBottom: 6,
  },
  coordReadout: {
    color: '#38bdf8',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  mapPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  mapPickBtnText: {
    color: '#22d3ee',
    fontSize: 13,
    fontWeight: '700',
  },
  mapPickBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 6,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#22d3ee',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#22d3ee',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  mapPickHint: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  mapPickCancel: {
    color: '#22d3ee',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 12,
  },
  perimeterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  perimeterToggle: {
    width: 42,
    height: 24,
    borderRadius: 12,
    padding: 3,
    justifyContent: 'center',
  },
  perimeterToggleOn: {
    backgroundColor: '#22d3ee',
  },
  perimeterToggleOff: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  perimeterThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#94a3b8',
  },
  perimeterThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: '#082f49',
  },
  targetIconBtn: {
    padding: 6,
    minWidth: 32,
    alignItems: 'center',
  },
  searchingText: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 6,
    marginLeft: 8,
  },
  suggestionList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 6,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
    zIndex: 6,
    elevation: 6,
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
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#070b13',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillToggleActive: {
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderColor: '#22d3ee',
  },
  pillToggleText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  pillToggleTextActive: {
    color: '#f8fafc',
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
    backgroundColor: '#22d3ee',
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
    gap: 8,
  },
  inviteBlock: {
    marginTop: 'auto',
    gap: 8,
  },
  inviteBtn: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#22d3ee',
    backgroundColor: '#0f172a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  inviteBtnText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  inviteChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inviteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  inviteChipText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  inviteChipRemove: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '800',
  },
  invitePanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#070b13',
    padding: 12,
    gap: 8,
  },
  inviteHeading: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  inviteKinds: {
    flexDirection: 'row',
    gap: 6,
  },
  inviteKind: {
    flex: 1,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 4,
  },
  inviteKindSelected: {
    backgroundColor: '#22d3ee',
    borderColor: '#67e8f9',
  },
  inviteKindText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
  },
  inviteKindTextSelected: {
    color: '#082f49',
  },
  inviteList: {
    gap: 6,
  },
  inviteRow: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inviteRowSelected: {
    borderColor: '#22d3ee',
  },
  inviteRowText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  inviteRowMeta: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  inviteEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inviteInput: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  inviteAddBtn: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteAddText: {
    color: '#082f49',
    fontSize: 13,
    fontWeight: '800',
  },
  inviteError: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
  },
  formError: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  primaryDropBtn: {
    backgroundColor: '#22d3ee',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#22d3ee',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  primaryDropBtnBusy: {
    opacity: 0.7,
  },
  dropSpinner: {
    marginRight: 8,
  },
  primaryDropText: {
    color: '#070b13',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
});
