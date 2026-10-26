import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Image,
  LayoutAnimation,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  HelpCircle,
  LifeBuoy,
  LogOut,
  Mail,
  Minus,
  Pencil,
  Plug,
  Plus,
  Shield,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react-native';
import { profileInitial, type MyProfile, type MySettings } from '../lib/myProfile';
import { getPhotoPolicyState, openPhotoPolicy, PHOTO_POLICY_VERSION, subscribePhotoPolicy, SUPPORT_EMAIL } from '../lib/photoPolicy';
import { getBlockedHandles, unblockUser, useModeration } from '../lib/moderation';
import { NAME_CHANGED_AT_KEY, nameCooldown, waitLabel } from '../lib/nameCooldown';
import { OFFENSIVE_MESSAGE, containsOffensive } from '../lib/profanity';
import { useTheme, useThemedStyles, type ThemeColors, type ThemePreference } from '../theme/ThemeContext';
import { KeyboardAwareScrollView } from '../components/common/KeyboardAwareScrollView';
import { CallSignMark } from '../components/brand/CallSignMark';
import { LegalDocModal } from '../components/auth/LegalDocModal';
import type { LegalDocId } from '../lib/legal';
import { useAuthStore } from '../stores/useAuthStore';

/**
 * Fills the parent edge to edge. Written out by hand because StyleSheet.absoluteFillObject
 * was removed in newer React Native, which silently drops the positioning.
 */
const ABS_FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

// LayoutAnimation works on Android without any setup on the New Architecture.

type SectionId = 'edit' | 'app' | 'privacy' | 'plans' | 'integrations' | 'faqs' | 'help';

interface SettingsScreenProps {
  profile: MyProfile;
  settings: MySettings;
  onBack: () => void;
  onViewProfile: () => void;
  onSaveProfile: (profile: MyProfile) => void;
  onChangeSettings: (settings: MySettings) => void;
  /** Open straight to a section, e.g. 'edit' from the Profile page's Edit button. */
  initialSection?: SectionId | null;
  /** Help → App guide: closes Settings and runs the Explore Map tour again. */
  onReplayTour?: () => void;
}

const ROWS: Array<{ id: SectionId; label: string; Icon: LucideIcon; kind: 'page' | 'expand' }> = [
  { id: 'edit', label: 'Edit profile', Icon: Pencil, kind: 'page' },
  { id: 'app', label: 'App settings', Icon: SlidersHorizontal, kind: 'expand' },
  { id: 'privacy', label: 'Privacy', Icon: Shield, kind: 'expand' },
  { id: 'plans', label: 'Plans & Purchases', Icon: CreditCard, kind: 'expand' },
  { id: 'integrations', label: 'Integrations', Icon: Plug, kind: 'expand' },
  { id: 'faqs', label: 'FAQs', Icon: HelpCircle, kind: 'page' },
  { id: 'help', label: 'Help', Icon: LifeBuoy, kind: 'expand' },
];

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'What’s a Point?',
    a: 'A Point is an event you drop on the map: a title, a place, a time and the people you want there.',
  },
  {
    q: 'What’s a beacon?',
    a: 'The beacon is how far your Point reaches. People inside it who match your visibility (Tag Network or Public) can find it. Private Points have no beacon and only reach invitees.',
  },
  {
    q: 'Who sees my exact location?',
    a: 'With Location privacy on, others see only the area you chose. The exact spot is shown to you, your co-hosts and confirmed guests.',
  },
  {
    q: 'Can I change a Point after dropping it?',
    a: 'Title, tags, description, photo and times can be edited from My Drops. Location, visibility and privacy stay fixed so guests aren’t surprised.',
  },
];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  profile,
  settings,
  onBack,
  onViewProfile,
  onSaveProfile,
  onChangeSettings,
  initialSection = null,
  onReplayTour,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<SectionId | null>(initialSection);

  const toggle = (id: SectionId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((current) => (current === id ? null : id));
  };

  const accountEmail = useAuthStore((s) => s.session?.account.email ?? null);
  const [reading, setReading] = useState<LegalDocId | null>(null);
  const signOut = useAuthStore((s) => s.signOut);
  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You can sign back in any time with your email and password.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  const set = <K extends keyof MySettings>(key: K, value: MySettings[K]) =>
    onChangeSettings({ ...settings, [key]: value });

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 8 }]} testID="settings-screen">
      <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityRole="button" testID="settings-back">
        <ChevronLeft size={20} color={c.text} strokeWidth={2.5} />
        <Text style={styles.backText}>SETTINGS</Text>
      </TouchableOpacity>

      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            {profile.avatarUri ? (
              <Image source={{ uri: profile.avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitial}>{profileInitial(profile)}</Text>
            )}
          </View>
          <Text style={styles.profileName} numberOfLines={1}>
            {profile.displayName}
          </Text>
          <TouchableOpacity onPress={onViewProfile} accessibilityRole="button" testID="settings-view-profile">
            <Text style={styles.viewProfile}>VIEW PROFILE</Text>
          </TouchableOpacity>
        </View>

        {ROWS.map(({ id, label, Icon, kind }) => {
          const isOpen = open === id;
          return (
            <View key={id} style={styles.section}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => toggle(id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                testID={`settings-${id}`}
              >
                <Icon size={21} color={c.textSecondary} strokeWidth={2} />
                <Text style={styles.rowLabel}>{label}</Text>
                {kind === 'page' ? (
                  <View style={isOpen ? styles.chevronOpen : null}>
                    <ChevronRight size={18} color={c.textMuted} strokeWidth={2.25} />
                  </View>
                ) : isOpen ? (
                  <Minus size={18} color={c.textMuted} strokeWidth={2.25} />
                ) : (
                  <Plus size={18} color={c.textMuted} strokeWidth={2.25} />
                )}
              </TouchableOpacity>

              {isOpen ? (
                <View style={styles.panel}>
                  {id === 'edit' ? (
                    <EditProfile
                      profile={profile}
                      onSave={(next) => {
                        onSaveProfile(next);
                        toggle('edit');
                      }}
                    />
                  ) : null}
                  {id === 'app' ? (
                    <>
                      <AppearancePicker />
                      <ToggleRow
                        label="Notifications"
                        hint="RSVPs, invites and changes to Points you’re going to."
                        value={settings.notifications}
                        onChange={(value) => set('notifications', value)}
                      />
                      <Text style={styles.fieldLabel}>Distance units</Text>
                      <View style={styles.segment}>
                        {(['metric', 'imperial'] as const).map((unit) => {
                          const selected = settings.units === unit;
                          return (
                            <TouchableOpacity
                              key={unit}
                              style={[styles.segmentItem, selected && styles.segmentSelected]}
                              onPress={() => set('units', unit)}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                            >
                              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                                {unit === 'metric' ? 'Meters / km' : 'Feet / miles'}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <Text style={styles.note}>Animations follow your phone’s Reduce motion setting.</Text>
                    </>
                  ) : null}
                  {id === 'privacy' ? (
                    <>
                      <ToggleRow
                        label="Hide exact location by default"
                        hint="New Points start with Location privacy on."
                        value={settings.hideExactLocationByDefault}
                        onChange={(value) => set('hideExactLocationByDefault', value)}
                      />
                      <ToggleRow
                        label="Let people find me by @handle"
                        hint="Turn off to only get invites from people you follow."
                        value={settings.findableByHandle}
                        onChange={(value) => set('findableByHandle', value)}
                      />
                      <ContactDetails settings={settings} onChange={onChangeSettings} />
                      <PhotoRulesRow />
                      <BlockedPeople />
                    </>
                  ) : null}
                  {id === 'plans' ? (
                    <>
                      <View style={styles.planCard}>
                        <Text style={styles.planName}>Free</Text>
                        <Text style={styles.note}>Drop unlimited Points. Paid plans aren’t available yet.</Text>
                      </View>
                      <Text style={styles.note}>No purchases yet.</Text>
                    </>
                  ) : null}
                  {id === 'integrations' ? (
                    <>
                      <InfoRow title="Calendar" body="Add to calendar uses your phone’s calendar app." status="Ready" />
                      <InfoRow title="Messages" body="Text invitees opens your phone’s messaging app." status="Ready" />
                      <InfoRow title="Apple & Google sign-in" body="Sign in with an existing account." status="Coming soon" />
                      <InfoRow
                        title="Discord & LinkedIn"
                        body="Post your Points as events automatically."
                        status="Coming soon"
                      />
                    </>
                  ) : null}
                  {id === 'help' ? (
                    <>
                      {onReplayTour ? (
                        <HelpRow
                          Icon={BookOpen}
                          title="App guide"
                          body="A quick walk through Explore Map: creating a Point, tags, the map and your Profile."
                          onPress={onReplayTour}
                          testID="settings-app-guide"
                        />
                      ) : null}
                      <HelpRow
                        Icon={Mail}
                        title="Contact support"
                        body={`Email ${SUPPORT_EMAIL}. We usually reply within a couple of days.`}
                        onPress={() => void contactSupport(accountEmail)}
                        testID="settings-contact-support"
                      />
                    </>
                  ) : null}
                  {id === 'faqs'
                    ? FAQS.map((item) => (
                        <View key={item.q} style={styles.faq}>
                          <Text style={styles.faqQ}>{item.q}</Text>
                          <Text style={styles.note}>{item.a}</Text>
                        </View>
                      ))
                    : null}
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={styles.account}>
          {accountEmail ? <Text style={styles.accountEmail}>Signed in as {accountEmail}</Text> : null}
          <TouchableOpacity
            style={styles.signOut}
            onPress={confirmSignOut}
            accessibilityRole="button"
            testID="settings-sign-out"
          >
            <LogOut size={18} color={c.red} strokeWidth={2.2} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
          <View style={styles.legalLinks}>
            {(
              [
                ['terms', 'Terms'],
                ['privacy', 'Privacy'],
                ['guidelines', 'Community Guidelines'],
              ] as Array<[LegalDocId, string]>
            ).map(([id, label]) => (
              <TouchableOpacity key={id} onPress={() => setReading(id)} accessibilityRole="link" hitSlop={6}>
                <Text style={styles.legalLink}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <CallSignMark />
        </View>
      </KeyboardAwareScrollView>
      <LegalDocModal doc={reading} onChange={setReading} onClose={() => setReading(null)} />
    </View>
  );
};

/** Settings → Privacy → Contact: what the Contact button on your public profile shares. */
const ContactDetails: React.FC<{ settings: MySettings; onChange: (settings: MySettings) => void }> = ({
  settings,
  onChange,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [email, setEmail] = useState(settings.contactEmail);
  const [phone, setPhone] = useState(settings.contactPhone);
  const save = () => onChange({ ...settings, contactEmail: email.trim(), contactPhone: phone.trim() });
  const hasAny = Boolean(settings.contactEmail || settings.contactPhone);
  return (
    <View style={styles.contactBlock}>
      <Text style={styles.toggleLabel}>Contact details</Text>
      <Text style={styles.note}>Shown by the Contact button on your public profile.</Text>
      <Text style={styles.fieldLabel}>Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        onEndEditing={save}
        placeholder="you@example.com"
        placeholderTextColor={c.textFaint}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        testID="settings-contact-email"
      />
      <Text style={styles.fieldLabel}>Phone</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        onEndEditing={save}
        placeholder="(303) 555-0100"
        placeholderTextColor={c.textFaint}
        keyboardType="phone-pad"
        style={styles.input}
        testID="settings-contact-phone"
      />
      <ToggleRow
        label="Show contact on my profile"
        hint={
          settings.contactPublic
            ? 'Anyone who opens your profile can email, call or text you.'
            : 'Private: people send a contact request and you choose who gets your details.'
        }
        value={settings.contactPublic}
        onChange={(value) => onChange({ ...settings, contactEmail: email.trim(), contactPhone: phone.trim(), contactPublic: value })}
      />
      {!hasAny ? <Text style={styles.note}>Add an email or phone number to turn on the Contact button.</Text> : null}
    </View>
  );
};

const EditProfile: React.FC<{ profile: MyProfile; onSave: (profile: MyProfile) => void }> = ({ profile, onSave }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [name, setName] = useState(profile.displayName);
  const [error, setError] = useState('');
  // One name change every 72 hours (the time of the last one is kept on the phone).
  const [changedAt, setChangedAt] = useState<string | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(NAME_CHANGED_AT_KEY)
      .then(setChangedAt)
      .catch(() => undefined);
  }, []);
  const cooldown = nameCooldown(changedAt);
  const locked = !cooldown.allowed;
  const unchanged = name.trim() === profile.displayName.trim();

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Add a name.');
      return;
    }
    if (unchanged) return;
    if (locked) {
      setError('You changed your name recently. Try again later.');
      return;
    }
    if (containsOffensive(trimmed)) {
      setError(OFFENSIVE_MESSAGE);
      return;
    }
    // Server side: PATCH /me (and it should refuse a second change within 72 hours).
    // Photo and bio are edited on the Profile page itself.
    const now = new Date();
    setChangedAt(now.toISOString());
    AsyncStorage.setItem(NAME_CHANGED_AT_KEY, now.toISOString()).catch(() => undefined);
    onSave({ ...profile, displayName: trimmed });
  };

  return (
    <>
      <Text style={styles.fieldLabel}>Name</Text>
      <TextInput
        value={name}
        onChangeText={(value) => {
          setName(value);
          setError('');
        }}
        placeholder="Your name"
        placeholderTextColor={c.textFaint}
        style={[styles.input, locked && styles.inputLocked]}
        editable={!locked}
        maxLength={40}
        testID="settings-edit-name"
      />
      {locked && cooldown.availableAt ? (
        <Text style={styles.cooldownNote} testID="settings-name-cooldown">
          You can change your name again {waitLabel(cooldown.availableAt)} (
          {cooldown.availableAt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })},{' '}
          {cooldown.availableAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}).
        </Text>
      ) : (
        <Text style={styles.note}>You can change your name once every 72 hours.</Text>
      )}
      <Text style={styles.note}>Your handle {profile.handle} stays the same. Change your photo and bio on your Profile page.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        style={[styles.saveBtn, (locked || unchanged) && styles.saveBtnOff]}
        onPress={save}
        disabled={locked || unchanged}
        accessibilityRole="button"
        accessibilityState={{ disabled: locked || unchanged }}
        testID="settings-edit-save"
      >
        <Text style={styles.saveText}>SAVE PROFILE</Text>
      </TouchableOpacity>
    </>
  );
};

/** Settings → App settings → Appearance: Match phone / Dark / Light. */
const APPEARANCE_OPTIONS: Array<{ id: ThemePreference; label: string }> = [
  { id: 'system', label: 'Match phone' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

const AppearancePicker: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { preference, setPreference, mode } = useTheme();
  return (
    <View style={{ gap: 6 }} testID="settings-appearance">
      <Text style={styles.toggleLabel}>Appearance</Text>
      <View style={styles.segment}>
        {APPEARANCE_OPTIONS.map((option) => {
          const selected = preference === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.segmentItem, selected && styles.segmentSelected]}
              onPress={() => setPreference(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`settings-appearance-${option.id}`}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.note}>
        {preference === 'system'
          ? `Following your phone (${mode === 'light' ? 'light' : 'dark'} right now).`
          : preference === 'light'
            ? 'Day mode: light screens and a light map.'
            : 'Night mode: dark screens and a dark map.'}
      </Text>
    </View>
  );
};

/** Link to the full photo rules, with whether you've agreed to the current version. */
const PhotoRulesRow: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [policy, setPolicy] = useState(getPhotoPolicyState());
  React.useEffect(() => subscribePhotoPolicy(() => setPolicy(getPhotoPolicyState())), []);
  const agreed = policy.acceptedVersion === PHOTO_POLICY_VERSION;
  return (
    <TouchableOpacity style={styles.toggleRow} onPress={openPhotoPolicy} accessibilityRole="button" testID="settings-photo-rules">
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.toggleLabel}>Photo rules</Text>
        <Text style={styles.note}>
          {agreed ? 'You’ve agreed to the current rules.' : 'You’ll be asked to agree before your first photo.'}
        </Text>
      </View>
      <ChevronRight size={18} color={c.textMuted} strokeWidth={2.25} />
    </TouchableOpacity>
  );
};

/** People you've blocked, with Unblock. */
const BlockedPeople: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  useModeration();
  const blocked = getBlockedHandles();
  return (
    <View style={{ gap: 6 }} testID="settings-blocked">
      <Text style={styles.toggleLabel}>Blocked people</Text>
      {blocked.length === 0 ? (
        <Text style={styles.note}>No one. Block someone from Report on their Point or recap.</Text>
      ) : (
        blocked.map((handle) => (
          <View key={handle} style={styles.blockedRow}>
            <Text style={styles.blockedHandle}>{handle}</Text>
            <TouchableOpacity onPress={() => unblockUser(handle)} accessibilityRole="button" accessibilityLabel={`Unblock ${handle}`}>
              <Text style={styles.unblockText}>Unblock</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
};

const ToggleRow: React.FC<{ label: string; hint: string; value: boolean; onChange: (value: boolean) => void }> = ({
  label,
  hint,
  value,
  onChange,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
  <View style={styles.toggleRow}>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Text style={styles.note}>{hint}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: c.borderStrong, true: c.accentTrack }}
      thumbColor={value ? c.accent : c.textMuted}
      accessibilityLabel={label}
    />
  </View>
  );
};

const InfoRow: React.FC<{ title: string; body: string; status: 'Ready' | 'Coming soon' }> = ({ title, body, status }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
  <View style={styles.toggleRow}>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={styles.toggleLabel}>{title}</Text>
      <Text style={styles.note}>{body}</Text>
    </View>
    <View style={[styles.statusPill, status === 'Ready' ? styles.statusReady : styles.statusSoon]}>
      <Text style={[styles.statusPillText, { color: status === 'Ready' ? c.green : c.textMuted }]}>{status}</Text>
    </View>
  </View>
  );
};

/**
 * Opens an email to support with the app version and device filled in.
 * Without a mail app, shows the address so it can be copied.
 */
async function contactSupport(accountEmail: string | null): Promise<void> {
  const version = Constants.expoConfig?.version ?? 'unknown';
  const body = [
    '',
    '',
    '— Please keep the details below, they help us look into it —',
    `App version: ${version}`,
    `Device: ${Platform.OS} ${String(Platform.Version)}`,
    accountEmail ? `Account: ${accountEmail}` : null,
  ]
    .filter((line) => line != null)
    .join('\n');
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('ProxiPoint support')}&body=${encodeURIComponent(body)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Contact support', `Email us at ${SUPPORT_EMAIL}`);
  }
}

const HelpRow: React.FC<{
  Icon: LucideIcon;
  title: string;
  body: string;
  onPress: () => void;
  testID: string;
}> = ({ Icon, title, body, onPress, testID }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity style={styles.helpRow} onPress={onPress} accessibilityRole="button" testID={testID}>
      <View style={styles.helpIcon}>
        <Icon size={18} color={c.accent} strokeWidth={2.25} />
      </View>
      <View style={styles.helpCopy}>
        <Text style={styles.faqQ}>{title}</Text>
        <Text style={styles.note}>{body}</Text>
      </View>
      <ChevronRight size={18} color={c.textMuted} strokeWidth={2.25} />
    </TouchableOpacity>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  overlay: {
    ...ABS_FILL,
    zIndex: 51, // above the Profile page and the nav bar
    backgroundColor: c.base,
    paddingHorizontal: 16,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, alignSelf: 'flex-start' },
  backText: { color: c.text, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
  scroll: { flex: 1 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: c.accent,
    backgroundColor: c.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { color: c.accent, fontSize: 22, fontWeight: '800' },
  profileName: { flex: 1, color: c.text, fontSize: 19, fontWeight: '800' },
  viewProfile: {
    color: c.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    borderBottomWidth: 2,
    borderBottomColor: c.accent,
    paddingBottom: 2,
  },
  section: { borderBottomWidth: 1, borderBottomColor: c.border },
  account: { alignItems: 'center', gap: 12, paddingTop: 28, paddingHorizontal: 16 },
  accountEmail: { color: c.textMuted, fontSize: 13 },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.border,
  },
  signOutText: { color: c.red, fontSize: 15, fontWeight: '700' },
  legalLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: 4 },
  legalLink: { color: c.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 18 },
  rowLabel: { flex: 1, color: c.text, fontSize: 16, fontWeight: '500' },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  panel: { paddingBottom: 18, paddingLeft: 37, gap: 10 },
  contactBlock: { gap: 8 },
  fieldLabel: { color: c.textMuted, fontSize: 12, fontWeight: '700', marginTop: 4 },
  note: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
  cooldownNote: { color: c.accent, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  inputLocked: { opacity: 0.55 },
  saveBtnOff: { opacity: 0.45 },
  input: {
    backgroundColor: c.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  blockedHandle: { color: c.text, fontSize: 14, fontWeight: '600' },
  unblockText: { color: c.accent, fontSize: 13, fontWeight: '800' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { color: c.text, fontSize: 14, fontWeight: '600' },
  segment: { flexDirection: 'row', gap: 6 },
  segmentItem: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: { backgroundColor: c.accent, borderColor: c.accentSoft },
  segmentText: { color: c.textMuted, fontSize: 12, fontWeight: '800' },
  segmentTextSelected: { color: c.onAccent },
  planCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    padding: 12,
    gap: 4,
  },
  planName: { color: c.text, fontSize: 15, fontWeight: '800' },
  statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusReady: { backgroundColor: 'rgba(52, 211, 153, 0.14)' },
  statusSoon: { backgroundColor: 'rgba(148, 163, 184, 0.12)' },
  statusPillText: { fontSize: 10, fontWeight: '800' },
  faq: { gap: 3 },
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  helpIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpCopy: { flex: 1, gap: 2 },
  faqQ: { color: c.text, fontSize: 14, fontWeight: '700' },
  error: { color: c.amber, fontSize: 12, fontWeight: '600' },
  saveBtn: {
    marginTop: 4,
    backgroundColor: c.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveText: { color: c.base, fontSize: 13, fontWeight: '900', letterSpacing: 1.1 },
});
