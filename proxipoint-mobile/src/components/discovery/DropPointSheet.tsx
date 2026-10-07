import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MAX_BEACON_CHANNELS, toggleChannel } from '../../lib/beaconDrop';
import { isSameVerifiedQuery, type VerifiedAddress } from '../../lib/addressVerify';
import { regionLabel, type RegionMatch } from '../../lib/regions';
import {
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  clampDuration,
  clampStart,
  earliestStart,
  formatDuration,
  formatStartLabel,
  type BeaconVisibility,
} from '../../lib/beaconSchedule';
import { readCurrentPosition, verifyAddressQuery, verifyCoordinates } from '../../services/addressVerify';
import { lookupContainingRegions } from '../../services/regionLookup';
import type { AppearancePalette } from '../../lib/appearance';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';

export const DropPointSheet: React.FC = () => {
  const open = useDiscoveryStore((s) => s.dropSheetOpen);
  const setDropSheetOpen = useDiscoveryStore((s) => s.setDropSheetOpen);
  const tags = useDiscoveryStore((s) => s.tags);
  const selectedTag = useDiscoveryStore((s) => s.selectedTag);
  const dropBeacon = useDiscoveryStore((s) => s.dropBeacon);
  const setSelfCoordinates = useDiscoveryStore((s) => s.setSelfCoordinates);
  const previewPin = useDiscoveryStore((s) => s.previewPin);
  const placePreviewPin = useDiscoveryStore((s) => s.placePreviewPin);
  const clearPreviewPin = useDiscoveryStore((s) => s.clearPreviewPin);
  const colors = useAppearanceStore((s) => s.colors);
  const styles = useMemo(() => createDropStyles(colors), [colors]);

  const [place, setPlace] = useState('');
  const [channels, setChannels] = useState<string[]>([]);
  const [limitNote, setLimitNote] = useState('');
  const [address, setAddress] = useState('');
  const [verified, setVerified] = useState<VerifiedAddress | null>(null);
  const [regions, setRegions] = useState<RegionMatch[]>([]);
  const [status, setStatus] = useState<'idle' | 'checking' | 'verified'>('idle');
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [visibility, setVisibility] = useState<BeaconVisibility>('public');
  const [startsAt, setStartsAt] = useState(() => earliestStart(new Date()));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [scheduleNote, setScheduleNote] = useState('');
  const [trackWidth, setTrackWidth] = useState(1);
  const requestId = useRef(0);
  const wasOpen = useRef(false);

  const channelOptions = tags.filter((tag) => tag !== 'All');
  const addressVerified = status === 'verified' && isSameVerifiedQuery(verified, address);
  const canDrop = place.trim().length > 0 && channels.length > 0 && addressVerified && !locating;

  useEffect(() => {
    if (open && !wasOpen.current) {
      setPlace('');
      setChannels(selectedTag !== 'All' ? [selectedTag] : []);
      setLimitNote('');
      setAddress('');
      setVerified(null);
      setRegions([]);
      setStatus('idle');
      setError('');
      setLocating(false);
      setVisibility('public');
      setStartsAt(earliestStart(new Date()));
      setDurationMinutes(60);
      setScheduleNote('');
      requestId.current += 1;
    }
    wasOpen.current = open;
  }, [open, selectedTag]);

  const applyVerified = async (next: VerifiedAddress | null, query: string, id: number) => {
    if (!next) {
      setVerified(null);
      setRegions([]);
      setStatus('idle');
      setError('That address could not be verified. Try a street and city.');
      return;
    }
    const matches = await lookupContainingRegions(next.latitude, next.longitude);
    if (id !== requestId.current) return;
    setRegions(matches);
    setVerified({ ...next, query });
    setStatus('verified');
    setError('');
  };

  const verifyTypedAddress = async () => {
    const query = address.trim();
    if (query.length < 3) {
      setVerified(null);
      setStatus('idle');
      setError('Enter a street address to verify.');
      return;
    }
    const id = ++requestId.current;
    setStatus('checking');
    setError('');
    try {
      const result = await verifyAddressQuery(query);
      if (id !== requestId.current) return;
      await applyVerified(result, query, id);
    } catch {
      if (id !== requestId.current) return;
      setVerified(null);
      setStatus('idle');
      setError('Address lookup is unavailable. Try again.');
    }
  };

  const useCurrentPosition = async () => {
    const id = ++requestId.current;
    setLocating(true);
    setStatus('checking');
    setError('');
    try {
      const coords = await readCurrentPosition();
      let result: VerifiedAddress | null = null;
      try {
        result = await verifyCoordinates(coords.latitude, coords.longitude);
      } catch {
        result = null;
      }
      if (id !== requestId.current) return;
      const fallback: VerifiedAddress = {
        query: 'Current position',
        label: 'Current position',
        latitude: coords.latitude,
        longitude: coords.longitude,
      };
      const next = result ?? fallback;
      setSelfCoordinates({ latitude: next.latitude, longitude: next.longitude });
      placePreviewPin({ latitude: next.latitude, longitude: next.longitude });
      setAddress(next.label);
      await applyVerified(next, next.label, id);
    } catch (err) {
      if (id !== requestId.current) return;
      setVerified(null);
      setStatus('idle');
      setError(err instanceof Error ? err.message : 'Current position is unavailable.');
    } finally {
      if (id === requestId.current) setLocating(false);
    }
  };

  const onToggleChannel = (channel: string) => {
    const next = toggleChannel(channels, channel);
    setChannels(next.selected);
    setLimitNote(
      next.rejected && !channels.includes(channel)
        ? `You can choose up to ${MAX_BEACON_CHANNELS} channels.`
        : '',
    );
  };

  const onChangeAddress = (text: string) => {
    requestId.current += 1;
    setAddress(text);
    setVerified(null);
    setRegions([]);
    setStatus('idle');
    setError('');
    setLocating(false);
    clearPreviewPin();
  };

  const changeStart = (deltaMinutes: number) => {
    const next = clampStart(new Date(startsAt.getTime() + deltaMinutes * 60 * 1000), new Date());
    setStartsAt(next.start);
    if (next.limit === 'month') setScheduleNote('Scheduling stays within one month of now.');
    else if (next.limit === 'past') setScheduleNote('The start time stays at the next open slot.');
    else setScheduleNote('');
  };

  const changeDuration = (minutes: number) => {
    const next = clampDuration(minutes);
    setDurationMinutes(next.minutes);
    setScheduleNote(next.limit === 'duration' ? 'Duration runs from 15 minutes to 24 hours, in 15 minute steps.' : '');
  };

  const setDurationFromTrack = (locationX: number) => {
    const ratio = Math.min(1, Math.max(0, locationX / Math.max(trackWidth, 1)));
    const raw = MIN_DURATION_MINUTES + ratio * (MAX_DURATION_MINUTES - MIN_DURATION_MINUTES);
    changeDuration(raw);
  };

  const onDrop = () => {
    if (!canDrop || !verified) return;
    dropBeacon({
      place,
      tags: channels,
      addressLabel: verified.label,
      latitude: verified.latitude,
      longitude: verified.longitude,
      regionName: regions[0]?.name,
      regionChain: regionLabel(regions),
      visibility,
      startsAt: startsAt.toISOString(),
      durationMinutes,
    });
  };

  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
  const startLabel = formatStartLabel(startsAt, new Date());

  if (!open) return null;

  return (
    <View style={[styles.sheet, previewPin ? styles.sheetPeek : null]}>
      <View style={styles.grabber} />
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={styles.eyebrow}>HOST A BEACON</Text>
          <Text style={styles.title}>Drop Point</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close drop point"
          onPress={() => setDropSheetOpen(false)}
          style={styles.closeBtn}
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.scrollWrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={styles.visibilityTrack} accessibilityRole="tablist">
          <View style={[styles.visibilityThumb, visibility === 'public' && styles.visibilityThumbPublic]} />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: visibility === 'private' }}
            style={styles.visibilityHalf}
            onPress={() => setVisibility('private')}
          >
            <Text style={[styles.visibilityText, visibility === 'private' && styles.visibilityTextSelected]}>Private</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: visibility === 'public' }}
            style={styles.visibilityHalf}
            onPress={() => setVisibility('public')}
          >
            <Text style={[styles.visibilityText, visibility === 'public' && styles.visibilityTextSelected]}>Public</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>
          Publish a live beacon at a verified address or your current position. It joins the map and opens in the card sheet.
        </Text>

        <Text style={styles.fieldLabel}>HOST / PLACE</Text>
        <TextInput
          value={place}
          onChangeText={setPlace}
          placeholder="Pearl Street Mall"
          placeholderTextColor={colors.textDim}
          style={styles.input}
        />

        <View style={styles.channelHeading}>
          <Text style={styles.fieldLabel}>CHANNEL</Text>
          <Text style={styles.channelCount}>
            {channels.length}/{MAX_BEACON_CHANNELS}
          </Text>
        </View>
        <View style={styles.channelWrap}>
          {channelOptions.map((channel) => {
            const selected = channels.includes(channel);
            const blocked = !selected && channels.length >= MAX_BEACON_CHANNELS;
            return (
              <TouchableOpacity
                key={channel}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: blocked }}
                onPress={() => onToggleChannel(channel)}
                style={[styles.channelChip, selected && styles.channelChipSelected, blocked && styles.channelChipBlocked]}
              >
                <Text style={[styles.channelText, selected && styles.channelTextSelected]}>{channel}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {limitNote ? <Text style={styles.limitNote}>{limitNote}</Text> : null}

        <Text style={styles.fieldLabel}>ADDRESS</Text>
        <TextInput
          value={address}
          onChangeText={onChangeAddress}
          onSubmitEditing={() => void verifyTypedAddress()}
          placeholder="123 Pearl St, Boulder, CO"
          placeholderTextColor={colors.textDim}
          autoCapitalize="words"
          multiline
          style={[styles.input, styles.addressInput]}
        />

        <View style={styles.actionRow}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.secondaryBtn, status === 'checking' && !locating && styles.secondaryBtnBusy]}
            onPress={() => void verifyTypedAddress()}
            disabled={status === 'checking'}
          >
            {status === 'checking' && !locating ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Text style={styles.secondaryBtnText}>{addressVerified ? 'Verified' : 'Verify address'}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.secondaryBtn}
            onPress={() => void useCurrentPosition()}
            disabled={status === 'checking'}
          >
            {locating ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Text style={styles.secondaryBtnText}>Use my current position</Text>
            )}
          </TouchableOpacity>
        </View>

        {addressVerified && verified ? (
          <Text style={styles.verifiedText}>Verified · {verified.label}</Text>
        ) : null}
        {addressVerified && regions.length > 0 ? (
          <Text style={styles.verifiedText}>In {regionLabel(regions)}</Text>
        ) : null}
        {previewPin ? (
          <Text style={styles.verifiedText}>Pin placed on the map at your current position.</Text>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Text style={styles.fieldLabel}>STARTS</Text>
        <View style={styles.stepperRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous day" style={styles.stepperBtn} onPress={() => changeStart(-24 * 60)}>
            <Text style={styles.stepperBtnText}>− day</Text>
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{startLabel}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next day" style={styles.stepperBtn} onPress={() => changeStart(24 * 60)}>
            <Text style={styles.stepperBtnText}>+ day</Text>
          </TouchableOpacity>
        </View>
        {scheduleNote ? <Text style={styles.limitNote}>{scheduleNote}</Text> : null}
        <View style={styles.stepperRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="15 minutes earlier" style={styles.stepperBtn} onPress={() => changeStart(-15)}>
            <Text style={styles.stepperBtnText}>− 15m</Text>
          </TouchableOpacity>
          <Text style={styles.stepperHint}>15 min steps</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="15 minutes later" style={styles.stepperBtn} onPress={() => changeStart(15)}>
            <Text style={styles.stepperBtnText}>+ 15m</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.channelHeading}>
          <Text style={styles.fieldLabel}>DURATION</Text>
          <Text style={styles.channelCount}>{formatDuration(durationMinutes)}</Text>
        </View>
        <View style={styles.stepperRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Shorten duration" style={styles.stepperBtn} onPress={() => changeDuration(durationMinutes - 15)}>
            <Text style={styles.stepperBtnText}>− 15m</Text>
          </TouchableOpacity>
          <View
            accessibilityRole="adjustable"
            accessibilityLabel="Duration"
            style={styles.durationTrack}
            onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => true}
            onResponderRelease={(event) => setDurationFromTrack(event.nativeEvent.locationX)}
          >
            <View
              style={[
                styles.durationFill,
                { width: `${((durationMinutes - MIN_DURATION_MINUTES) / (MAX_DURATION_MINUTES - MIN_DURATION_MINUTES)) * 100}%` },
              ]}
            />
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Lengthen duration" style={styles.stepperBtn} onPress={() => changeDuration(durationMinutes + 15)}>
            <Text style={styles.stepperBtnText}>+ 15m</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.endsText}>Ends {formatStartLabel(endsAt, new Date())}. Up to 24 hours, within one month.</Text>
      </ScrollView>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: !canDrop }}
        style={[styles.dropBtn, !canDrop && styles.dropBtnDisabled]}
        onPress={onDrop}
        disabled={!canDrop}
      >
        <Text style={styles.dropBtnText}>Drop beacon</Text>
      </TouchableOpacity>
    </View>
  );
};

function createDropStyles(c: AppearancePalette) {
  return StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.sheet,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: c.navBorder,
    zIndex: 30,
    paddingTop: 8,
  },
  sheetPeek: {
    top: '50%',
  },
  visibilityTrack: {
    marginTop: 14,
    height: 42,
    borderRadius: 21,
    backgroundColor: c.input,
    borderWidth: 1,
    borderColor: c.navBorder,
    flexDirection: 'row',
    position: 'relative',
    overflow: 'hidden',
  },
  visibilityThumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    width: '48%',
    borderRadius: 18,
    backgroundColor: '#22d3ee',
  },
  visibilityThumbPublic: {
    left: '50%',
  },
  visibilityHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  visibilityText: {
    color: c.textMuted,
    fontSize: 14,
    fontWeight: '800',
  },
  visibilityTextSelected: {
    color: '#082f49',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  stepperBtn: {
    minWidth: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#155e75',
    backgroundColor: c.inset,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  stepperBtnText: {
    color: c.schedule,
    fontSize: 13,
    fontWeight: '800',
  },
  stepperValue: {
    flex: 1,
    color: c.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  stepperHint: {
    flex: 1,
    color: c.textDim,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  endsText: {
    color: c.textDim,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  durationTrack: {
    flex: 1,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.input,
    borderWidth: 1,
    borderColor: c.navBorder,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  durationFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#22d3ee',
    borderRadius: 14,
  },
  grabber: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.pull,
    alignSelf: 'center',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  titleCopy: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrow: {
    color: c.region,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  title: {
    color: c.text,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: c.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  scrollWrap: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  subtitle: {
    color: c.textDim,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 16,
  },
  fieldLabel: {
    color: c.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  input: {
    backgroundColor: c.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.navBorder,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  addressInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  channelHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  channelCount: {
    color: c.textDim,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  channelWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  channelChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.navBorder,
  },
  channelChipSelected: {
    backgroundColor: '#22d3ee',
    borderColor: '#67e8f9',
  },
  channelChipBlocked: {
    opacity: 0.45,
  },
  channelText: {
    color: c.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  channelTextSelected: {
    color: '#082f49',
  },
  limitNote: {
    color: '#fbbf24',
    fontSize: 12,
    marginBottom: 10,
  },
  actionRow: {
    gap: 8,
    marginBottom: 10,
  },
  secondaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#155e75',
    backgroundColor: c.inset,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryBtnBusy: {
    opacity: 0.8,
  },
  secondaryBtnText: {
    color: c.schedule,
    fontSize: 14,
    fontWeight: '700',
  },
  verifiedText: {
    color: '#34d399',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
    width: '100%',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  dropBtn: {
    marginHorizontal: 18,
    marginBottom: 14,
    backgroundColor: '#22d3ee',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    zIndex: 2,
  },
  dropBtnDisabled: {
    opacity: 0.4,
  },
  dropBtnText: {
    color: '#082f49',
    fontSize: 16,
    fontWeight: '800',
  },
});
}

