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
import { Calendar, Globe, LocateFixed, Lock, Radio, Rocket, Search } from 'lucide-react-native';
import { MAX_BEACON_CHANNELS, toggleChannel } from '../../lib/beaconDrop';
import {
  LINKED_FACEBOOK_ACCOUNTS,
  addPhoneInvite,
  addProxiPointInvite,
  removeInvite,
  toggleFacebookInvite,
  type BeaconInvite,
  type InviteKind,
} from '../../lib/beaconInvite';
import { isSameVerifiedQuery, type VerifiedAddress } from '../../lib/addressVerify';
import { regionLabel, type RegionMatch } from '../../lib/regions';
import {
  clampDuration,
  clampStart,
  earliestStart,
  formatStartLabel,
  type BeaconVisibility,
} from '../../lib/beaconSchedule';
import { ALERT_RADIUS_PRESETS, DURATION_PRESETS, clampAlertRadius } from '../../lib/dropPointMenu';
import { readCurrentPosition, verifyAddressQuery, verifyCoordinates } from '../../services/addressVerify';
import { lookupContainingRegions } from '../../services/regionLookup';
import type { AppearancePalette } from '../../lib/appearance';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';

const VISIBILITY_MODES: { id: BeaconVisibility; label: string; Icon: typeof Lock }[] = [
  { id: 'private', label: 'Private', Icon: Lock },
  { id: 'tag-network', label: 'Tag Network', Icon: Radio },
  { id: 'public', label: 'Public', Icon: Globe },
];

export const DropPointSheet: React.FC = () => {
  const open = useDiscoveryStore((s) => s.dropSheetOpen);
  const setDropSheetOpen = useDiscoveryStore((s) => s.setDropSheetOpen);
  const tags = useDiscoveryStore((s) => s.tags);
  const addTag = useDiscoveryStore((s) => s.addTag);
  const selectedTag = useDiscoveryStore((s) => s.selectedTag);
  const dropBeacon = useDiscoveryStore((s) => s.dropBeacon);
  const setSelfCoordinates = useDiscoveryStore((s) => s.setSelfCoordinates);
  const previewPin = useDiscoveryStore((s) => s.previewPin);
  const placePreviewPin = useDiscoveryStore((s) => s.placePreviewPin);
  const clearPreviewPin = useDiscoveryStore((s) => s.clearPreviewPin);
  const colors = useAppearanceStore((s) => s.colors);
  const styles = useMemo(() => createDropStyles(colors), [colors]);

  const [channels, setChannels] = useState<string[]>([]);
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [limitNote, setLimitNote] = useState('');
  const [address, setAddress] = useState('');
  const [verified, setVerified] = useState<VerifiedAddress | null>(null);
  const [regions, setRegions] = useState<RegionMatch[]>([]);
  const [status, setStatus] = useState<'idle' | 'checking' | 'verified'>('idle');
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [visibility, setVisibility] = useState<BeaconVisibility>('tag-network');
  const [whenMode, setWhenMode] = useState<'live' | 'schedule'>('live');
  const [radiusPreset, setRadiusPreset] = useState<250 | 500 | 1000 | 'custom'>(500);
  const [customRadius, setCustomRadius] = useState('750');
  const [invites, setInvites] = useState<BeaconInvite[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteKind, setInviteKind] = useState<InviteKind>('facebook');
  const [handleInput, setHandleInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [startsAt, setStartsAt] = useState(() => earliestStart(new Date()));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [scheduleNote, setScheduleNote] = useState('');
  const requestId = useRef(0);
  const wasOpen = useRef(false);

  const channelOptions = tags.filter((tag) => tag !== 'All');
  const addressVerified = status === 'verified' && isSameVerifiedQuery(verified, address);
  const alertRadius = radiusPreset === 'custom' ? clampAlertRadius(Number(customRadius)) : radiusPreset;

  useEffect(() => {
    if (open && !wasOpen.current) {
      setChannels(selectedTag !== 'All' ? [selectedTag] : []);
      setAddingTag(false);
      setNewTag('');
      setLimitNote('');
      setAddress('');
      setVerified(null);
      setRegions([]);
      setStatus('idle');
      setError('');
      setLocating(false);
      setVisibility('tag-network');
      setWhenMode('live');
      setRadiusPreset(500);
      setCustomRadius('750');
      setInvites([]);
      setInviteOpen(false);
      setInviteKind('facebook');
      setHandleInput('');
      setPhoneInput('');
      setInviteError('');
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

  const chooseDuration = (minutes: number) => {
    setDurationMinutes(clampDuration(minutes).minutes);
    setScheduleNote('');
  };

  const commitNewTag = () => {
    const clean = newTag.trim();
    if (!clean) return;
    const tagged = clean.startsWith('#') ? clean : `#${clean}`;
    addTag(tagged);
    onToggleChannel(tagged);
    setNewTag('');
    setAddingTag(false);
  };

  const onDrop = () => {
    if (channels.length === 0) {
      setError('Choose at least one channel.');
      return;
    }
    if (!addressVerified || !verified || locating) {
      setError('Verify the place, or use your current position.');
      if (!locating && address.trim().length >= 3) void verifyTypedAddress();
      return;
    }
    dropBeacon({
      place: verified.label,
      tags: channels,
      addressLabel: verified.label,
      latitude: verified.latitude,
      longitude: verified.longitude,
      regionName: regions[0]?.name,
      regionChain: regionLabel(regions),
      visibility,
      invites: visibility === 'private' ? invites : [],
      live: whenMode === 'live',
      startsAt: whenMode === 'live' ? new Date().toISOString() : startsAt.toISOString(),
      durationMinutes,
      alertRadiusMeters: alertRadius,
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
          <Text style={styles.closeText}>[×]</Text>
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
          {VISIBILITY_MODES.map(({ id, label, Icon }) => {
            const selected = visibility === id;
            return (
              <TouchableOpacity
                key={id}
                testID={`drop-visibility-${id}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.visibilityChoice, selected && styles.visibilityChoiceSelected]}
                onPress={() => setVisibility(id)}
              >
                <Icon size={14} color={selected ? '#082f49' : colors.textMuted} />
                <Text style={[styles.visibilityText, selected && styles.visibilityTextSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {visibility === 'private' ? (
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
              <View style={styles.invitePanel}>
                <Text style={styles.fieldLabel}>INVITE BY</Text>
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
                      placeholderTextColor={colors.textDim}
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
                      placeholderTextColor={colors.textDim}
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

                {inviteError ? <Text style={styles.errorText}>{inviteError}</Text> : null}
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.fieldLabel}>WHERE</Text>
        <View style={styles.whereField}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            testID="drop-where-input"
            value={address}
            onChangeText={onChangeAddress}
            onBlur={() => {
              if (address.trim().length >= 3) void verifyTypedAddress();
            }}
            onSubmitEditing={() => void verifyTypedAddress()}
            placeholder="Pearl Street Mall, Boulder, CO"
            placeholderTextColor={colors.textDim}
            autoCapitalize="words"
            style={styles.whereInput}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Use my current position"
            testID="drop-current-position"
            style={styles.whereTarget}
            onPress={() => void useCurrentPosition()}
            disabled={status === 'checking'}
          >
            {locating ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <LocateFixed size={18} color={colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>
        {status === 'checking' && !locating ? <Text style={styles.hintText}>Checking that address…</Text> : null}
        {addressVerified && verified ? <Text style={styles.verifiedText}>Verified · {verified.label}</Text> : null}
        {addressVerified && regions.length > 0 ? <Text style={styles.verifiedText}>In {regionLabel(regions)}</Text> : null}
        {previewPin ? <Text style={styles.verifiedText}>Pin placed on the map at your current position.</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Text style={styles.fieldLabel}>CHANNELS & PROXIMITY RADIUS</Text>
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
          <TouchableOpacity
            accessibilityRole="button"
            testID="drop-add-tags"
            style={styles.addTagChip}
            onPress={() => setAddingTag((openPanel) => !openPanel)}
          >
            <Text style={styles.addTagText}>+ Add Tags</Text>
          </TouchableOpacity>
        </View>
        {addingTag ? (
          <View style={styles.addTagRow}>
            <TextInput
              testID="drop-new-tag-input"
              value={newTag}
              onChangeText={setNewTag}
              onSubmitEditing={commitNewTag}
              placeholder="#ArtWalk"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              style={styles.addTagInput}
            />
            <TouchableOpacity accessibilityRole="button" style={styles.inviteAddBtn} onPress={commitNewTag}>
              <Text style={styles.inviteAddText}>Add</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {limitNote ? <Text style={styles.limitNote}>{limitNote}</Text> : null}

        <Text style={styles.alertCopy}>Alert users tracking these tags within:</Text>
        <View style={styles.choiceRow}>
          {ALERT_RADIUS_PRESETS.map((choice) => {
            const selected = radiusPreset === choice.meters;
            return (
              <TouchableOpacity
                key={choice.meters}
                testID={`drop-radius-${choice.meters}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.choiceChip, selected && styles.choiceChipSelected]}
                onPress={() => setRadiusPreset(choice.meters)}
              >
                <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{choice.label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            testID="drop-radius-custom"
            accessibilityRole="button"
            accessibilityState={{ selected: radiusPreset === 'custom' }}
            style={[styles.choiceChip, radiusPreset === 'custom' && styles.choiceChipSelected]}
            onPress={() => setRadiusPreset('custom')}
          >
            <Text style={[styles.choiceText, radiusPreset === 'custom' && styles.choiceTextSelected]}>Custom</Text>
          </TouchableOpacity>
        </View>
        {radiusPreset === 'custom' ? (
          <TextInput
            testID="drop-radius-custom-input"
            value={customRadius}
            onChangeText={setCustomRadius}
            keyboardType="number-pad"
            placeholder="750"
            placeholderTextColor={colors.textDim}
            style={styles.customRadiusInput}
          />
        ) : null}

        <Text style={styles.fieldLabel}>WHEN</Text>
        <View style={styles.whenRow}>
          <TouchableOpacity
            testID="drop-when-live"
            accessibilityRole="button"
            accessibilityState={{ selected: whenMode === 'live' }}
            style={[styles.whenChoice, whenMode === 'live' && styles.whenChoiceSelected]}
            onPress={() => setWhenMode('live')}
          >
            <Rocket size={16} color={whenMode === 'live' ? colors.text : colors.textMuted} />
            <Text style={[styles.whenText, whenMode === 'live' && styles.whenTextSelected]}>Live Now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="drop-when-schedule"
            accessibilityRole="button"
            accessibilityState={{ selected: whenMode === 'schedule' }}
            style={[styles.whenChoice, whenMode === 'schedule' && styles.whenChoiceSelected]}
            onPress={() => setWhenMode('schedule')}
          >
            <Calendar size={16} color={whenMode === 'schedule' ? colors.text : colors.textMuted} />
            <Text style={[styles.whenText, whenMode === 'schedule' && styles.whenTextSelected]}>Schedule</Text>
          </TouchableOpacity>
        </View>
        {whenMode === 'schedule' ? (
          <View>
            <View style={styles.stepperRow}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous day" style={styles.stepperBtn} onPress={() => changeStart(-24 * 60)}>
                <Text style={styles.stepperBtnText}>− day</Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{startLabel}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next day" style={styles.stepperBtn} onPress={() => changeStart(24 * 60)}>
                <Text style={styles.stepperBtnText}>+ day</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.stepperRow}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="15 minutes earlier" style={styles.stepperBtn} onPress={() => changeStart(-15)}>
                <Text style={styles.stepperBtnText}>− 15m</Text>
              </TouchableOpacity>
              <Text style={styles.stepperHint}>15 min steps, within one month</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="15 minutes later" style={styles.stepperBtn} onPress={() => changeStart(15)}>
                <Text style={styles.stepperBtnText}>+ 15m</Text>
              </TouchableOpacity>
            </View>
            {scheduleNote ? <Text style={styles.limitNote}>{scheduleNote}</Text> : null}
          </View>
        ) : null}

        <View style={styles.durationRow}>
          <Text style={styles.durationLabel}>Duration:</Text>
          {DURATION_PRESETS.map((choice) => {
            const selected = durationMinutes === choice.minutes;
            return (
              <TouchableOpacity
                key={choice.minutes}
                testID={`drop-duration-${choice.minutes}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.choiceChip, selected && styles.choiceChipSelected]}
                onPress={() => chooseDuration(choice.minutes)}
              >
                <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{choice.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {whenMode === 'schedule' ? (
          <Text style={styles.endsText}>Ends {formatStartLabel(endsAt, new Date())}.</Text>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          testID="drop-beacon-button"
          style={styles.dropBtn}
          onPress={onDrop}
        >
          <Text style={styles.dropBtnText}>DROP BEACON</Text>
        </TouchableOpacity>
      </ScrollView>
      </View>
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
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: c.input,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    gap: 2,
  },
  visibilityChoice: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 4,
  },
  visibilityChoiceSelected: {
    backgroundColor: '#22d3ee',
  },
  visibilityText: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  visibilityTextSelected: {
    color: '#082f49',
  },
  inviteBlock: {
    marginTop: 12,
    gap: 8,
  },
  inviteBtn: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.inset,
  },
  inviteBtnText: {
    color: c.accentBright,
    fontSize: 15,
    fontWeight: '800',
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
    borderColor: c.navBorder,
    backgroundColor: c.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  inviteChipText: {
    color: c.text,
    fontSize: 12,
    fontWeight: '700',
  },
  inviteChipRemove: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '800',
  },
  invitePanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.navBorder,
    backgroundColor: c.inset,
    padding: 12,
    gap: 8,
  },
  inviteKinds: {
    flexDirection: 'row',
    gap: 6,
  },
  inviteKind: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.navBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
    paddingHorizontal: 6,
  },
  inviteKindSelected: {
    backgroundColor: '#22d3ee',
    borderColor: '#67e8f9',
  },
  inviteKindText: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  inviteKindTextSelected: {
    color: '#082f49',
  },
  inviteList: {
    gap: 6,
  },
  inviteRow: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.navBorder,
    backgroundColor: c.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inviteRowSelected: {
    borderColor: c.accent,
  },
  inviteRowText: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
  },
  inviteRowMeta: {
    color: c.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  inviteEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inviteInput: {
    flex: 1,
    backgroundColor: c.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.navBorder,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 0,
  },
  inviteAddBtn: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteAddText: {
    color: '#082f49',
    fontSize: 14,
    fontWeight: '800',
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
    minWidth: 40,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  closeText: {
    color: c.textMuted,
    fontSize: 14,
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
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
  },
  whereField: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.input,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 6,
    gap: 8,
  },
  whereInput: {
    flex: 1,
    color: c.text,
    fontSize: 14,
    paddingVertical: 10,
  },
  whereTarget: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    color: c.textDim,
    fontSize: 12,
    marginTop: 6,
  },
  alertCopy: {
    color: c.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 10,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.inset,
  },
  choiceChipSelected: {
    backgroundColor: '#22d3ee',
    borderColor: '#67e8f9',
  },
  choiceText: {
    color: c.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  choiceTextSelected: {
    color: '#082f49',
  },
  customRadiusInput: {
    marginTop: 8,
    backgroundColor: c.input,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    maxWidth: 140,
  },
  whenRow: {
    flexDirection: 'row',
    gap: 10,
  },
  whenChoice: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.inset,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  whenChoiceSelected: {
    borderColor: '#22d3ee',
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
  },
  whenText: {
    color: c.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  whenTextSelected: {
    color: c.text,
  },
  durationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  durationLabel: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
    marginRight: 2,
  },
  addTagChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.inset,
  },
  addTagText: {
    color: c.text,
    fontSize: 13,
    fontWeight: '700',
  },
  addTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  addTagInput: {
    flex: 1,
    backgroundColor: c.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
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
    marginTop: 22,
    marginBottom: 8,
    backgroundColor: '#22d3ee',
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropBtnDisabled: {
    opacity: 0.4,
  },
  dropBtnText: {
    color: '#082f49',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
}

