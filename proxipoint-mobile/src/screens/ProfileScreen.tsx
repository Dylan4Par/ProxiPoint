import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ChevronLeft, ChevronRight, Image as ImageIcon, Layers, Plus, Settings, X, type LucideIcon } from 'lucide-react-native';
import { RecapCard } from '../components/profile/RecapCard';
import { RecapComposer } from '../components/profile/RecapComposer';
import { MyTagsTile } from '../components/profile/MyTagsTile';
import { MyChannelsTile } from '../components/profile/MyChannelsTile';
import { MyEventsTile } from '../components/profile/MyEventsTile';
import { LocationTile } from '../components/profile/LocationTile';
import { SignalChip, SignalTile } from '../components/profile/Signal';
import { useVisibleComments, useVisiblePosts } from '../lib/channels';
import { computeSignal, contributionsOf } from '../lib/signalScore';
import { INTEREST_RADIUS_METERS, countInterested, roundedCount, useInterestMembers } from '../lib/nearbyInterest';
import type { CityPlace } from '../lib/places';
import { type DroppedPoint } from '../lib/droppedPoint';
import { pickCoverPhoto } from '../lib/coverPhoto';
import { pickBannerPhoto } from '../lib/profilePhotos';
import { type PointRecap } from '../lib/pointRecap';
import { BIO_CHAR_LIMIT, BIO_MAX_LINES, limitBio, type MyProfile } from '../lib/myProfile';
import { useFollowing } from '../lib/hostProfiles';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme/ThemeContext';
import { KeyboardAwareScrollView } from '../components/common/KeyboardAwareScrollView';

/**
 * Fills the parent edge to edge. Written out by hand because StyleSheet.absoluteFillObject
 * was removed in newer React Native, which silently drops the positioning.
 */
const ABS_FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

interface ProfileScreenProps {
  profile: MyProfile;
  drops: DroppedPoint[];
  /** Shown as a BACK button. Leave out when Profile is open as a tab. */
  onBack?: () => void;
  /** Profile is the Profile tab: fills the space above the nav bar instead of covering the screen. */
  asTab?: boolean;
  onOpenSettings: () => void;
  onOpenMyDrops: () => void;
  /** Opens one of your events (Manage sheet). */
  onOpenDrop: (id: string) => void;
  /** Opens Create Event filled in with an earlier event's details. */
  onDropAgain: (id: string) => void;
  onOpenActivity: () => void;
  onDropPoint: () => void;
  /** Saves a new banner, or null to go back to the dot pattern. */
  onChangeBanner: (uri: string | null) => void;
  /** Your Point recaps, newest first. */
  recaps: PointRecap[];
  onChangeRecaps: (recaps: PointRecap[]) => void;
  /** Saves a new profile photo picked from the avatar. */
  onChangeAvatar: (uri: string) => void;
  /** Saves the bio as it's typed. */
  onChangeBio: (bio: string) => void;
  /** Saves your #tags and whether they're public. */
  onChangeInterestTags: (tags: string[], isPublic: boolean) => void;
  /** Saves whether your channels are listed on your public profile. */
  onChangeChannelsPublic: (isPublic: boolean) => void;
  /** Opens a channel you're in (Channels tab). */
  onOpenChannel: (id: string) => void;
  /** Channels tab → My Channels, to find more. */
  onBrowseChannels: () => void;
  /** Home city and GPS tracking for Discover. */
  onChangeHomeCity: (city: CityPlace) => void;
  onChangeTracking: (on: boolean) => void;
  /** Name of the app's default area, shown until a home city is picked. */
  defaultAreaLabel: string;
  /** One of your posts (from Contributions): its page in the Channels tab. */
  onOpenPost: (postId: string) => void;
  /** Your home area: where "nearby" counts are worked out from (never GPS). */
  homeArea: { latitude: number; longitude: number };
}

/** Same tints as the category badges, scattered behind the avatar. */
const DOT_COLORS = ['#22d3ee', '#f59e0b', '#38bdf8', '#34d399', '#a78bfa', '#f472b6'];

/** Fixed, evenly-spread dot pattern (the same on every render, so nothing flickers). */
function heroDots() {
  const dots: Array<{ left: string; top: number; size: number; color: string; opacity: number }> = [];
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const n = row * 9 + col;
      const size = 10 + ((n * 37) % 14);
      dots.push({
        left: `${col * 11.5 + (row % 2 ? 5 : 0) - 2}%`,
        top: row * 44 + ((n * 13) % 12),
        size,
        color: DOT_COLORS[(n * 5 + row) % DOT_COLORS.length],
        opacity: 0.1 + ((n * 7) % 10) / 60,
      });
    }
  }
  return dots;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  profile,
  drops,
  onBack,
  asTab = false,
  onOpenSettings,
  onOpenMyDrops,
  onOpenDrop,
  onDropAgain,
  onOpenActivity,
  onDropPoint,
  onChangeAvatar,
  onChangeBio,
  onChangeInterestTags,
  onChangeChannelsPublic,
  onOpenChannel,
  onBrowseChannels,
  onChangeHomeCity,
  onChangeTracking,
  defaultAreaLabel,
  onChangeBanner,
  recaps,
  onChangeRecaps,
  onOpenPost,
  homeArea,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [bioFocused, setBioFocused] = useState(false);
  const insets = useSafeAreaInsets();
  // As a tab, the screen around it already keeps clear of the status bar.
  const topInset = asTab ? 0 : insets.top;
  // Hosts you follow from their public profiles (until GET /me/following exists).
  const followedHosts = useFollowing();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const pickAvatar = async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const photo = await pickCoverPhoto(); // square 512px crop, shown as a circle
      if (photo) onChangeAvatar(photo.uri); // Server side: upload, then PATCH /me
    } catch {
      setPhotoError('Couldn’t load that photo. Try a different one.');
    } finally {
      setPhotoBusy(false);
    }
  };
  const dots = useMemo(heroDots, []);
  // Signal Score and Contributions, from your posts, comments, drops and recaps.
  const posts = useVisiblePosts();
  const comments = useVisibleComments();
  const signal = useMemo(
    () => computeSignal(profile.handle, { posts, comments, pointsHosted: drops.length, recaps }),
    [profile.handle, posts, comments, drops.length, recaps],
  );
  const contributions = useMemo(() => contributionsOf(profile.handle, posts, comments), [profile.handle, posts, comments]);
  // "20+" people near your home area into each of your #tags (null when too few to show).
  const interestMembers = useInterestMembers();
  const nearbyCounts = useMemo(() => {
    const counts: Record<string, string | null> = {};
    for (const tag of profile.interestTags ?? []) {
      counts[tag] = roundedCount(countInterested(interestMembers, tag, homeArea, INTEREST_RADIUS_METERS));
    }
    return counts;
  }, [interestMembers, profile.interestTags, homeArea.latitude, homeArea.longitude]);
  const [bannerBusy, setBannerBusy] = useState(false);

  const pickBanner = async () => {
    if (bannerBusy) return;
    setBannerBusy(true);
    setPhotoError('');
    try {
      const uri = await pickBannerPhoto(); // 16:9, 1280x720 JPEG
      if (uri) onChangeBanner(uri); // Server side: upload, then PATCH /me
    } catch {
      setPhotoError('Couldn’t load that banner. Try a different photo.');
    } finally {
      setBannerBusy(false);
    }
  };

  return (
    // As a tab it takes the space above the nav bar like the other tabs; otherwise it covers everything.
    <View style={asTab ? styles.tab : styles.overlay} testID="profile-screen">
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: asTab ? 24 : insets.bottom + 24 }}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={[styles.hero, { paddingTop: topInset + 8 }]}>
          <View style={ABS_FILL} pointerEvents="none">
            {profile.bannerUri ? (
              <>
                {/* 16:9 across the top, fading into the page behind the avatar and stats. */}
                <View style={[styles.bannerFrame, { height: topInset + 240 }]}>
                  <Image source={{ uri: profile.bannerUri }} style={styles.bannerImage} resizeMode="cover" />
                  {/* Darkens the photo so the name and buttons stay readable. */}
                  <View style={styles.bannerShade} />
                  <View style={styles.bannerFadeTop} />
                  <View style={styles.bannerFadeBottom} />
                </View>
              </>
            ) : (
              dots.map((dot, index) => (
                <View
                  key={index}
                  style={{
                    position: 'absolute',
                    left: dot.left as `${number}%`,
                    top: dot.top,
                    width: dot.size,
                    height: dot.size * 1.25,
                    borderRadius: dot.size,
                    backgroundColor: dot.color,
                    opacity: dot.opacity,
                  }}
                />
              ))
            )}
            <View style={styles.heroFade} />
          </View>

          <View style={styles.topBar}>
            {onBack ? (
              <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityRole="button" testID="profile-back">
                <ChevronLeft size={20} color={c.text} strokeWidth={2.5} />
                <Text style={styles.backText}>BACK</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            <View style={styles.bannerActions}>
              <TouchableOpacity
                onPress={pickBanner}
                disabled={bannerBusy}
                style={styles.bannerBtn}
                accessibilityRole="button"
                accessibilityLabel={profile.bannerUri ? 'Change banner' : 'Add a banner'}
                testID="profile-edit-banner"
              >
                {bannerBusy ? (
                  <ActivityIndicator size="small" color={c.accent} />
                ) : (
                  <ImageIcon size={14} color={c.text} strokeWidth={2.25} />
                )}
                <Text style={styles.bannerBtnText}>Edit banner</Text>
              </TouchableOpacity>
              {profile.bannerUri && !bannerBusy ? (
                <TouchableOpacity
                  onPress={() => onChangeBanner(null)}
                  style={styles.bannerRemove}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove banner"
                >
                  <X size={14} color={c.text} strokeWidth={2.5} />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onOpenSettings}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              testID="profile-settings"
            >
              <Settings size={20} color={c.text} strokeWidth={2.25} />
            </TouchableOpacity>
          </View>

          <View style={styles.avatarWrap}>
            <View style={styles.avatarHalo} />
            <TouchableOpacity
              style={[styles.avatar, !profile.avatarUri && styles.avatarEmpty]}
              onPress={pickAvatar}
              disabled={photoBusy}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={profile.avatarUri ? 'Change profile photo' : 'Add profile photo'}
              testID="profile-avatar"
            >
              {photoBusy ? (
                <ActivityIndicator color={c.accent} />
              ) : profile.avatarUri ? (
                <Image source={{ uri: profile.avatarUri }} style={styles.avatarImage} />
              ) : (
                <Plus size={44} color={c.accent} strokeWidth={2} />
              )}
            </TouchableOpacity>
            <View style={styles.dropsChip}>
              <Text style={styles.dropsChipText}>{drops.length}</Text>
            </View>
          </View>

          {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}
          <Text style={styles.name} numberOfLines={1}>
            {profile.displayName}
          </Text>
          <Text style={styles.handle}>{profile.handle}</Text>
          <SignalChip signal={signal} />

          <View style={styles.statsRow}>
            <Stat label="Following" value={profile.following + followedHosts.length} />
            <Stat label="Followers" value={profile.followers} />
            <Stat label="Drops" value={drops.length} />
          </View>
        </View>

        {/* Sheet */}
        <View style={styles.sheet}>
          <View style={styles.pullBar} />

          {/* Bio: type straight into the tile; saved as you go. */}
          <View style={styles.bioHeader}>
            <Text style={styles.sectionLabel}>BIO</Text>
            {bioFocused ? (
              <Text style={[styles.bioCount, profile.bio.length >= BIO_CHAR_LIMIT && styles.bioCountFull]}>
                {profile.bio.split('\n').length >= BIO_MAX_LINES ? `${BIO_MAX_LINES} lines max · ` : ''}
                {profile.bio.length} / {BIO_CHAR_LIMIT}
              </Text>
            ) : null}
          </View>
          <TextInput
            value={profile.bio}
            onChangeText={(value) => onChangeBio(limitBio(value))}
            onFocus={() => setBioFocused(true)}
            onBlur={() => {
              setBioFocused(false);
              if (profile.bio !== profile.bio.trim()) onChangeBio(profile.bio.trim());
            }}
            placeholder="Add a bio, e.g. Boulder GIS nerd, live music regular"
            placeholderTextColor={c.textFaint}
            multiline
            // Grows with the text instead of scrolling inside the box.
            scrollEnabled={false}
            textAlignVertical="top"
            style={[styles.bioTile, styles.bioText, bioFocused && styles.bioTileFocused]}
            accessibilityLabel="Bio"
            testID="profile-bio"
          />

          <Text style={[styles.sectionLabel, styles.sectionSpaced]}>MY EVENTS</Text>
          <MyEventsTile drops={drops} onOpen={onOpenDrop} onDropAgain={onDropAgain} onSeeAll={onOpenMyDrops} />

          <Text style={[styles.sectionLabel, styles.sectionSpaced]}>SIGNAL</Text>
          <SignalTile signal={signal} contributions={contributions} isMe collapsible onOpenPost={onOpenPost} />

          <Text style={[styles.sectionLabel, styles.sectionSpaced]}>MY #TAGS</Text>
          <MyTagsTile
            tags={profile.interestTags ?? []}
            isPublic={profile.interestTagsPublic ?? false}
            onChange={onChangeInterestTags}
            nearbyCounts={nearbyCounts}
          />

          <Text style={[styles.sectionLabel, styles.sectionSpaced]}>MY CHANNELS</Text>
          <MyChannelsTile
            isPublic={profile.channelsPublic ?? false}
            onChangePublic={onChangeChannelsPublic}
            onOpenChannel={onOpenChannel}
            onBrowse={onBrowseChannels}
          />

          <Text style={[styles.sectionLabel, styles.sectionSpaced]}>LOCATION</Text>
          <LocationTile
            homeCity={profile.homeCity ?? null}
            defaultAreaLabel={defaultAreaLabel}
            trackLocation={profile.trackLocation ?? false}
            onChangeHome={onChangeHomeCity}
            onChangeTracking={onChangeTracking}
          />

          <Text style={[styles.sectionLabel, styles.sectionSpaced]}>CREATE DROP</Text>
          <TouchableOpacity style={styles.createEventBtn} onPress={onDropPoint} accessibilityRole="button" testID="profile-create-event">
            <Plus size={18} color={c.onAccent} strokeWidth={2.75} />
            <Text style={styles.createEventText}>Drop Point</Text>
          </TouchableOpacity>
          <Text style={styles.createEventNote}>Put a show, game, meetup or pop-up on the map for people nearby.</Text>
          {/* Once one of your events has started: post a recap of it. */}
          <RecapComposer drops={drops} onPost={(recap) => onChangeRecaps([recap, ...recaps])} onDropPoint={onDropPoint} />

          {recaps.length > 0 ? (
            <View style={styles.recapList} testID="profile-recaps">
              {recaps.map((recap) => (
                <RecapCard
                  key={recap.id}
                  recap={recap}
                  onChange={(next) => onChangeRecaps(recaps.map((r) => (r.id === next.id ? next : r)))}
                  onDelete={(id) => onChangeRecaps(recaps.filter((r) => r.id !== id))}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.rows}>
            <LinkRow Icon={Layers} label="View My Drops" onPress={onOpenMyDrops} testID="profile-my-drops" />
            <LinkRow Icon={Bell} label="View alerts" onPress={onOpenActivity} testID="profile-activity" />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const styles = useThemedStyles(createStyles);
  return (
  <View style={styles.stat}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
  );
};

const LinkRow: React.FC<{ Icon: LucideIcon; label: string; onPress: () => void; testID?: string }> = ({
  Icon,
  label,
  onPress,
  testID,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
  <TouchableOpacity style={styles.linkRow} onPress={onPress} accessibilityRole="button" testID={testID}>
    <Icon size={20} color={c.textSecondary} strokeWidth={2} />
    <Text style={styles.linkLabel}>{label}</Text>
    <ChevronRight size={18} color={c.iconFaint} strokeWidth={2.25} />
  </TouchableOpacity>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  overlay: {
    ...ABS_FILL,
    zIndex: 50, // above the nav bar (40)
    backgroundColor: c.base,
  },
  tab: { flex: 1, backgroundColor: c.base },
  scroll: { flex: 1 },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    backgroundColor: c.mapBase,
    overflow: 'hidden',
  },
  bannerFrame: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  bannerImage: { width: '100%', height: '100%' },
  // Two soft bands at the bottom edge so the photo blends into the page colour.
  bannerFadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 90,
    backgroundColor: c.heroFadeSoft,
  },
  bannerFadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 40,
    backgroundColor: c.heroFadeStrong,
  },
  bannerShade: { ...ABS_FILL, backgroundColor: c.bannerShade },
  bannerActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto', marginRight: 8 },
  bannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: c.glass,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  bannerBtnText: { color: c.text, fontSize: 12, fontWeight: '700' },
  bannerRemove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.glass,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  recapList: { gap: 12, marginTop: 12 },
  heroFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
    backgroundColor: c.heroFade,
  },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingRight: 8 },
  backText: { color: c.text, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.glass,
    borderWidth: 1,
    borderColor: c.border,
  },
  avatarWrap: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', width: 124, height: 124 },
  avatarHalo: {
    position: 'absolute',
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 4,
    borderColor: c.accent,
    opacity: 0.2,
  },
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2.5,
    borderColor: c.accent,
    backgroundColor: c.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarEmpty: { borderStyle: 'dashed' },
  avatarImage: { width: '100%', height: '100%' },
  photoError: { color: c.amber, fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 8 },
  bioTile: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bioText: { color: c.textBody, fontSize: 14, lineHeight: 20, minHeight: 48 },
  bioTileFocused: { borderColor: c.accent },
  bioHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bioCount: { color: c.textFaint, fontSize: 11, fontWeight: '700', marginBottom: 8 },
  bioCountFull: { color: c.amber },
  sectionSpaced: { marginTop: 18 },
  createEventBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.accent,
  },
  createEventText: { color: c.onAccent, fontSize: 16, fontWeight: '800' },
  createEventNote: { color: c.textMuted, fontSize: 12, textAlign: 'center', marginTop: 6, marginBottom: 10 },
  dropsChip: {
    position: 'absolute',
    bottom: -4,
    minWidth: 30,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: c.base,
    borderWidth: 1.5,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropsChipText: { color: c.text, fontSize: 12, fontWeight: '800' },
  name: { color: c.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  handle: { color: c.accentSoft, fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', marginTop: 20 },
  stat: { gap: 2, alignItems: 'center' },
  statLabel: { color: c.textSecondary, fontSize: 12, fontWeight: '700' },
  statValue: { color: c.text, fontSize: 22, fontWeight: '800' },
  sheet: {
    marginTop: -16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: c.sheet,
    borderTopWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 16,
    paddingTop: 8,
    minHeight: 420,
  },
  pullBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.borderStrong,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sectionLabel: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  rows: { marginTop: 18 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  linkLabel: { flex: 1, color: c.text, fontSize: 16, fontWeight: '500' },
});
