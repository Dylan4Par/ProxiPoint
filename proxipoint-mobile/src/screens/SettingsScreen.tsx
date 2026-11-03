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
import { appVersionLabel } from '../lib/appVersion';
import {
  BookOpen,
  Camera,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  HelpCircle,
  Home,
  LifeBuoy,
  Lock,
  LogOut,
  Mail,
  Minus,
  Pencil,
  Plug,
  Plus,
  Shield,
  SlidersHorizontal,
  Trash2,
  UserX,
  Users,
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
import { CityPickerSheet } from '../components/discovery/CityPicker';
import { cityLabel, type CityPlace } from '../lib/places';
import { formatRangeWords, nearestReach, searchRanges } from '../lib/units';
import { MAP_STYLE_OPTIONS } from '../lib/mapStyle';
import { AuthError } from '../services/authApi';
import { authErrorMessage } from '../lib/authForm';

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
  /** App settings → Default home area: the app's default area's name, while no home city is set. */
  defaultAreaLabel?: string;
  onChangeHomeCity?: (city: CityPlace) => void;
}

const ROWS: Array<{ id: SectionId; label: string; Icon: LucideIcon }> = [
  { id: 'edit', label: 'Edit profile', Icon: Pencil },
  { id: 'app', label: 'App settings', Icon: SlidersHorizontal },
  { id: 'privacy', label: 'Privacy', Icon: Shield },
  { id: 'plans', label: 'Plans & Purchases', Icon: CreditCard },
  { id: 'integrations', label: 'Integrations', Icon: Plug },
  { id: 'faqs', label: 'FAQs', Icon: HelpCircle },
  { id: 'help', label: 'Help', Icon: LifeBuoy },
];

/** "ProxiPoint v1.0.0 (Build 1)", from app.json (ios.buildNumber / android.versionCode). */
const APP_VERSION_LABEL = appVersionLabel(
  Constants.expoConfig?.version,
  Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : Constants.expoConfig?.android?.versionCode,
);

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
  defaultAreaLabel = 'Default area',
  onChangeHomeCity,
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

        {ROWS.map(({ id, label, Icon }) => {
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
                {/* Every row opens in place: + to open, − to close. */}
                {isOpen ? (
                  <Minus size={18} color={c.textMuted} strokeWidth={2.25} />
                ) : (
                  <Plus size={18} color={c.textMuted} strokeWidth={2.25} />
                )}
              </TouchableOpacity>

              {isOpen ? (
                <View style={styles.panel}>
                  {id === 'edit' ? (
                    <>
                      <EditProfile
                        profile={profile}
                        onSave={(next) => {
                          onSaveProfile(next);
                          toggle('edit');
                        }}
                      />
                      <View style={styles.subDivider} />
                      <ContactDetails settings={settings} onChange={onChangeSettings} />
                    </>
                  ) : null}
                  {id === 'app' ? (
                    <>
                      <AppearancePicker />
                      {onChangeHomeCity ? (
                        <DefaultHomeArea
                          homeCity={profile.homeCity}
                          defaultAreaLabel={defaultAreaLabel}
                          trackLocation={profile.trackLocation}
                          onChange={onChangeHomeCity}
                        />
                      ) : null}
                      <ReachPicker
                        units={settings.units}
                        value={settings.defaultReachMeters}
                        onChange={(meters) => set('defaultReachMeters', meters)}
                      />
                      <View style={{ gap: 6 }} testID="settings-map-style">
                        <Text style={styles.toggleLabel}>Default map style</Text>
                        <View style={styles.segment}>
                          {MAP_STYLE_OPTIONS.map((option) => {
                            const selected = settings.mapStyle === option.id;
                            return (
                              <TouchableOpacity
                                key={option.id}
                                style={[styles.segmentItem, selected && styles.segmentSelected]}
                                onPress={() => set('mapStyle', option.id)}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                testID={`settings-map-style-${option.id}`}
                              >
                                <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <Text style={styles.note}>
                          {settings.mapStyle === 'auto'
                            ? 'The map follows Appearance: light or dark with the rest of the app.'
                            : `The map stays ${settings.mapStyle}, whatever the app’s Appearance.`}
                        </Text>
                      </View>
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
                              onPress={() =>
                                // The default reach moves to the nearest choice in the new units.
                                onChangeSettings({
                                  ...settings,
                                  units: unit,
                                  defaultReachMeters: nearestReach(settings.defaultReachMeters, unit),
                                })
                              }
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
                      <BlockedPeople />
                      <AccountActions />
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
                      <PhotoRulesRow />
                      <HelpRow
                        Icon={FileText}
                        title="Terms of Service"
                        body="The rules for using ProxiPoint."
                        onPress={() => setReading('terms')}
                        testID="settings-terms"
                      />
                      <HelpRow
                        Icon={Lock}
                        title="Privacy Policy"
                        body="What we collect, why, and the choices you have."
                        onPress={() => setReading('privacy')}
                        testID="settings-privacy-policy"
                      />
                      <HelpRow
                        Icon={Users}
                        title="Community Guidelines"
                        body="What’s okay to post, and how reports work."
                        onPress={() => setReading('guidelines')}
                        testID="settings-guidelines"
                      />
                      <Text style={styles.versionLine} selectable testID="settings-app-version">
                        {APP_VERSION_LABEL}
                      </Text>
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

/** Settings → App settings → Default home area: where Discover opens when it isn't following you. */
const DefaultHomeArea: React.FC<{
  homeCity: CityPlace | null;
  defaultAreaLabel: string;
  trackLocation: boolean;
  onChange: (city: CityPlace) => void;
}> = ({ homeCity, defaultAreaLabel, trackLocation, onChange }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [picking, setPicking] = useState(false);
  return (
    <>
      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => setPicking(true)}
        accessibilityRole="button"
        accessibilityLabel={`Default home area: ${homeCity ? cityLabel(homeCity) : defaultAreaLabel}. Change`}
        testID="settings-home-area"
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.toggleLabel}>Default home area</Text>
          <Text style={styles.valueText} numberOfLines={1}>
            {homeCity ? cityLabel(homeCity) : `${defaultAreaLabel} (default)`}
          </Text>
          <Text style={styles.note}>
            {trackLocation
              ? 'Discover follows your location; it opens here when Follow my location is off (Profile).'
              : 'Where Discover and Explore Map open.'}
          </Text>
        </View>
        <Home size={18} color={c.accent} strokeWidth={2.25} />
      </TouchableOpacity>
      <CityPickerSheet
        visible={picking}
        title="Default home area"
        onClose={() => setPicking(false)}
        onPick={(place) => {
          setPicking(false);
          onChange(place);
        }}
      />
    </>
  );
};

/** Settings → App settings → Default radar reach: Discover's distance when the app opens. */
const ReachPicker: React.FC<{
  units: MySettings['units'];
  value: number | null;
  onChange: (meters: number | null) => void;
}> = ({ units, value, onChange }) => {
  const styles = useThemedStyles(createStyles);
  const options = searchRanges(units);
  return (
    <View style={{ gap: 6 }} testID="settings-reach">
      <Text style={styles.toggleLabel}>Default radar reach</Text>
      <View style={styles.choiceWrap}>
        {options.map((option) => {
          const selected = option.meters === value;
          return (
            <TouchableOpacity
              key={option.label}
              style={[styles.choiceChip, selected && styles.segmentSelected]}
              onPress={() => onChange(option.meters)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`settings-reach-${option.meters ?? 'any'}`}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                {option.meters == null ? 'Any distance' : formatRangeWords(option.meters, units)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.note}>How far Discover looks when the app opens. Change it any time from Discover’s distance button.</Text>
    </View>
  );
};

/** Settings → Privacy → Disable account / Delete account. */
const AccountActions: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const disableAccount = useAuthStore((s) => s.disableAccount);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const failed = (e: unknown) => {
    setBusy(false);
    setError(e instanceof AuthError ? authErrorMessage(e.code) : 'Something went wrong. Try again.');
  };
  const confirmDisable = () =>
    Alert.alert(
      'Disable your account?',
      'Your profile, Points, posts and comments are hidden and nobody can find or invite you. Sign back in any time to turn it back on.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            setError('');
            disableAccount().catch(failed);
          },
        },
      ],
    );
  const canDelete = typed.trim().toUpperCase() === 'DELETE' && password.length > 0 && !busy;
  const runDelete = () => {
    if (!canDelete) return;
    setBusy(true);
    setError('');
    deleteAccount(password).catch(failed);
  };
  return (
    <View style={styles.accountBlock} testID="settings-account-actions">
      <Text style={styles.toggleLabel}>Account</Text>
      <TouchableOpacity style={styles.toggleRow} onPress={confirmDisable} disabled={busy} accessibilityRole="button" testID="settings-disable-account">
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.dangerLabel}>Disable account</Text>
          <Text style={styles.note}>Hide your profile and everything you’ve posted. Signing back in turns it back on.</Text>
        </View>
        <UserX size={18} color={c.amber} strokeWidth={2.25} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setDeleting((open) => !open);
          setError('');
        }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ expanded: deleting }}
        testID="settings-delete-account"
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.dangerLabel, styles.deleteLabel]}>Delete account</Text>
          <Text style={styles.note}>Permanently remove your account, profile, Points, posts, comments and photos.</Text>
        </View>
        <Trash2 size={18} color={c.red} strokeWidth={2.25} />
      </TouchableOpacity>
      {deleting ? (
        <View style={styles.deleteBox} testID="settings-delete-confirm">
          <Text style={styles.note}>This can’t be undone. Your email and @handle become free for anyone to use.</Text>
          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setError('');
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Your password"
            placeholderTextColor={c.textFaint}
            style={styles.input}
            testID="settings-delete-password"
          />
          <Text style={styles.fieldLabel}>Type DELETE to confirm</Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            placeholderTextColor={c.textFaint}
            style={styles.input}
            testID="settings-delete-typed"
          />
          <TouchableOpacity
            style={[styles.deleteBtn, !canDelete && styles.saveBtnOff]}
            onPress={runDelete}
            disabled={!canDelete}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canDelete }}
            testID="settings-delete-go"
          >
            <Text style={styles.saveText}>{busy ? 'DELETING…' : 'DELETE MY ACCOUNT'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
};

/** Settings → Edit profile → Contact details: what the Contact button on your public profile shares. */
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
  const [policy, setPolicy] = useState(getPhotoPolicyState());
  React.useEffect(() => subscribePhotoPolicy(() => setPolicy(getPhotoPolicyState())), []);
  const agreed = policy.acceptedVersion === PHOTO_POLICY_VERSION;
  // Settings → Help, styled like the other Help rows.
  return (
    <HelpRow
      Icon={Camera}
      title="Photo rules"
      body={agreed ? 'You’ve agreed to the current rules.' : 'You’ll be asked to agree before your first photo.'}
      onPress={openPhotoPolicy}
      testID="settings-photo-rules"
    />
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
  const version = APP_VERSION_LABEL;
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
  panel: { paddingBottom: 18, paddingLeft: 37, gap: 10 },
  contactBlock: { gap: 8 },
  subDivider: { height: 1, backgroundColor: c.border, marginVertical: 6 },
  valueText: { color: c.accent, fontSize: 13, fontWeight: '700' },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  accountBlock: { gap: 8, marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border },
  dangerLabel: { color: c.amber, fontSize: 14, fontWeight: '700' },
  deleteLabel: { color: c.red },
  deleteBox: { gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.red },
  deleteBtn: { marginTop: 4, backgroundColor: c.red, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  fieldLabel: { color: c.textMuted, fontSize: 12, fontWeight: '700', marginTop: 4 },
  note: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
  versionLine: { color: c.textFaint, fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 8, marginLeft: -37 },
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
