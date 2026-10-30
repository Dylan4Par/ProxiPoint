import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Bell, Camera, Check, LocateFixed, MapPin, X } from 'lucide-react-native';
import { AuthButton, AuthError, AuthField, AuthPage, AuthTitle } from '../../components/auth/AuthParts';
import { CircleCropHost } from '../../components/common/CircleCropHost';
import { CityPickerSheet } from '../../components/discovery/CityPicker';
import { PhotoPolicyHost } from '../../components/safety/PhotoPolicyHost';
import {
  ONBOARDING_STEPS,
  STARTER_INTERESTS,
  authErrorMessage,
  cleanDisplayName,
  cleanHandle,
  handleProblem,
  isValidDisplayName,
  suggestHandle,
  toggleInterest,
  type OnboardingStep,
} from '../../lib/authForm';
import { pickCoverPhoto } from '../../lib/coverPhoto';
import { INTEREST_TAG_LIMIT } from '../../lib/myProfile';
import { cityLabel, type CityPlace } from '../../lib/places';
import { AuthError as ApiError, handleAvailable } from '../../services/authApi';
import { useAuthStore } from '../../stores/useAuthStore';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * New accounts land here once, before Discover: a name and @handle (required), a home area and
 * #interests (both skippable), then privacy choices, all off except notifications. Everything can
 * be changed later in Settings.
 */
export const OnboardingScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const session = useAuthStore((s) => s.session);
  const finishOnboarding = useAuthStore((s) => s.finishOnboarding);
  const signOut = useAuthStore((s) => s.signOut);

  const [stepIndex, setStepIndex] = useState(0);
  const step = ONBOARDING_STEPS[stepIndex];

  const [displayName, setDisplayName] = useState(session?.account.displayName ?? '');
  const [handle, setHandle] = useState(session?.account.handle ?? '');
  // Until you edit the handle yourself, it follows your name.
  const [handleEdited, setHandleEdited] = useState(!!session?.account.handle);
  const [handleState, setHandleState] = useState<'idle' | 'checking' | 'free' | 'taken'>('idle');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [homeCity, setHomeCity] = useState<CityPlace | null>(null);
  const [pickingCity, setPickingCity] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [trackLocation, setTrackLocation] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Handle availability (debounced) -----------------------------------------------------
  const problem = handle ? handleProblem(handle) : null;
  const checkSeq = useRef(0);
  useEffect(() => {
    if (!handle || problem) {
      setHandleState('idle');
      return;
    }
    const seq = (checkSeq.current += 1);
    setHandleState('checking');
    const timer = setTimeout(() => {
      handleAvailable(handle, session?.account.handle)
        .then((free) => seq === checkSeq.current && setHandleState(free ? 'free' : 'taken'))
        .catch(() => seq === checkSeq.current && setHandleState('idle'));
    }, 400);
    return () => clearTimeout(timer);
  }, [handle, problem, session?.account.handle]);

  // Same picker and circle cropper as the Profile page (512px square, shown as a circle).
  const pickAvatar = async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const photo = await pickCoverPhoto();
      if (photo) setAvatarUri(photo.uri);
    } catch {
      setPhotoError('Couldn’t load that photo. Try a different one.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const profileOk = isValidDisplayName(displayName) && !!handle && !problem && handleState === 'free';

  // ---- Navigation ----------------------------------------------------------------------------
  const back = () => {
    setError(null);
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };
  const next = () => {
    setError(null);
    if (stepIndex < ONBOARDING_STEPS.length - 1) setStepIndex(stepIndex + 1);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stepIndex === 0) return false;
      back();
      return true;
    });
    return () => sub.remove();
  });

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await finishOnboarding({
        displayName: cleanDisplayName(displayName).trim(),
        handle: cleanHandle(handle),
        homeCity,
        interestTags: interests,
        trackLocation,
        countMeInInterests: false, // "Count me in" is turned off for now
        notifications,
      }, avatarUri);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'unknown';
      setError(authErrorMessage(code));
      setBusy(false);
      if (code === 'handle_taken') {
        setHandleState('taken');
        setStepIndex(0);
      }
    }
  };

  // ---- Footer buttons ------------------------------------------------------------------------
  const last = stepIndex === ONBOARDING_STEPS.length - 1;
  const canContinue = step.id === 'profile' ? profileOk : true;
  const skippable =
    step.optional && ((step.id === 'home' && !homeCity) || (step.id === 'interests' && interests.length === 0));
  const footer = (
    <View style={styles.footerButtons}>
      <AuthButton
        label={last ? 'Start exploring' : skippable ? 'Skip for now' : 'Continue'}
        kind={skippable ? 'secondary' : 'primary'}
        onPress={last ? () => void finish() : next}
        disabled={!canContinue}
        busy={busy}
        testID="onboarding-next"
      />
      {stepIndex === 0 ? (
        <AuthButton label="Use a different account" kind="text" onPress={() => void signOut()} />
      ) : null}
    </View>
  );

  return (
    <>
      <AuthPage
        testID={`onboarding-${step.id}`}
        onBack={stepIndex > 0 ? back : undefined}
        header={<Progress index={stepIndex} />}
        footer={footer}
      >
        <AuthError message={error} />
        {renderStep(step.id)}
      </AuthPage>
      <CityPickerSheet
        visible={pickingCity}
        title="Your home area"
        home={homeCity}
        onPick={(place) => {
          setHomeCity(place);
          setPickingCity(false);
        }}
        onClose={() => setPickingCity(false)}
      />
      {/* Photo rules (first upload) and the circle cropper for the profile photo. */}
      <PhotoPolicyHost />
      <CircleCropHost />
    </>
  );

  function renderStep(id: OnboardingStep) {
    switch (id) {
      case 'profile':
        return (
          <ProfileStep
            displayName={displayName}
            handle={handle}
            handleState={handleState}
            problem={problem}
            avatarUri={avatarUri}
            photoBusy={photoBusy}
            photoError={photoError}
            onPickAvatar={() => void pickAvatar()}
            onRemoveAvatar={() => setAvatarUri(null)}
            onName={(text) => {
              const name = cleanDisplayName(text);
              setDisplayName(name);
              if (!handleEdited) setHandle(suggestHandle(name, session?.account.email));
            }}
            onHandle={(text) => {
              setHandleEdited(true);
              setHandle(cleanHandle(text));
            }}
          />
        );
      case 'home':
        return <HomeStep city={homeCity} onPick={() => setPickingCity(true)} onClear={() => setHomeCity(null)} />;
      case 'interests':
        return (
          <InterestsStep
            selected={interests}
            onToggle={(tag) => setInterests((current) => toggleInterest(current, tag, INTEREST_TAG_LIMIT))}
          />
        );
      case 'privacy':
        return (
          <PrivacyStep
            trackLocation={trackLocation}
            notifications={notifications}
            onTrack={setTrackLocation}
            onNotifications={setNotifications}
          />
        );
    }
  }
};

// ---- Progress -------------------------------------------------------------------------------

const Progress: React.FC<{ index: number }> = ({ index }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={styles.progress}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${index + 1} of ${ONBOARDING_STEPS.length}`}
    >
      {ONBOARDING_STEPS.map((s, i) => (
        <View key={s.id} style={[styles.progressBar, i <= index && styles.progressBarOn]} />
      ))}
    </View>
  );
};

// ---- Steps ----------------------------------------------------------------------------------

const ProfileStep: React.FC<{
  displayName: string;
  handle: string;
  handleState: 'idle' | 'checking' | 'free' | 'taken';
  problem: string | null;
  avatarUri: string | null;
  photoBusy: boolean;
  photoError: string | null;
  onPickAvatar: () => void;
  onRemoveAvatar: () => void;
  onName: (text: string) => void;
  onHandle: (text: string) => void;
}> = ({
  displayName,
  handle,
  handleState,
  problem,
  avatarUri,
  photoBusy,
  photoError,
  onPickAvatar,
  onRemoveAvatar,
  onName,
  onHandle,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const initial = displayName.trim().charAt(0).toUpperCase();
  const handleHint =
    handleState === 'checking' ? (
      <Text style={styles.hint}>Checking…</Text>
    ) : handleState === 'free' ? (
      <View style={styles.hintRow}>
        <Check size={13} color={c.green} strokeWidth={3} />
        <Text style={[styles.hint, styles.hintOk]}>@{handle} is yours</Text>
      </View>
    ) : (
      <Text style={styles.hint}>Letters, numbers, _ and -. People find and invite you by this.</Text>
    );
  return (
    <View>
      <AuthTitle title="What should people call you?" subtitle="Your name shows on your posts and Drop Points." />
      <View style={styles.avatarRow}>
        <TouchableOpacity
          style={styles.avatar}
          onPress={onPickAvatar}
          disabled={photoBusy}
          accessibilityRole="button"
          accessibilityLabel={avatarUri ? 'Change profile photo' : 'Add profile photo'}
          testID="onboarding-photo"
        >
          {photoBusy ? (
            <ActivityIndicator color={c.accent} />
          ) : avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{initial || '•'}</Text>
          )}
          <View style={styles.avatarBadge}>
            <Camera size={12} color={c.onAccent} strokeWidth={2.4} />
          </View>
        </TouchableOpacity>
        <View style={styles.avatarCopy}>
          <TouchableOpacity onPress={onPickAvatar} disabled={photoBusy} hitSlop={8} accessibilityRole="button">
            <Text style={styles.avatarAction}>{avatarUri ? 'Change photo' : 'Add a photo'}</Text>
          </TouchableOpacity>
          {avatarUri ? (
            <TouchableOpacity onPress={onRemoveAvatar} hitSlop={8} accessibilityRole="button">
              <Text style={styles.avatarRemove}>Remove</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.avatarNote}>Optional. You can change it anytime from your profile.</Text>
          )}
          {photoError ? <Text style={styles.avatarError}>{photoError}</Text> : null}
        </View>
      </View>
      <AuthField
        label="Name"
        value={displayName}
        onChangeText={onName}
        placeholder="e.g. Sam Rivera"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={40}
        testID="onboarding-name"
      />
      <AuthField
        label="Handle"
        prefix="@"
        value={handle}
        onChangeText={onHandle}
        placeholder="samrivera"
        autoComplete="username"
        textContentType="username"
        maxLength={20}
        error={problem ?? (handleState === 'taken' ? 'That handle is taken. Try another.' : null)}
        hint={handleHint}
        testID="onboarding-handle"
      />
    </View>
  );
};

const HomeStep: React.FC<{ city: CityPlace | null; onPick: () => void; onClear: () => void }> = ({ city, onPick, onClear }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <View>
      <AuthTitle
        title="Where’s home?"
        subtitle="Discover opens here when you’re not sharing your location. Only the city is saved."
      />
      {city ? (
        <View style={styles.cityCard}>
          <MapPin size={20} color={c.accent} strokeWidth={2.2} />
          <Text style={styles.cityName}>{cityLabel(city)}</Text>
          <TouchableOpacity onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear home area">
            <X size={18} color={c.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}
      <TouchableOpacity style={styles.pickCity} onPress={onPick} accessibilityRole="button" testID="onboarding-pick-city">
        <LocateFixed size={18} color={c.accent} strokeWidth={2.2} />
        <Text style={styles.pickCityText}>{city ? 'Change' : 'Use my location or search a city'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const InterestsStep: React.FC<{ selected: string[]; onToggle: (tag: string) => void }> = ({ selected, onToggle }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const full = selected.length >= INTEREST_TAG_LIMIT;
  return (
    <View>
      <AuthTitle
        title="What are you into?"
        subtitle="We’ll point out nearby Points and channels that match. Pick a few, or skip."
      />
      <View style={styles.chips}>
        {STARTER_INTERESTS.map((tag) => {
          const on = selected.includes(tag);
          return (
            <TouchableOpacity
              key={tag}
              style={[styles.chip, on && styles.chipOn, full && !on && styles.chipOff]}
              onPress={() => onToggle(tag)}
              disabled={full && !on}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: full && !on }}
            >
              {on ? <Check size={13} color={c.accent} strokeWidth={3} /> : null}
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{tag}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.count}>
        {selected.length} of {INTEREST_TAG_LIMIT}
        {full ? ' · that’s the most you can follow' : ''}
      </Text>
    </View>
  );
};

const PrivacyStep: React.FC<{
  trackLocation: boolean;
  notifications: boolean;
  onTrack: (on: boolean) => void;
  onNotifications: (on: boolean) => void;
}> = ({ trackLocation, notifications, onTrack, onNotifications }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View>
      <AuthTitle title="You’re in control" subtitle="Off unless you turn it on. Change any of these later in Settings." />
      <ChoiceRow
        Icon={LocateFixed}
        title="Follow my location on Discover"
        body="Discover opens where you are and follows you as you move. Off: it opens on your home area."
        value={trackLocation}
        onChange={onTrack}
        testID="onboarding-track"
      />
      <ChoiceRow
        Icon={Bell}
        title="Notifications"
        body="Replies, invites and new Points that match your interests."
        value={notifications}
        onChange={onNotifications}
        testID="onboarding-notifications"
      />
      <Text style={styles.privacyNote}>Your phone will ask before ProxiPoint uses your location or sends notifications.</Text>
    </View>
  );
};

const ChoiceRow: React.FC<{
  Icon: typeof Bell;
  title: string;
  body: string;
  value: boolean;
  onChange: (on: boolean) => void;
  testID?: string;
}> = ({ Icon, title, body, value, onChange, testID }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.choice}>
      <View style={styles.choiceIcon}>
        <Icon size={18} color={c.accent} strokeWidth={2.2} />
      </View>
      <View style={styles.choiceText}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceBody}>{body}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: c.borderStrong, true: c.accentTrack }}
        thumbColor={value ? c.accent : c.textMuted}
        accessibilityLabel={title}
        testID={testID}
      />
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    footerButtons: { gap: 2, marginBottom: 4 },
    progress: { flexDirection: 'row', gap: 6, width: 160 },
    progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.border },
    progressBarOn: { backgroundColor: c.accent },
    avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.accentTint,
      borderWidth: 1,
      borderColor: c.accentBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: c.accent, fontSize: 22, fontWeight: '800' },
    avatarImage: { width: 56, height: 56, borderRadius: 28 },
    avatarBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.accent,
      borderWidth: 2,
      borderColor: c.base,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarCopy: { flex: 1, gap: 3 },
    avatarAction: { color: c.accent, fontSize: 15, fontWeight: '700' },
    avatarRemove: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
    avatarNote: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    avatarError: { color: c.red, fontSize: 12, lineHeight: 16 },
    hint: { color: c.textMuted, fontSize: 12, marginTop: 6 },
    hintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
    hintOk: { color: c.green, marginTop: 0, fontWeight: '700' },
    cityCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.accentBorder,
      marginBottom: 12,
    },
    cityName: { flex: 1, color: c.text, fontSize: 17, fontWeight: '700' },
    pickCity: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 52,
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.accentBorder,
      backgroundColor: c.accentWash,
    },
    pickCityText: { color: c.accent, fontSize: 15, fontWeight: '700' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipOn: { borderColor: c.accent, backgroundColor: c.accentTint },
    chipOff: { opacity: 0.4 },
    chipText: { color: c.textSecondary, fontSize: 14, fontWeight: '600' },
    chipTextOn: { color: c.accent },
    count: { color: c.textMuted, fontSize: 13, marginTop: 14 },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    choiceIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.accentTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    choiceText: { flex: 1, gap: 3 },
    choiceTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
    choiceBody: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    privacyNote: { color: c.textFaint, fontSize: 12, lineHeight: 17, marginTop: 16 },
  });
