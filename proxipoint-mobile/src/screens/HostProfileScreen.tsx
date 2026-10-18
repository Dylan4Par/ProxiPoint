import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BadgeCheck,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  EyeOff,
  Flag,
  Images,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  UserPlus,
  X,
} from 'lucide-react-native';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme/ThemeContext';
import { useDiscoveryStore } from '../stores/useDiscoveryStore';
import { CategoryBadge } from '../components/discovery/CategoryBadge';
import { LiveBadge } from '../components/drops/LiveBadge';
import { PhotoViewer, RecapCard } from '../components/profile/RecapCard';
import { ReportSheet, type ReportTarget } from '../components/safety/ReportSheet';
import { useKeyboardHeight } from '../components/common/KeyboardAwareScrollView';
import {
  cancelContactRequest,
  getContactRequest,
  getHostProfile,
  isFollowing,
  requestContact,
  setFollowing,
  type ContactRequest,
} from '../lib/hostProfiles';
import { blockUser, isBlocked, isContentHidden, isNodeAllowed, unblockUser, useModeration } from '../lib/moderation';
import { isLiveNode } from '../lib/liveStatus';
import type { PointRecap, RecapPhoto } from '../lib/pointRecap';

/**
 * Fills the parent edge to edge. Written out by hand because StyleSheet.absoluteFillObject
 * was removed in newer React Native, which silently drops the positioning.
 */
const ABS_FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

interface HostProfileScreenProps {
  /** e.g. "@rustyanchor" */
  handle: string;
  onBack: () => void;
  /** Open one of their Points on the Discover map. */
  onOpenPoint: (id: string) => void;
}

/** Same decorative dots as your own Profile page. */
/** Photos shown in the tile before "See all". */
const PHOTO_PREVIEW = 6;

interface HostPhoto {
  photo: RecapPhoto;
  recapId: string;
  /** e.g. "Friday Soul Night" */
  from: string;
}

const CONTACT_NOTE_LIMIT = 200;

/** Opens the phone's mail, dialer or messages app; says so if nothing can handle it. */
async function openLink(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Couldn’t open that', 'There’s no app on this phone that can handle it.');
  }
}

const DOT_COLORS = ['#22d3ee', '#f59e0b', '#38bdf8', '#34d399', '#a78bfa', '#f472b6'];
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

function formatCount(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : String(value);
}

/**
 * Public profile of a host, as anyone else sees it: name, bio, follower counts, the Points
 * they're hosting now or soon, and their recaps (which you can react to or report).
 */
export const HostProfileScreen: React.FC<HostProfileScreenProps> = ({ handle, onBack, onOpenPoint }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  // Android: lift the contact-request sheet above the keyboard (iOS uses KeyboardAvoidingView).
  const keyboardHeight = useKeyboardHeight();
  useModeration(); // re-render when you report or block
  const profile = useMemo(() => getHostProfile(handle), [handle]);
  const dots = useMemo(heroDots, []);
  const [followingNow, setFollowingNow] = useState(isFollowing(profile.handle));
  const [recaps, setRecaps] = useState<PointRecap[]>(profile.recaps);
  const blocked = isBlocked(profile.handle);
  // Red flag → small menu with Report and Block.
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);

  // Contact: public hosts share email/phone; private ones get a request instead.
  const contact = profile.contact;
  const canContactDirectly = contact.visibility === 'public' && Boolean(contact.email || contact.phone);
  const [contactRequest, setContactRequest] = useState<ContactRequest | null>(getContactRequest(profile.handle));
  const [contactMenuOpen, setContactMenuOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const phoneDigits = (contact.phone ?? '').replace(/[^\d+]/g, '');

  const onContactPress = () => {
    if (canContactDirectly || contactRequest) setContactMenuOpen(true);
    else setRequestOpen(true);
  };

  const sendRequest = () => {
    setContactRequest(requestContact(profile.handle, requestNote));
    setRequestOpen(false);
    setRequestNote('');
  };

  const withdrawRequest = () => {
    setContactMenuOpen(false);
    cancelContactRequest(profile.handle);
    setContactRequest(null);
  };

  // Their Points currently on the map: live first, then soonest.
  const nodes = useDiscoveryStore((state) => state.nodes);
  const points = useMemo(
    () =>
      (Object.values(nodes || {}) as Array<Record<string, unknown> & { id: string }>)
        .filter((node) => typeof node.host === 'string' && node.host.toLowerCase() === profile.handle.toLowerCase())
        .filter((node) => isNodeAllowed(node))
        .sort((a, b) => {
          const live = Number(isLiveNode(b)) - Number(isLiveNode(a));
          if (live !== 0) return live;
          return String(a.startsAt ?? '').localeCompare(String(b.startsAt ?? ''));
        }),
    [nodes, profile.handle],
  );

  const toggleFollow = () => {
    const next = !followingNow;
    setFollowing(profile.handle, next); // Server side: POST / DELETE /me/following/:handle
    setFollowingNow(next);
  };

  const stopFollowing = () => {
    setFollowing(profile.handle, false);
    setFollowingNow(false);
  };

  const openReport = () => {
    setMenuOpen(false);
    setReporting({ type: 'profile', id: profile.handle, label: `${profile.displayName} (${profile.handle})`, ownerHandle: profile.handle });
  };

  const confirmBlock = () => {
    setMenuOpen(false);
    Alert.alert(
      `Block ${profile.handle}?`,
      'Their Points and recaps will be hidden from you, and they won’t be able to invite you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            blockUser(profile.handle);
            stopFollowing();
          },
        },
      ],
    );
  };

  const visibleRecaps = recaps.filter((item) => !isContentHidden(item.id));

  // Every photo from their recaps, newest recap first (reported ones left out).
  const photos: HostPhoto[] = visibleRecaps.flatMap((item) =>
    item.photos
      .filter((photo) => !isContentHidden(photo.id))
      .map((photo) => ({ photo, recapId: item.id, from: item.pointTitle })),
  );
  const [allPhotosOpen, setAllPhotosOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const viewing = viewerIndex != null ? photos[viewerIndex] ?? null : null;

  const updatePhoto = (recapId: string, next: RecapPhoto) =>
    setRecaps((current) =>
      current.map((item) =>
        item.id === recapId
          ? { ...item, photos: item.photos.map((photo) => (photo.id === next.id ? next : photo)) }
          : item,
      ),
    );

  const photoTile = (entry: HostPhoto, index: number, style: object) => (
    <TouchableOpacity
      key={entry.photo.id}
      style={[styles.photoTile, style]}
      onPress={() => setViewerIndex(index)}
      activeOpacity={0.85}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Photo from ${entry.from}`}
      testID={`host-photo-${entry.photo.id}`}
    >
      <Image source={{ uri: entry.photo.uri }} style={styles.photoImage} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.overlay} testID="host-profile-screen">
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} bounces={false}>
        <View style={[styles.hero, { paddingTop: insets.top + 8 }]}>
          <View style={ABS_FILL} pointerEvents="none">
            {dots.map((dot, index) => (
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
            ))}
            <View style={styles.heroFade} />
          </View>

          <View style={styles.topBar}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityRole="button" testID="host-profile-back">
              <ChevronLeft size={20} color={c.text} strokeWidth={2.5} />
              <Text style={styles.backText}>BACK</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMenuOpen(true)}
              style={styles.flagBtn}
              accessibilityRole="button"
              accessibilityLabel={`Report or block ${profile.handle}`}
              testID="host-profile-flag"
            >
              <Flag size={18} color={c.red} fill={c.red} strokeWidth={2.25} />
            </TouchableOpacity>
          </View>

          <View style={styles.avatarWrap}>
            <View style={styles.avatarHalo} />
            <View style={styles.avatar}>
              {profile.avatarUri ? (
                <Image source={{ uri: profile.avatarUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitial}>{profile.displayName.trim().charAt(0).toUpperCase() || '•'}</Text>
              )}
            </View>
          </View>

          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {profile.displayName}
            </Text>
            {profile.verified ? <BadgeCheck size={20} color={c.accent} strokeWidth={2.25} /> : null}
          </View>
          <Text style={styles.handle}>{profile.handle}</Text>
          {profile.joined ? <Text style={styles.joined}>Hosting since {profile.joined}</Text> : null}

          <View style={styles.statsRow}>
            <Stat label="Followers" value={formatCount(profile.followers + (followingNow ? 1 : 0))} />
            <Stat label="Following" value={formatCount(profile.following)} />
            <Stat label="Points hosted" value={formatCount(profile.pointsHosted)} />
          </View>

          {blocked ? null : (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.followBtn, followingNow && styles.followingBtn]}
                onPress={toggleFollow}
                accessibilityRole="button"
                accessibilityState={{ selected: followingNow }}
                testID="host-profile-follow"
              >
                {followingNow ? (
                  <Check size={16} color={c.accent} strokeWidth={3} />
                ) : (
                  <UserPlus size={16} color={c.base} strokeWidth={2.5} />
                )}
                <Text style={[styles.followText, followingNow && styles.followingText]}>
                  {followingNow ? 'FOLLOWING' : 'FOLLOW'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.contactBtn, contactRequest?.status === 'pending' && !canContactDirectly && styles.contactBtnPending]}
                onPress={onContactPress}
                accessibilityRole="button"
                accessibilityLabel={
                  canContactDirectly
                    ? `Contact ${profile.handle}`
                    : contactRequest
                      ? 'Contact request sent'
                      : `Request contact details from ${profile.handle}`
                }
                testID="host-profile-contact"
              >
                {canContactDirectly ? (
                  <Mail size={16} color={c.accent} strokeWidth={2.5} />
                ) : contactRequest ? (
                  <Clock size={16} color={c.textMuted} strokeWidth={2.5} />
                ) : (
                  <Lock size={15} color={c.accent} strokeWidth={2.5} />
                )}
                <Text
                  style={[styles.contactText, !canContactDirectly && contactRequest ? styles.contactTextPending : null]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {canContactDirectly ? 'CONTACT' : contactRequest ? 'REQUESTED' : 'REQUEST CONTACT'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.sheet}>
          <View style={styles.pullBar} />

          {blocked ? (
            <View style={styles.blockedCard}>
              <EyeOff size={22} color={c.textMuted} strokeWidth={2} />
              <Text style={styles.blockedTitle}>You blocked {profile.handle}</Text>
              <Text style={styles.blockedBody}>Their Points and recaps are hidden from you.</Text>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => unblockUser(profile.handle)}
                accessibilityRole="button"
                testID="host-profile-unblock"
              >
                <Text style={styles.unblockText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {profile.bio ? (
                <>
                  <Text style={styles.sectionLabel}>ABOUT</Text>
                  <View style={styles.bioTile}>
                    <Text style={styles.bioText}>{profile.bio}</Text>
                  </View>
                </>
              ) : null}

              <View style={[styles.sectionHeader, styles.sectionSpaced]}>
                <Text style={[styles.sectionLabel, styles.sectionLabelInline]}>
                  PHOTOS{photos.length ? ` · ${photos.length}` : ''}
                </Text>
                {photos.length > PHOTO_PREVIEW ? (
                  <TouchableOpacity
                    onPress={() => setAllPhotosOpen(true)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    testID="host-photos-see-all"
                  >
                    <Text style={styles.seeAll}>See all</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {photos.length === 0 ? (
                <View style={styles.photosEmpty}>
                  <Images size={18} color={c.iconFaint} strokeWidth={2} />
                  <Text style={styles.empty}>No photos yet.</Text>
                </View>
              ) : (
                <View style={styles.photoTileCard}>
                  <View style={styles.photoGrid}>
                    {photos.slice(0, PHOTO_PREVIEW).map((entry, index) => {
                      const more = photos.length - PHOTO_PREVIEW;
                      const lastPreview = index === PHOTO_PREVIEW - 1 && more > 0;
                      return lastPreview ? (
                        <TouchableOpacity
                          key={entry.photo.id}
                          style={[styles.photoTile, styles.photoCell]}
                          onPress={() => setAllPhotosOpen(true)}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel={`See all ${photos.length} photos`}
                        >
                          <Image source={{ uri: entry.photo.uri }} style={styles.photoImage} />
                          <View style={styles.moreShade}>
                            <Text style={styles.moreText}>+{more + 1}</Text>
                          </View>
                        </TouchableOpacity>
                      ) : (
                        photoTile(entry, index, styles.photoCell)
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={[styles.sectionLabel, styles.sectionSpaced]}>POINTS</Text>
              {points.length === 0 ? (
                <Text style={styles.empty}>No Points coming up right now.</Text>
              ) : (
                <View style={styles.list}>
                  {points.map((point) => {
                    const live = isLiveNode(point);
                    const privacy = point.locationPrivacy as { regionName?: string } | null | undefined;
                    const where = privacy?.regionName ? `Somewhere in ${privacy.regionName}` : String(point.venue ?? '');
                    const tags = Array.isArray(point.tags) ? (point.tags as string[]) : [String(point.tag ?? '')];
                    return (
                      <TouchableOpacity
                        key={point.id}
                        style={styles.pointRow}
                        onPress={() => onOpenPoint(point.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${String(point.title)}`}
                        testID={`host-point-${point.id}`}
                      >
                        <CategoryBadge
                          tag={tags[0]}
                          title={String(point.title)}
                          photoUri={(point.coverPhotoUri as string | null | undefined) ?? null}
                          size={44}
                        />
                        <View style={styles.pointCopy}>
                          <Text style={styles.pointTitle} numberOfLines={1}>
                            {String(point.title)}
                          </Text>
                          <Text style={styles.pointWhere} numberOfLines={1}>
                            {where}
                          </Text>
                          {live ? (
                            <LiveBadge label="LIVE NOW" />
                          ) : (
                            <Text style={styles.pointWhen}>{String(point.status ?? '')}</Text>
                          )}
                        </View>
                        <ChevronRight size={18} color={c.iconFaint} strokeWidth={2.25} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <Text style={[styles.sectionLabel, styles.sectionSpaced]}>RECAPS</Text>
              {visibleRecaps.length === 0 ? (
                <Text style={styles.empty}>No recaps yet.</Text>
              ) : (
                <View style={styles.list}>
                  {visibleRecaps.map((item) => (
                    <RecapCard
                      key={item.id}
                      recap={item}
                      canReact
                      authorHandle={profile.handle}
                      onChange={(next) => setRecaps((current) => current.map((r) => (r.id === next.id ? next : r)))}
                      onDelete={() => undefined}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={[styles.menu, { marginBottom: insets.bottom + 16 }]} testID="host-profile-menu">
            <Text style={styles.menuTitle}>{profile.handle}</Text>
            <TouchableOpacity style={styles.menuRow} onPress={openReport} accessibilityRole="button" testID="host-profile-report">
              <Flag size={18} color={c.red} strokeWidth={2.25} />
              <View style={styles.menuCopy}>
                <Text style={styles.menuDanger}>Report profile</Text>
                <Text style={styles.menuHint}>Private. They won’t know it was you.</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            {blocked ? (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setMenuOpen(false);
                  unblockUser(profile.handle);
                }}
                accessibilityRole="button"
                testID="host-profile-unblock-menu"
              >
                <Ban size={18} color={c.textMuted} strokeWidth={2.25} />
                <View style={styles.menuCopy}>
                  <Text style={styles.menuText}>Unblock {profile.handle}</Text>
                  <Text style={styles.menuHint}>Show their Points and recaps again.</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.menuRow} onPress={confirmBlock} accessibilityRole="button" testID="host-profile-block">
                <Ban size={18} color={c.red} strokeWidth={2.25} />
                <View style={styles.menuCopy}>
                  <Text style={styles.menuDanger}>Block {profile.handle}</Text>
                  <Text style={styles.menuHint}>Hide their Points and recaps from you.</Text>
                </View>
              </TouchableOpacity>
            )}
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuCancel} onPress={() => setMenuOpen(false)} accessibilityRole="button">
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Every photo, three across. */}
      <Modal
        visible={allPhotosOpen}
        animationType="slide"
        onRequestClose={() => setAllPhotosOpen(false)}
        statusBarTranslucent
      >
        <View style={[styles.allPhotos, { paddingTop: insets.top + 8 }]} testID="host-photos-all">
          <View style={styles.allPhotosTop}>
            <View style={styles.allPhotosHeading}>
              <Text style={styles.allPhotosTitle}>Photos</Text>
              <Text style={styles.allPhotosSub}>
                {photos.length} from {profile.displayName}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setAllPhotosOpen(false)}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close photos"
            >
              <X size={20} color={c.text} strokeWidth={2.25} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={[styles.allPhotosGrid, { paddingBottom: insets.bottom + 24 }]}>
            {photos.map((entry, index) => photoTile(entry, index, styles.photoCell))}
          </ScrollView>
        </View>
        {/* Inside this Modal too, so the viewer opens on top of the grid. */}
        {allPhotosOpen ? (
          <PhotoViewer
            canReact
            caption={viewing?.from}
            photo={viewing?.photo ?? null}
            index={viewerIndex ?? 0}
            total={photos.length}
            onClose={() => setViewerIndex(null)}
            onChange={(next) => viewing && updatePhoto(viewing.recapId, next)}
            onStep={(step) => setViewerIndex((i) => Math.min(photos.length - 1, Math.max(0, (i ?? 0) + step)))}
          />
        ) : null}
      </Modal>

      {allPhotosOpen ? null : (
        <PhotoViewer
          canReact
          caption={viewing?.from}
          photo={viewing?.photo ?? null}
          index={viewerIndex ?? 0}
          total={photos.length}
          onClose={() => setViewerIndex(null)}
          onChange={(next) => viewing && updatePhoto(viewing.recapId, next)}
          onStep={(step) => setViewerIndex((i) => Math.min(photos.length - 1, Math.max(0, (i ?? 0) + step)))}
        />
      )}

      {/* Contact: email / call / text, or the pending request. */}
      <Modal visible={contactMenuOpen} transparent animationType="fade" onRequestClose={() => setContactMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setContactMenuOpen(false)}>
          <Pressable style={[styles.menu, { marginBottom: insets.bottom + 16 }]} testID="host-contact-menu">
            <Text style={styles.menuTitle}>CONTACT {profile.displayName.toUpperCase()}</Text>
            {canContactDirectly ? (
              <>
                {contact.email ? (
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => {
                      setContactMenuOpen(false);
                      void openLink(`mailto:${contact.email}`);
                    }}
                    accessibilityRole="button"
                    testID="host-contact-email"
                  >
                    <Mail size={18} color={c.accent} strokeWidth={2.25} />
                    <View style={styles.menuCopy}>
                      <Text style={styles.menuText}>Email</Text>
                      <Text style={styles.menuHint}>{contact.email}</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
                {contact.phone ? (
                  <>
                    {contact.email ? <View style={styles.menuDivider} /> : null}
                    <TouchableOpacity
                      style={styles.menuRow}
                      onPress={() => {
                        setContactMenuOpen(false);
                        void openLink(`tel:${phoneDigits}`);
                      }}
                      accessibilityRole="button"
                      testID="host-contact-call"
                    >
                      <Phone size={18} color={c.accent} strokeWidth={2.25} />
                      <View style={styles.menuCopy}>
                        <Text style={styles.menuText}>Call</Text>
                        <Text style={styles.menuHint}>{contact.phone}</Text>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.menuDivider} />
                    <TouchableOpacity
                      style={styles.menuRow}
                      onPress={() => {
                        setContactMenuOpen(false);
                        void openLink(`sms:${phoneDigits}`);
                      }}
                      accessibilityRole="button"
                      testID="host-contact-text"
                    >
                      <MessageSquare size={18} color={c.accent} strokeWidth={2.25} />
                      <View style={styles.menuCopy}>
                        <Text style={styles.menuText}>Text</Text>
                        <Text style={styles.menuHint}>{contact.phone}</Text>
                      </View>
                    </TouchableOpacity>
                  </>
                ) : null}
              </>
            ) : contactRequest ? (
              <>
                <View style={styles.menuRow}>
                  <Clock size={18} color={c.textMuted} strokeWidth={2.25} />
                  <View style={styles.menuCopy}>
                    <Text style={styles.menuText}>Request sent</Text>
                    <Text style={styles.menuHint}>
                      If {profile.displayName} accepts, their email and phone will show up here.
                    </Text>
                  </View>
                </View>
                <View style={styles.menuDivider} />
                <TouchableOpacity
                  style={styles.menuRow}
                  onPress={withdrawRequest}
                  accessibilityRole="button"
                  testID="host-contact-cancel-request"
                >
                  <X size={18} color={c.red} strokeWidth={2.25} />
                  <View style={styles.menuCopy}>
                    <Text style={styles.menuDanger}>Cancel request</Text>
                  </View>
                </TouchableOpacity>
              </>
            ) : null}
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuCancel} onPress={() => setContactMenuOpen(false)} accessibilityRole="button">
              <Text style={styles.menuCancelText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Private contact: ask the host to share it. */}
      <Modal visible={requestOpen} transparent animationType="slide" onRequestClose={() => setRequestOpen(false)}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.menuBackdrop} onPress={() => setRequestOpen(false)}>
            <Pressable
              style={[
                styles.requestSheet,
                { paddingBottom: insets.bottom + 16 },
                Platform.OS === 'android' ? { marginBottom: 12 + keyboardHeight } : null,
              ]}
              testID="host-contact-request"
            >
              <View style={styles.requestIcon}>
                <Lock size={20} color={c.accent} strokeWidth={2.25} />
              </View>
              <Text style={styles.requestTitle}>Request contact</Text>
              <Text style={styles.requestBody}>
                {profile.displayName} keeps their email and phone private. Send a request, and if they accept,
                their details will show up on this profile.
              </Text>
              <TextInput
                value={requestNote}
                onChangeText={(value) => setRequestNote(value.slice(0, CONTACT_NOTE_LIMIT))}
                placeholder="Add a note (optional), e.g. what you'd like to talk about"
                placeholderTextColor={c.textFaint}
                multiline
                textAlignVertical="top"
                style={styles.requestInput}
                testID="host-contact-note"
              />
              <Text style={styles.requestCount}>
                {requestNote.length}/{CONTACT_NOTE_LIMIT}
              </Text>
              <View style={styles.requestButtons}>
                <TouchableOpacity style={styles.requestCancel} onPress={() => setRequestOpen(false)} accessibilityRole="button">
                  <Text style={styles.requestCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.requestSend}
                  onPress={sendRequest}
                  accessibilityRole="button"
                  testID="host-contact-send"
                >
                  <Text style={styles.requestSendText}>SEND REQUEST</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <ReportSheet
        target={reporting}
        onClose={() => setReporting(null)}
        onReported={(_target, alsoBlocked) => {
          if (alsoBlocked) stopFollowing();
        }}
      />
    </View>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: { ...ABS_FILL, zIndex: 52, backgroundColor: c.base },
    scroll: { flex: 1 },
    hero: { paddingHorizontal: 16, paddingBottom: 28, backgroundColor: c.mapBase, overflow: 'hidden' },
    heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 160, backgroundColor: c.heroFade },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingRight: 8 },
    backText: { color: c.text, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
    flagBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(248, 113, 113, 0.16)',
      borderWidth: 1,
      borderColor: 'rgba(248, 113, 113, 0.55)',
    },
    menuBackdrop: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12, backgroundColor: 'rgba(2, 6, 23, 0.6)' },
    menu: {
      backgroundColor: c.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      paddingTop: 14,
      overflow: 'hidden',
    },
    menuTitle: { color: c.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1, textAlign: 'center', marginBottom: 6 },
    menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 14 },
    menuCopy: { flex: 1, gap: 2 },
    menuText: { color: c.text, fontSize: 15, fontWeight: '700' },
    menuDanger: { color: c.red, fontSize: 15, fontWeight: '800' },
    menuHint: { color: c.textMuted, fontSize: 12 },
    menuDivider: { height: 1, backgroundColor: c.border, marginHorizontal: 18 },
    menuCancel: { alignItems: 'center', paddingVertical: 15 },
    menuCancelText: { color: c.text, fontSize: 15, fontWeight: '800' },
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
    avatarImage: { width: '100%', height: '100%' },
    avatarInitial: { color: c.accent, fontSize: 44, fontWeight: '800' },
    nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
    name: { color: c.text, fontSize: 22, fontWeight: '800', flexShrink: 1 },
    handle: { color: c.accentSoft, fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 2 },
    joined: { color: c.textMuted, fontSize: 12, textAlign: 'center', marginTop: 4 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 18 },
    stat: { alignItems: 'center', gap: 2 },
    statLabel: { color: c.textSecondary, fontSize: 12, fontWeight: '700' },
    statValue: { color: c.text, fontSize: 22, fontWeight: '800' },
    flex: { flex: 1 },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
    contactBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      minHeight: 46,
      paddingHorizontal: 12,
      borderRadius: 23,
      borderWidth: 1.5,
      borderColor: c.accent,
      backgroundColor: c.glass,
    },
    contactBtnPending: { borderColor: c.borderStrong },
    contactText: { color: c.accent, fontSize: 13, fontWeight: '900', letterSpacing: 0.8, flexShrink: 1 },
    contactTextPending: { color: c.textMuted },
    requestSheet: {
      backgroundColor: c.surface,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: c.border,
      padding: 18,
      gap: 10,
      marginBottom: 12,
    },
    requestIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accentTint,
    },
    requestTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
    requestBody: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    requestInput: {
      minHeight: 88,
      backgroundColor: c.base,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      color: c.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    requestCount: { color: c.textFaint, fontSize: 11, alignSelf: 'flex-end', marginTop: -4 },
    requestButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
    requestCancel: {
      paddingHorizontal: 18,
      minHeight: 46,
      borderRadius: 23,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    requestCancelText: { color: c.text, fontSize: 14, fontWeight: '700' },
    requestSend: {
      flex: 1,
      minHeight: 46,
      borderRadius: 23,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    requestSendText: { color: c.base, fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
    followBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 46,
      borderRadius: 23,
      backgroundColor: c.accent,
    },
    followingBtn: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.accent },
    followText: { color: c.base, fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
    followingText: { color: c.accent },
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
    pullBar: { width: 44, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: 'center', marginBottom: 16 },
    sectionLabel: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
    sectionSpaced: { marginTop: 18 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    sectionLabelInline: { marginBottom: 0 },
    seeAll: { color: c.accent, fontSize: 13, fontWeight: '800' },
    photoTileCard: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 6,
    },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    // Three across; padding on the cell makes the gaps.
    photoCell: { width: '33.333%', aspectRatio: 1, padding: 3 },
    photoTile: { overflow: 'hidden' },
    photoImage: { flex: 1, width: '100%', borderRadius: 10, backgroundColor: c.surfaceDim },
    moreShade: {
      position: 'absolute',
      top: 3,
      left: 3,
      right: 3,
      bottom: 3,
      borderRadius: 10,
      backgroundColor: 'rgba(2, 6, 23, 0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    moreText: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
    photosEmpty: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    allPhotos: { flex: 1, backgroundColor: c.base },
    allPhotosTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
    allPhotosHeading: { flex: 1, gap: 2 },
    allPhotosTitle: { color: c.text, fontSize: 20, fontWeight: '800' },
    allPhotosSub: { color: c.textMuted, fontSize: 12 },
    closeBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.glass,
      borderWidth: 1,
      borderColor: c.border,
    },
    allPhotosGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 13 },
    bioTile: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    bioText: { color: c.textBody, fontSize: 14, lineHeight: 20 },
    list: { gap: 10 },
    pointRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
    },
    pointCopy: { flex: 1, gap: 3, alignItems: 'flex-start' },
    pointTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
    pointWhere: { color: c.textMuted, fontSize: 12 },
    pointWhen: { color: c.accentSoft, fontSize: 12, fontWeight: '700' },
    empty: { color: c.textFaint, fontSize: 13 },
    blockedCard: {
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
      marginTop: 4,
    },
    blockedTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    blockedBody: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
    unblockBtn: {
      marginTop: 6,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.accent,
    },
    unblockText: { color: c.accent, fontSize: 13, fontWeight: '800' },
  });
