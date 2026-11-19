import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Calendar from 'expo-calendar';
import * as SMS from 'expo-sms';
import {
  CalendarPlus,
  CircleCheck,
  Clock,
  EyeOff,
  Globe,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  RotateCcw,
  Share2,
  ShieldCheck,
  Square,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { addEmailInvite, addPhoneInvite, addProxiPointInvite, removeInvite } from '../../lib/beaconInvite';
import {
  calendarEventFor,
  cleanVenueLabel,
  formatPointWhen,
  inviteEmailUrl,
  inviteTextMessage,
  phoneNumberFromInvite,
  pointStatus,
  shareMessage,
  shareUrl,
  type DroppedPoint,
  type PointStatus,
} from '../../lib/droppedPoint';
import type { BeaconVisibility } from '../../types/beacon';
import { LiveBadge } from './LiveBadge';
import { useNavBarHeight } from '../discovery/BottomNavBar';
import { BoostCard } from './BoostCard';
import { EditPointDetails, type PointDetailEdits } from './EditPointDetails';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';
import { KeyboardAwareScrollView } from '../common/KeyboardAwareScrollView';

const NAV_BAR_HEIGHT = 72;

const VISIBILITY: Record<BeaconVisibility, { label: string; Icon: LucideIcon; accent: string }> = {
  private: { label: 'Private', Icon: Lock, accent: '#f59e0b' },
  channel: { label: 'Channel', Icon: Users, accent: '#a78bfa' },
  public: { label: 'Public', Icon: Globe, accent: '#34d399' },
};

const STATUS: Record<PointStatus, { label: string; color: string; bg: string }> = {
  live: { label: 'LIVE', color: '#34d399', bg: 'rgba(52, 211, 153, 0.14)' },
  upcoming: { label: 'UPCOMING', color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.12)' },
  past: { label: 'ENDED', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' },
};

/** Keeps the handle field as "@handle" (same behavior as the Drop Point sheet). */
function formatHandleInput(raw: string): string {
  if (raw === '') return '';
  return `@${raw.replace(/@/g, '').replace(/[^A-Za-z0-9_.-]/g, '')}`;
}

interface ManagePointSheetProps {
  point: DroppedPoint | null;
  /** True right after the drop, to show the "Your Point is live" banner. */
  justDropped?: boolean;
  onChange: (point: DroppedPoint) => void;
  onClose: () => void;
  /** Ended Points: open the Drop Point sheet filled in with this Point's details. */
  onDropAgain?: (id: string) => void;
}

export const ManagePointSheet: React.FC<ManagePointSheetProps> = ({ point, justDropped = false, onChange, onClose, onDropAgain }) => {
  const styles = useThemedStyles(createStyles);
  // `tone` is also a DetailRow prop here, so the theme helper gets another name.
  const { colors: c, tone: themeTone } = useTheme();
  const insets = useSafeAreaInsets();
  const navBarHeight = useNavBarHeight();
  const topPad =
    Platform.OS === 'android'
      ? Math.max(StatusBar.currentHeight ?? 0, insets.top, 56)
      : Math.max(insets.top, 24);

  const [inviteKind, setInviteKind] = useState<'proxipoint' | 'phone' | 'email'>('proxipoint');
  const [handleInput, setHandleInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [busy, setBusy] = useState<'sms' | 'share' | 'calendar' | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  // Opening a different Point always starts in view mode.
  const pointId = point?.id;
  useEffect(() => {
    setEditing(false);
    setConfirmingEnd(false);
    setNotice(null);
  }, [pointId]);

  if (!point) return null;

  const saveEdits = (edits: PointDetailEdits) => {
    const timeChanged = edits.startsAt !== point.startsAt || edits.endsAt !== point.endsAt;
    const placeChanged = edits.latitude !== point.latitude || edits.longitude !== point.longitude;
    // Server side: PATCH the Point and notify guests when the time or place changes
    // (and re-check the privacy region from the new exact spot, never trusting the app's name).
    onChange({ ...point, ...edits, isLiveNow: pointStatus({ ...point, ...edits }) === 'live' });
    setEditing(false);
    const changed = [timeChanged ? 'time' : null, placeChanged ? 'place' : null].filter(Boolean).join(' and ');
    setNotice({
      text: changed && point.invites.length > 0 ? `Saved. Let your invitees know the new ${changed}.` : 'Changes saved.',
      tone: 'ok',
    });
  };

  const endNow = () => {
    // Server side: PATCH the Point's end time to now (or POST /points/:id/end) and notify guests.
    const now = new Date().toISOString();
    onChange({ ...point, endsAt: now, isLiveNow: false });
    setConfirmingEnd(false);
    setNotice({ text: 'Point ended. It’s moved to Past in My Drops.', tone: 'ok' });
  };

  const status = pointStatus(point);
  const ended = status === 'past';
  // An ended Point can't be edited, even if it ended while the editor was open.
  const showEditor = editing && !ended;
  const rsvps = point.rsvps ?? [];
  const going = rsvps.filter((rsvp) => rsvp.status === 'going');
  // Old 'tag_network' Points read as Public.
  const visibility = VISIBILITY[point.visibility] ?? VISIBILITY.public;
  const phoneInvites = point.invites.filter((invite) => invite.kind === 'phone');
  const phoneNumbers = phoneInvites
    .map(phoneNumberFromInvite)
    .filter((number): number is string => Boolean(number));

  const updateInvites = (result: { invites: DroppedPoint['invites']; error: string }) => {
    setInviteError(result.error);
    if (!result.error) onChange({ ...point, invites: result.invites });
    return !result.error;
  };

  const addHandle = () => {
    if (!handleInput || handleInput === '@') return;
    // Server side: notify this user in the app (needs a points/:id/invites endpoint).
    if (updateInvites(addProxiPointInvite(point.invites, handleInput))) setHandleInput('@');
  };

  const addPhone = () => {
    if (!phoneInput.trim()) return;
    if (updateInvites(addPhoneInvite(point.invites, phoneInput))) setPhoneInput('');
  };

  const addEmail = () => {
    if (!emailInput.trim()) return;
    if (updateInvites(addEmailInvite(point.invites, emailInput))) setEmailInput('');
  };

  const emailCount = point.invites.filter((invite) => invite.kind === 'email').length;
  const emailInvitees = async () => {
    const url = inviteEmailUrl(point);
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      setNotice({ text: 'There’s no email app on this phone.', tone: 'warn' });
    }
  };

  const textInvitees = async () => {
    if (phoneNumbers.length === 0) return;
    setBusy('sms');
    try {
      if (!(await SMS.isAvailableAsync())) {
        setNotice({ text: 'Texting isn’t available on this device.', tone: 'warn' });
        return;
      }
      const result = await SMS.sendSMSAsync(phoneNumbers, inviteTextMessage(point));
      if (result.result === 'sent') setNotice({ text: 'Invites sent.', tone: 'ok' });
      else setNotice(null);
    } catch {
      setNotice({ text: 'Couldn’t open your messaging app.', tone: 'warn' });
    } finally {
      setBusy(null);
    }
  };

  const shareLink = async () => {
    setBusy('share');
    try {
      // iOS shows the url as a rich link; Android only uses message, so the link is in both.
      await Share.share(
        Platform.OS === 'ios'
          ? { message: shareMessage(point).replace(`\n${shareUrl(point)}`, ''), url: shareUrl(point) }
          : { message: shareMessage(point) },
        { subject: point.title },
      );
    } catch {
      setNotice({ text: 'Couldn’t open sharing.', tone: 'warn' });
    } finally {
      setBusy(null);
    }
  };

  const addToCalendar = async () => {
    setBusy('calendar');
    try {
      if (Platform.OS === 'ios') {
        const permission = await Calendar.requestCalendarPermissionsAsync();
        if (permission.status !== 'granted') {
          setNotice({ text: 'Allow calendar access in Settings to add this Point.', tone: 'warn' });
          return;
        }
      }
      const result = await Calendar.createEventInCalendarAsync(calendarEventFor(point));
      // Android can't report whether it was saved, so only iOS gets a confirmation.
      if (Platform.OS === 'ios' && result.action === 'saved') {
        setNotice({ text: 'Added to your calendar.', tone: 'ok' });
      }
    } catch {
      setNotice({ text: 'Couldn’t open your calendar.', tone: 'warn' });
    } finally {
      setBusy(null);
    }
  };

  const capacity =
    point.maxAttendance == null ? 'No attendance limit' : `Up to ${point.maxAttendance} people`;
  const approval = point.requiresApproval ? 'You approve each RSVP' : 'Anyone can RSVP';

  return (
    <View style={[styles.overlay, { bottom: navBarHeight }]} testID="manage-point-sheet">
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.pullBar} />
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>MANAGE POINT</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {justDropped ? (
          <View style={styles.liveBanner} testID="manage-dropped-banner">
            <Text style={styles.liveBannerTitle}>
              {status === 'live' ? 'Your Point is live' : 'Your Point is scheduled'}
            </Text>
            <Text style={styles.liveBannerSub}>Invite people and share it below.</Text>
          </View>
        ) : null}

        {!point.synced ? (
          <Text style={styles.offlineNote}>
            Couldn’t reach the server, so this Point is only on this phone for now.
          </Text>
        ) : null}

        {/* Details */}
        {showEditor ? (
          <EditPointDetails point={point} onSave={saveEdits} onCancel={() => setEditing(false)} />
        ) : (
        <View style={styles.card} testID="manage-details">
          <View style={styles.titleRow}>
            <View style={styles.photoCircle}>
              {point.coverPhotoUri ? (
                <Image source={{ uri: point.coverPhotoUri }} style={styles.photoImage} />
              ) : (
                <Text style={styles.photoInitial}>{point.title.trim().charAt(0).toUpperCase() || '•'}</Text>
              )}
            </View>
            <View style={styles.titleCopy}>
              <View style={styles.titleLine}>
                <Text style={styles.pointTitle} numberOfLines={2}>
                  {point.title}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (ended) return;
                    setNotice(null);
                    setEditing(true);
                  }}
                  disabled={ended}
                  style={[styles.editBtn, ended && styles.editBtnDisabled]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={ended ? 'Editing is off because this Point has ended' : 'Edit details'}
                  accessibilityState={{ disabled: ended }}
                  testID="manage-edit-open"
                >
                  {ended ? (
                    <Lock size={13} color={c.iconFaint} strokeWidth={2.25} />
                  ) : (
                    <Pencil size={13} color={c.accent} strokeWidth={2.25} />
                  )}
                  <Text style={[styles.editText, ended && styles.editTextDisabled]}>Edit</Text>
                </TouchableOpacity>
              </View>
              {status === 'live' ? (
                <LiveBadge testID="manage-live-badge" />
              ) : (
                <View style={[styles.statusChip, { backgroundColor: STATUS[status].bg }]}>
                  <Text style={[styles.statusText, { color: themeTone(STATUS[status].color) }]}>{STATUS[status].label}</Text>
                </View>
              )}
            </View>
          </View>

          <DetailRow Icon={Clock} text={formatPointWhen(point)} />
          <DetailRow Icon={MapPin} text={cleanVenueLabel(point.venue)} />
          {point.locationPrivacy ? (
            <DetailRow
              Icon={EyeOff}
              text={`Others see: somewhere in ${point.locationPrivacy.regionName}`}
              tone={c.violetSoft}
            />
          ) : null}
          <DetailRow
            Icon={visibility.Icon}
            text={point.beaconRadius ? `${visibility.label} · beacon reaches ${point.beaconRadius}` : visibility.label}
            tone={themeTone(visibility.accent)}
          />
          <DetailRow Icon={ShieldCheck} text={`${approval} · ${capacity}`} />

          {point.tags.length > 0 ? (
            <View style={styles.tagRow}>
              {point.tags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>#{tag.replace(/^#+/, '')}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {point.description ? <Text style={styles.description}>{point.description}</Text> : null}
        </View>
        )}

        {showEditor ? null : (
        <>
        {/* Boost: paid 4-hour spotlight on Discover (not for ended Points) */}
        {ended ? null : <BoostCard point={point} />}

        {/* Invite */}
        <View style={styles.card} testID="manage-invite">
          <View style={styles.sectionHeader}>
            <UserPlus size={15} color={c.accent} strokeWidth={2.25} />
            <Text style={styles.sectionTitle}>{ended ? 'INVITED' : 'INVITE'}</Text>
            {point.invites.length > 0 ? <Text style={styles.sectionCount}>{point.invites.length}</Text> : null}
          </View>

          {ended ? (
            point.invites.length > 0 ? (
              <View style={styles.inviteChips} testID="manage-invited-list">
                {point.invites.map((invite) => (
                  <View key={`${invite.kind}-${invite.id}`} style={styles.inviteChip}>
                    <Text style={styles.inviteChipText}>{invite.label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.hint}>No one was invited.</Text>
            )
          ) : (
          <>
          <View style={styles.kindRow}>
            {(
              [
                ['proxipoint', 'Users'],
                ['phone', 'Phone'],
                ['email', 'Email'],
              ] as const
            ).map(([kind, label]) => {
              const selected = inviteKind === kind;
              return (
                <TouchableOpacity
                  key={kind}
                  style={[styles.kindTab, selected && styles.kindTabSelected]}
                  onPress={() => {
                    setInviteKind(kind);
                    setInviteError('');
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`manage-invite-kind-${kind}`}
                >
                  <Text style={[styles.kindText, selected && styles.kindTextSelected]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.hint}>
            {inviteKind === 'proxipoint'
              ? 'Invite people already on ProxiPoint by their @handle.'
              : inviteKind === 'phone'
                ? 'Add numbers, then text everyone a link to this Point.'
                : 'Add email addresses, then email everyone a link to this Point.'}
          </Text>

          {inviteKind === 'proxipoint' ? (
            <View style={styles.entryRow}>
              <TextInput
                value={handleInput}
                onChangeText={(text) => setHandleInput(formatHandleInput(text))}
                onFocus={() => setHandleInput((current) => current || '@')}
                onBlur={() => setHandleInput((current) => (current === '@' ? '' : current))}
                onSubmitEditing={addHandle}
                placeholder="@ranger-7"
                placeholderTextColor={c.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                testID="manage-handle-input"
              />
              <TouchableOpacity style={styles.addBtn} onPress={addHandle} accessibilityRole="button">
                <Text style={styles.addText}>Add</Text>
              </TouchableOpacity>
            </View>
          ) : inviteKind === 'email' ? (
            <View style={styles.entryRow}>
              <TextInput
                value={emailInput}
                onChangeText={setEmailInput}
                onSubmitEditing={addEmail}
                placeholder="sam@example.com"
                placeholderTextColor={c.textFaint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                style={styles.input}
                testID="manage-email-input"
              />
              <TouchableOpacity style={styles.addBtn} onPress={addEmail} accessibilityRole="button">
                <Text style={styles.addText}>Add</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.entryRow}>
              <TextInput
                value={phoneInput}
                onChangeText={setPhoneInput}
                onSubmitEditing={addPhone}
                placeholder="(303) 555-0148"
                placeholderTextColor={c.textFaint}
                keyboardType="phone-pad"
                style={styles.input}
                testID="manage-phone-input"
              />
              <TouchableOpacity style={styles.addBtn} onPress={addPhone} accessibilityRole="button">
                <Text style={styles.addText}>Add</Text>
              </TouchableOpacity>
            </View>
          )}

          {inviteError ? <Text style={styles.errorText}>{inviteError}</Text> : null}

          {point.invites.length > 0 ? (
            <View style={styles.inviteChips}>
              {point.invites.map((invite) => (
                <View key={`${invite.kind}-${invite.id}`} style={styles.inviteChip}>
                  <Text style={styles.inviteChipText}>{invite.label}</Text>
                  <TouchableOpacity
                    onPress={() => onChange({ ...point, invites: removeInvite(point.invites, invite.id) })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${invite.label}`}
                  >
                    <Text style={styles.inviteChipRemove}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          {phoneNumbers.length > 0 ? (
            <ActionRow
              Icon={MessageSquare}
              title={`Text ${phoneNumbers.length} ${phoneNumbers.length === 1 ? 'invitee' : 'invitees'}`}
              subtitle="Opens your messages with the link filled in"
              onPress={textInvitees}
              loading={busy === 'sms'}
              testID="manage-text-invitees"
            />
          ) : null}
          {emailCount > 0 ? (
            <ActionRow
              Icon={Mail}
              title={`Email ${emailCount} ${emailCount === 1 ? 'invitee' : 'invitees'}`}
              subtitle="Opens your email app with the link filled in"
              onPress={emailInvitees}
              testID="manage-email-invitees"
            />
          ) : null}
          </>
          )}
        </View>

        {/* RSVPs (read-only; filled in by the server once RSVPs exist there) */}
        <View style={styles.card} testID="manage-rsvps">
          <View style={styles.sectionHeader}>
            <CircleCheck size={15} color={c.green} strokeWidth={2.25} />
            <Text style={styles.sectionTitle}>RSVPS</Text>
            {going.length > 0 ? <Text style={[styles.sectionCount, styles.goingCount]}>{going.length} going</Text> : null}
          </View>
          {rsvps.length > 0 ? (
            <View style={styles.inviteChips}>
              {rsvps.map((rsvp) => (
                <View key={rsvp.id} style={[styles.inviteChip, rsvp.status === 'pending' && styles.pendingChip]}>
                  <Text style={styles.inviteChipText}>{rsvp.label}</Text>
                  {rsvp.status === 'pending' ? <Text style={styles.pendingText}>Pending</Text> : null}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.hint}>{ended ? 'No one RSVP’d.' : 'No RSVPs yet.'}</Text>
          )}
        </View>

        {/* Share and save */}
        <View style={styles.card} testID="manage-share">
          <View style={styles.sectionHeader}>
            <Users size={15} color={c.accent} strokeWidth={2.25} />
            <Text style={styles.sectionTitle}>SHARE</Text>
          </View>
          <ActionRow
            Icon={Share2}
            title="Share link"
            subtitle={
              ended
                ? 'This Point has ended'
                : point.visibility === 'private'
                  ? 'Only people you’ve invited can open it'
                  : 'Messages, WhatsApp, Instagram, Snapchat and more'
            }
            disabled={ended}
            onPress={shareLink}
            loading={busy === 'share'}
            testID="manage-share-link"
          />
          {status !== 'past' ? (
            <ActionRow
              Icon={CalendarPlus}
              title="Add to calendar"
              subtitle={formatPointWhen(point)}
              onPress={addToCalendar}
              loading={busy === 'calendar'}
              testID="manage-add-calendar"
            />
          ) : null}
        </View>

        {status === 'live' ? (
          <TouchableOpacity
            style={styles.endBtn}
            onPress={() => {
              setNotice(null);
              setConfirmingEnd(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="End this Point now"
            testID="manage-end-point"
          >
            <Square size={14} color={c.red} fill={c.red} strokeWidth={2} />
            <Text style={styles.endBtnText}>END POINT</Text>
          </TouchableOpacity>
        ) : null}
        {ended && onDropAgain ? (
          <TouchableOpacity
            style={styles.againBtn}
            onPress={() => onDropAgain(point.id)}
            accessibilityRole="button"
            accessibilityLabel={`Drop ${point.title} again`}
            testID="manage-drop-again"
          >
            <RotateCcw size={16} color={c.base} strokeWidth={2.5} />
            <Text style={styles.againBtnText}>DROP AGAIN</Text>
          </TouchableOpacity>
        ) : null}
        </>
        )}

        {notice ? (
          <Text style={[styles.notice, notice.tone === 'warn' && styles.noticeWarn]} testID="manage-notice">
            {notice.text}
          </Text>
        ) : null}
      </KeyboardAwareScrollView>

      <Modal
        visible={confirmingEnd}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmingEnd(false)}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard} testID="manage-end-confirm">
            <Text style={styles.confirmTitle}>End this Point now?</Text>
            <Text style={styles.confirmBody}>
              “{point.title}” will stop being live and move to Past in My Drops. People nearby won’t see it
              anymore{point.invites.length > 0 ? ', and your invitees can’t RSVP' : ''}. This can’t be undone.
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmKeep]}
                onPress={() => setConfirmingEnd(false)}
                accessibilityRole="button"
                testID="manage-end-cancel"
              >
                <Text style={styles.confirmKeepText}>Keep it live</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmEnd]}
                onPress={endNow}
                accessibilityRole="button"
                testID="manage-end-confirm-button"
              >
                <Text style={styles.confirmEndText}>End Point</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const DetailRow: React.FC<{ Icon: LucideIcon; text: string; tone?: string }> = ({ Icon, text, tone }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
  <View style={styles.detailRow}>
    <Icon size={15} color={tone ?? c.textMuted} strokeWidth={2.25} />
    <Text style={[styles.detailText, tone ? { color: tone } : null]}>{text}</Text>
  </View>
  );
};

const ActionRow: React.FC<{
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}> = ({ Icon, title, subtitle, onPress, loading, disabled = false, testID }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
  <TouchableOpacity
    style={[styles.actionRow, disabled && styles.actionRowDisabled]}
    onPress={onPress}
    disabled={loading || disabled}
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    testID={testID}
  >
    <View style={[styles.actionIcon, disabled && styles.actionIconDisabled]}>
      {loading ? (
        <ActivityIndicator size="small" color={c.accent} />
      ) : (
        <Icon size={18} color={disabled ? c.iconFaint : c.accent} strokeWidth={2.25} />
      )}
    </View>
    <View style={styles.actionCopy}>
      <Text style={[styles.actionTitle, disabled && styles.actionTitleDisabled]}>{title}</Text>
      <Text style={styles.actionSubtitle} numberOfLines={1}>
        {subtitle}
      </Text>
    </View>
    {disabled ? null : <Text style={styles.actionChevron}>›</Text>}
  </TouchableOpacity>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: NAV_BAR_HEIGHT,
    zIndex: 35,
    backgroundColor: c.sheet,
    paddingHorizontal: 16,
  },
  header: {},
  pullBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.borderStrong,
    alignSelf: 'center',
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    color: c.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  closeBtn: { padding: 6 },
  closeText: { color: c.textMuted, fontSize: 16 },
  scroll: { flex: 1 },
  scrollContent: { gap: 14, paddingBottom: 24 },
  liveBanner: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.accent,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  liveBannerTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
  liveBannerSub: { color: c.textSecondary, fontSize: 12 },
  offlineNote: { color: c.amber, fontSize: 12, lineHeight: 17 },
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    gap: 10,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  photoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: c.accent,
    backgroundColor: c.base,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: '100%', height: '100%' },
  photoInitial: { color: c.accent, fontSize: 22, fontWeight: '800' },
  titleCopy: { flex: 1, gap: 6, alignItems: 'flex-start' },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, alignSelf: 'stretch' },
  pointTitle: { flex: 1, color: c.text, fontSize: 17, fontWeight: '800' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: c.accentBorder,
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
  },
  editText: { color: c.accent, fontSize: 12, fontWeight: '800' },
  editBtnDisabled: { borderColor: c.border, backgroundColor: 'transparent' },
  editTextDisabled: { color: c.iconFaint },
  statusChip: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailText: { flex: 1, color: c.textSecondary, fontSize: 13 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.borderStrong,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  tagText: { color: c.accentSoft, fontSize: 12, fontWeight: '700' },
  description: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, flex: 1 },
  sectionCount: { color: c.accent, fontSize: 12, fontWeight: '800' },
  kindRow: { flexDirection: 'row', gap: 6 },
  kindTab: {
    flex: 1,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.base,
  },
  kindTabSelected: { backgroundColor: c.accent, borderColor: c.accentSoft },
  kindText: { color: c.textMuted, fontSize: 12, fontWeight: '800' },
  kindTextSelected: { color: c.onAccent },
  hint: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: c.base,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  addBtn: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: c.onAccent, fontSize: 13, fontWeight: '800' },
  errorText: { color: c.amber, fontSize: 11, fontWeight: '600' },
  inviteChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inviteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.base,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  inviteChipText: { color: c.text, fontSize: 12, fontWeight: '700' },
  inviteChipRemove: { color: c.red, fontSize: 12, fontWeight: '800' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.base,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: { flex: 1, gap: 2 },
  actionTitle: { color: c.text, fontSize: 14, fontWeight: '700' },
  actionSubtitle: { color: c.textMuted, fontSize: 12 },
  actionRowDisabled: { opacity: 0.6 },
  actionIconDisabled: { backgroundColor: 'rgba(71, 85, 105, 0.15)' },
  actionTitleDisabled: { color: c.textFaint },
  goingCount: { color: c.green },
  pendingChip: { borderColor: c.amberBorder },
  pendingText: { color: c.amber, fontSize: 10, fontWeight: '800' },
  actionChevron: { color: c.iconFaint, fontSize: 22, fontWeight: '300' },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.red,
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
  },
  againBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: c.accent,
  },
  againBtnText: { color: c.base, fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
  endBtnText: { color: c.red, fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  confirmCard: {
    alignSelf: 'stretch',
    backgroundColor: c.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.border,
    padding: 18,
    gap: 10,
  },
  confirmTitle: { color: c.text, fontSize: 17, fontWeight: '800' },
  confirmBody: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
  confirmButtons: { flexDirection: 'row', gap: 10, marginTop: 6 },
  confirmBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmKeep: { borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.base },
  confirmKeepText: { color: c.text, fontSize: 14, fontWeight: '700' },
  confirmEnd: { backgroundColor: c.danger },
  confirmEndText: { color: c.white, fontSize: 14, fontWeight: '800' },
  notice: { color: c.green, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  noticeWarn: { color: c.amber },
});
