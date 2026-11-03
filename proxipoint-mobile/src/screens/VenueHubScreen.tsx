import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
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
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Globe,
  MapPin,
  Navigation,
  ShieldCheck,
  Trees,
  X,
} from 'lucide-react-native';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme/ThemeContext';
import { useDiscoveryStore, type DiscoveryNode } from '../stores/useDiscoveryStore';
import { useAuthStore } from '../stores/useAuthStore';
import { PointCard } from '../components/discovery/PointCard';
import { CategoryBadge } from '../components/discovery/CategoryBadge';
import { PLACE_ICON, usePlaceIndex } from '../components/channels/PlacePicker';
import { pointsAtPlace, postsAtPlace, SAME_PLACE_METERS, type LocalPlace } from '../lib/localPlaces';
import { calculateDistanceMeters } from '../lib/locationFilter';
import { formatDistanceWordsIn, useUnits, getUnits } from '../lib/units';
import { useVisiblePosts, canSeePoint, type ChannelPost } from '../lib/channels';
import { isNodeAllowed, useModeration } from '../lib/moderation';
import { kindInfo } from '../lib/postKinds';
import { timeAgo } from '../lib/activity';
import { remoteEventToNode } from '../lib/remoteEvents';
import { fetchVenueHub, VENUES_URL, type ApiVenue } from '../services/venuesApi';
import {
  CLAIM_REVIEW_NOTE,
  CLAIM_ROLES,
  DISPUTE_KINDS,
  PUBLIC_SPACE_NOTE,
  VENUE_PAST_DAYS,
  claimBlocker,
  claimFormProblem,
  claimMethod,
  mergeById,
  splitVenueEvents,
  submitClaim,
  useMyClaims,
  venueInfo,
  venueKey,
  withdrawClaim,
  type ClaimForm,
  type ClaimRole,
  type DisputeKind,
} from '../lib/venues';

const ABS_FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

/** What a venue page is opened for: a place in the index, or a venue by name and spot. */
export interface VenueTarget {
  placeId?: string | null;
  name: string;
  latitude: number;
  longitude: number;
  venueId?: string | null;
}

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The place a target points at: by id, or by name close by. */
export function findVenuePlace(places: LocalPlace[], target: VenueTarget): LocalPlace | null {
  if (target.placeId) {
    const byId = places.find((place) => place.id === target.placeId);
    if (byId) return byId;
  }
  return (
    places.find(
      (place) =>
        norm(place.name) === norm(target.name) &&
        calculateDistanceMeters(place.latitude, place.longitude, target.latitude, target.longitude) <= SAME_PLACE_METERS,
    ) ?? null
  );
}

/**
 * A venue's hub: full screen, with the venue's name, what kind of place it is (bar, restaurant,
 * park, amphitheater, outdoor mall...), where it is, its upcoming events and the last 30 days of
 * events, and whether it's been claimed (claims go through review). Public spaces say anyone can
 * host there. Posts people left about the place come last.
 */
export const VenueHubScreen: React.FC<{
  target: VenueTarget;
  myLocation: { latitude: number; longitude: number };
  onBack: () => void;
  onOpenPoint: (id: string) => void;
  onToggleRsvp: (id: string) => void;
  onShowOnMap: (spot: { latitude: number; longitude: number }) => void;
  onOpenPost?: (id: string) => void;
}> = ({ target, myLocation, onBack, onOpenPoint, onToggleRsvp, onShowOnMap, onOpenPost }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  useUnits();
  const places = usePlaceIndex();
  const nodes = useDiscoveryStore((s) => s.nodes) as unknown as Record<string, DiscoveryNode>;
  const tenantId = useDiscoveryStore((s) => s.tenantId);
  const moderation = useModeration();
  const posts = useVisiblePosts();
  const myClaims = useMyClaims();
  const account = useAuthStore((s) => s.session?.account ?? null);

  const place: LocalPlace = useMemo(
    () =>
      findVenuePlace(places, target) ?? {
        id: target.placeId ?? `venue-${norm(target.name).replace(/ /g, '-')}`,
        name: target.name,
        kind: 'venue',
        latitude: target.latitude,
        longitude: target.longitude,
      },
    [places, target],
  );
  const venueId = target.venueId ?? place.venueId ?? null;

  // The server's page (kind, website, claim status, last 30 days) when the API is set up.
  const [remote, setRemote] = useState<{ venue: ApiVenue; upcoming: DiscoveryNode[]; past: DiscoveryNode[] } | null>(null);
  const [loading, setLoading] = useState(Boolean(venueId && VENUES_URL));
  useEffect(() => {
    if (!venueId || !VENUES_URL) return;
    const controller = new AbortController();
    setLoading(true);
    fetchVenueHub(tenantId, venueId, controller.signal)
      .then((hub) => {
        if (!hub) return;
        const now = new Date();
        setRemote({
          venue: hub.venue,
          upcoming: hub.upcoming.map((ev) => remoteEventToNode(ev, now)),
          past: hub.past.map((ev) => remoteEventToNode(ev, now)),
        });
      })
      .catch(() => undefined) // keep what's loaded on the phone
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [tenantId, venueId]);

  const info = venueInfo({
    name: remote?.venue.name ?? place.name,
    kind: place.kind,
    venueKind: remote?.venue.kind ?? null,
    publicSpace: remote?.venue.public_space ?? null,
  });
  const address = remote?.venue.address || place.address || place.area || '';
  const website = remote?.venue.website ?? null;
  const spot = { latitude: remote?.venue.latitude ?? place.latitude, longitude: remote?.venue.longitude ?? place.longitude };
  const meters = calculateDistanceMeters(myLocation.latitude, myLocation.longitude, spot.latitude, spot.longitude);

  // Events here: the ones loaded on the phone (they keep your RSVP), plus the server's.
  const { upcoming, past } = useMemo(() => {
    const local = pointsAtPlace(
      (Object.values(nodes || {}) as DiscoveryNode[]).filter((node) => isNodeAllowed(node) && canSeePoint(node) && !node.locationPrivacy),
      place,
    );
    const split = splitVenueEvents(mergeById(local, [...(remote?.upcoming ?? []), ...(remote?.past ?? [])]));
    return split;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, place, remote, moderation]);
  const here = useMemo(() => postsAtPlace(posts, place).slice(0, 6), [posts, place]);

  // Claim status: the server's, else what's known from events here; your own claim shows as pending.
  const key = venueKey({ name: place.name, venueId });
  const mine = myClaims.find((claim) => claim.venueKey === key) ?? null;
  const serverStatus = remote?.venue.claim_status ?? (place.claimStatus === 'claimed' ? 'claimed' : place.claimStatus === 'pending' ? 'pending' : 'unclaimed');
  const status = mine ? 'pending' : serverStatus;
  const verified = Boolean(remote?.venue.verified);
  const frozen = Boolean(remote?.venue.frozen);

  const [claiming, setClaiming] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const startClaim = () => {
    const blocker = claimBlocker({
      accountCreatedAt: account?.termsAcceptedAt ?? null,
      myPendingVenueKeys: myClaims.map((claim) => claim.venueKey),
      venueKey: key,
    });
    if (blocker) {
      Alert.alert('Can’t claim yet', blocker);
      return;
    }
    setClaiming(true);
  };

  const directions = async () => {
    const label = encodeURIComponent(place.name);
    const url =
      Platform.OS === 'ios'
        ? `maps://?q=${label}&ll=${spot.latitude},${spot.longitude}`
        : `geo:${spot.latitude},${spot.longitude}?q=${spot.latitude},${spot.longitude}(${label})`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Couldn’t open your maps app.');
    }
  };

  const KindIcon = info.publicSpace ? Trees : PLACE_ICON[place.kind];

  return (
    <View style={[styles.overlay, { paddingTop: insets.top }]} testID="venue-hub">
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back" testID="venue-back">
          <ChevronLeft size={20} color={c.text} strokeWidth={2.5} />
          <Text style={styles.backText}>BACK</Text>
        </TouchableOpacity>

        {/* ---- Who and what ---- */}
        <View style={styles.header}>
          <View style={[styles.icon, info.publicSpace && styles.iconPublic]}>
            <KindIcon size={28} color={info.publicSpace ? c.green : c.violet} strokeWidth={2.25} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.name} accessibilityRole="header">
              {remote?.venue.name ?? place.name}
            </Text>
            <View style={styles.chipRow}>
              <View style={[styles.kindChip, info.publicSpace && styles.kindChipPublic]} testID="venue-kind">
                <Text style={[styles.kindChipText, info.publicSpace && styles.kindChipTextPublic]}>
                  {info.publicSpace ? `Public space · ${info.label}` : info.label}
                </Text>
              </View>
              {info.claimable ? (
                <View style={[styles.statusChip, status === 'claimed' && styles.statusChipClaimed]} testID="venue-claim-status">
                  {status === 'claimed' ? (
                    <BadgeCheck size={12} color={c.accent} strokeWidth={2.5} />
                  ) : status === 'pending' ? (
                    <Clock size={12} color={c.amber} strokeWidth={2.5} />
                  ) : null}
                  <Text style={[styles.statusText, status === 'claimed' && styles.statusTextClaimed, status === 'pending' && styles.statusTextPending]}>
                    {status === 'claimed' ? (verified ? 'Verified' : 'Claimed') : status === 'pending' ? 'Claim in review' : 'Unclaimed'}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ---- Details ---- */}
        <View style={styles.details}>
          <View style={styles.detailRow}>
            <MapPin size={16} color={c.textMuted} strokeWidth={2.25} />
            <Text style={styles.detailText}>
              {[address, formatDistanceWordsIn(meters, getUnits())].filter(Boolean).join(' · ') || 'Location on the map'}
            </Text>
          </View>
          {website ? (
            <TouchableOpacity style={styles.detailRow} onPress={() => void Linking.openURL(website)} accessibilityRole="link" testID="venue-website">
              <Globe size={16} color={c.accent} strokeWidth={2.25} />
              <Text style={[styles.detailText, styles.linkText]} numberOfLines={1}>
                {website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
              </Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => onShowOnMap(spot)} accessibilityRole="button" testID="venue-show-on-map">
              <MapPin size={14} color={c.accent} strokeWidth={2.5} />
              <Text style={styles.actionText}>Show on map</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => void directions()} accessibilityRole="button" testID="venue-directions">
              <Navigation size={14} color={c.accent} strokeWidth={2.5} />
              <Text style={styles.actionText}>Directions</Text>
            </TouchableOpacity>
          </View>
        </View>

        {info.publicSpace ? (
          <View style={styles.publicNote} testID="venue-public-note">
            <Trees size={18} color={c.green} strokeWidth={2.25} />
            <Text style={styles.publicNoteText}>{PUBLIC_SPACE_NOTE}</Text>
          </View>
        ) : null}

        {/* ---- Claim ---- */}
        {info.claimable && status !== 'claimed' ? (
          <View style={styles.claimBox} testID="venue-claim">
            <View style={styles.claimHead}>
              <ShieldCheck size={16} color={c.violet} strokeWidth={2.25} />
              <Text style={styles.claimTitle}>
                {mine ? 'Your claim is in review' : status === 'pending' ? 'A claim is in review' : 'Run this place?'}
              </Text>
            </View>
            <Text style={styles.claimBody}>
              {mine
                ? `Submitted as ${CLAIM_ROLES.find((r) => r.id === mine.role)?.label ?? 'staff'} (${mine.workEmail}). ${
                    mine.method === 'email_domain' ? 'Confirm the link we emailed you; then a reviewer approves it. ' : ''
                  }${CLAIM_REVIEW_NOTE}`
                : status === 'pending'
                  ? 'Someone has asked to manage this page. Nobody else can claim it while that’s reviewed.'
                  : frozen
                    ? 'This page is locked while its ownership is reviewed.'
                    : 'Owners and event coordinators can claim this page to pin official Drops, update details and get notified when people meet here.'}
            </Text>
            {mine ? (
              <TouchableOpacity
                style={styles.claimSecondary}
                onPress={() => withdrawClaim(key)}
                accessibilityRole="button"
                testID="venue-claim-withdraw"
              >
                <Text style={styles.claimSecondaryText}>Withdraw claim</Text>
              </TouchableOpacity>
            ) : status === 'unclaimed' && !frozen ? (
              <TouchableOpacity style={styles.claimBtn} onPress={startClaim} accessibilityRole="button" testID="venue-claim-start">
                <Text style={styles.claimBtnText}>CLAIM THIS {info.publicSpace ? 'SPACE' : 'VENUE'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* ---- Events ---- */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>UPCOMING EVENTS{upcoming.length ? ` (${upcoming.length})` : ''}</Text>
          {loading ? <ActivityIndicator size="small" color={c.accent} /> : null}
        </View>
        {upcoming.length ? (
          <View style={styles.list}>
            {upcoming.map((node) => {
              const inStore = Boolean(nodes[node.id]);
              return (
                <PointCard
                  key={node.id}
                  node={nodes[node.id] ?? node}
                  distanceOnly
                  onOpen={() => (inStore ? onOpenPoint(node.id) : node.url ? void Linking.openURL(node.url) : undefined)}
                  onToggleRsvp={() => inStore && onToggleRsvp(node.id)}
                  testID={`venue-event-${node.id}`}
                />
              );
            })}
          </View>
        ) : (
          <Text style={styles.empty}>
            {info.publicSpace ? 'Nothing planned here yet. Drop a Point to start something.' : 'No upcoming events here yet.'}
          </Text>
        )}

        <Text style={[styles.sectionLabel, styles.sectionSpaced]}>LAST {VENUE_PAST_DAYS} DAYS{past.length ? ` (${past.length})` : ''}</Text>
        {past.length ? (
          <View style={styles.list}>
            {past.map((node) => (
              <TouchableOpacity
                key={node.id}
                style={styles.pastRow}
                onPress={() => (node.url ? void Linking.openURL(node.url) : undefined)}
                disabled={!node.url}
                accessibilityRole={node.url ? 'link' : 'text'}
                testID={`venue-past-${node.id}`}
              >
                <CategoryBadge tag={node.tags?.[0] ?? node.tag} title={node.title} photoUri={node.coverPhotoUri} size={34} />
                <View style={styles.pastCopy}>
                  <Text style={styles.pastTitle} numberOfLines={1}>
                    {node.title}
                  </Text>
                  <Text style={styles.pastMeta} numberOfLines={1}>
                    {pastWhen(node.startsAt)}
                    {node.tags?.[0] ? ` · ${node.tags[0]}` : ''}
                  </Text>
                </View>
                {node.url ? <ChevronRight size={16} color={c.iconFaint} strokeWidth={2.25} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>
            {venueId && VENUES_URL ? `No events here in the last ${VENUE_PAST_DAYS} days.` : `Events from the last ${VENUE_PAST_DAYS} days show here once they’ve been logged.`}
          </Text>
        )}

        {/* ---- What people said about it (Channels posts tied to the place) ---- */}
        {here.length ? (
          <>
            <Text style={[styles.sectionLabel, styles.sectionSpaced]}>CONVERSATIONS HERE</Text>
            <View style={styles.list}>
              {here.map((post) => (
                <PostRow key={post.id} post={post} onOpen={onOpenPost ? () => onOpenPost(post.id) : undefined} />
              ))}
            </View>
          </>
        ) : null}

        {info.claimable ? (
          <TouchableOpacity style={styles.disputeLink} onPress={() => setDisputing(true)} accessibilityRole="link" testID="venue-dispute">
            <Flag size={13} color={c.textMuted} strokeWidth={2.25} />
            <Text style={styles.disputeText}>Report an issue or dispute ownership</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <ClaimSheet
        visible={claiming}
        venueName={place.name}
        address={address}
        website={website}
        defaultEmail={account?.email ?? ''}
        onClose={() => setClaiming(false)}
        onSubmit={(form) => {
          const { method } = claimMethod(form.workEmail, website);
          // Server: POST /api/v1/venues/{tenant}/{venue}/claims (signed in); venue_claims in migration 012.
          submitClaim({
            venueKey: key,
            venueName: place.name,
            role: form.role as ClaimRole,
            fullName: form.fullName.trim(),
            workEmail: form.workEmail.trim(),
            businessPhone: form.businessPhone.trim(),
            proofNote: form.proofNote.trim(),
            method,
            submittedAt: new Date().toISOString(),
          });
          setClaiming(false);
          Alert.alert(
            'Claim submitted',
            method === 'email_domain'
              ? `We sent a verification link to ${form.workEmail.trim()}. Confirm it, and a reviewer will approve your claim. ${CLAIM_REVIEW_NOTE}`
              : `A reviewer will check the details you gave. ${CLAIM_REVIEW_NOTE}`,
          );
        }}
      />
      <DisputeSheet visible={disputing} venueName={place.name} onClose={() => setDisputing(false)} />
    </View>
  );
};

function pastWhen(iso?: string): string {
  if (!iso) return 'Ended';
  const date = new Date(iso);
  return `Ended · ${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

const PostRow: React.FC<{ post: ChannelPost; onOpen?: () => void }> = ({ post, onOpen }) => {
  const styles = useThemedStyles(createStyles);
  const kind = post.kind && post.kind !== 'chat' ? kindInfo(post.kind).label.toUpperCase() : null;
  return (
    <TouchableOpacity style={styles.postRow} onPress={onOpen} disabled={!onOpen} accessibilityRole="button">
      <Text style={styles.postBody} numberOfLines={2}>
        {kind ? <Text style={styles.postKind}>{kind} </Text> : null}
        {post.body || 'Photo post'}
      </Text>
      <Text style={styles.pastMeta}>{[post.author, timeAgo(post.createdAt, Date.now())].filter(Boolean).join(' · ')}</Text>
    </TouchableOpacity>
  );
};

// ---- Claim sheet -------------------------------------------------------------------------------

const EMPTY_FORM: ClaimForm = { role: null, fullName: '', workEmail: '', businessPhone: '', proofNote: '' };

const ClaimSheet: React.FC<{
  visible: boolean;
  venueName: string;
  address: string;
  website: string | null;
  defaultEmail: string;
  onClose: () => void;
  onSubmit: (form: ClaimForm) => void;
}> = ({ visible, venueName, address, website, defaultEmail, onClose, onSubmit }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<ClaimForm>(EMPTY_FORM);
  const [error, setError] = useState('');
  useEffect(() => {
    if (visible) {
      setForm({ ...EMPTY_FORM, workEmail: defaultEmail });
      setError('');
    }
  }, [visible, defaultEmail]);
  const set = <K extends keyof ClaimForm>(k: K, v: ClaimForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError('');
  };
  const { method, domainMatches } = claimMethod(form.workEmail, website);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.workEmail.trim());
  const submit = () => {
    const problem = claimFormProblem(form, website);
    if (problem) {
      setError(problem);
      return;
    }
    onSubmit(form);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="venue-claim-sheet">
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>CLAIM THIS VENUE</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
              <X size={20} color={c.textMuted} strokeWidth={2.25} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
            <Text style={styles.sheetVenue}>{venueName}</Text>
            {address ? <Text style={styles.sheetMeta}>{address}</Text> : null}
            <Text style={styles.sheetBody}>
              Are you the official owner or event coordinator here? Claiming lets you pin official Drops, update hours and details, and get
              notified when people meet here.
            </Text>

            <Text style={styles.fieldLabel}>Your role at this venue</Text>
            <View style={styles.roleRow}>
              {CLAIM_ROLES.map((role) => {
                const on = form.role === role.id;
                return (
                  <TouchableOpacity
                    key={role.id}
                    style={[styles.roleChip, on && styles.roleChipOn]}
                    onPress={() => set('role', role.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    testID={`venue-claim-role-${role.id}`}
                  >
                    <Text style={[styles.roleText, on && styles.roleTextOn]}>{role.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Full name</Text>
            <TextInput
              value={form.fullName}
              onChangeText={(v) => set('fullName', v)}
              placeholder="Your full name"
              placeholderTextColor={c.textFaint}
              style={styles.input}
              maxLength={120}
              testID="venue-claim-name"
            />

            <Text style={styles.fieldLabel}>Work / official email</Text>
            <TextInput
              value={form.workEmail}
              onChangeText={(v) => set('workEmail', v)}
              placeholder={website ? `name@${website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}` : 'name@yourvenue.com'}
              placeholderTextColor={c.textFaint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              testID="venue-claim-email"
            />
            {emailOk ? (
              <Text style={[styles.methodNote, method === 'email_domain' && styles.methodNoteGood]} testID="venue-claim-method">
                {method === 'email_domain'
                  ? domainMatches
                    ? 'Matches the venue’s website: we’ll email a verification link to it.'
                    : 'We’ll email a verification link to this address.'
                  : 'Personal emails (Gmail, Yahoo…) can’t verify a venue on their own. Add the business phone or how the reviewer can confirm it’s you.'}
              </Text>
            ) : null}

            <Text style={styles.fieldLabel}>Business phone{method === 'manual' ? '' : ' (optional)'}</Text>
            <TextInput
              value={form.businessPhone}
              onChangeText={(v) => set('businessPhone', v)}
              placeholder="(303) 555-0100"
              placeholderTextColor={c.textFaint}
              keyboardType="phone-pad"
              style={styles.input}
              testID="venue-claim-phone"
            />

            {method === 'manual' ? (
              <>
                <Text style={styles.fieldLabel}>How can we confirm it’s you?</Text>
                <TextInput
                  value={form.proofNote}
                  onChangeText={(v) => set('proofNote', v)}
                  placeholder="e.g. I can send our liquor license or a business card"
                  placeholderTextColor={c.textFaint}
                  style={[styles.input, styles.inputTall]}
                  multiline
                  maxLength={500}
                  testID="venue-claim-proof"
                />
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={styles.submitBtn} onPress={submit} accessibilityRole="button" testID="venue-claim-submit">
              <Text style={styles.submitText}>SUBMIT CLAIM REQUEST</Text>
            </TouchableOpacity>
            <Text style={styles.sheetMeta}>{CLAIM_REVIEW_NOTE}</Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ---- Dispute sheet -----------------------------------------------------------------------------

const DisputeSheet: React.FC<{ visible: boolean; venueName: string; onClose: () => void }> = ({ visible, venueName, onClose }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<DisputeKind>('ownership');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (visible) {
      setKind('ownership');
      setMessage('');
    }
  }, [visible]);
  const ok = message.trim().length >= 5;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="venue-dispute-sheet">
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>REPORT AN ISSUE</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
              <X size={20} color={c.textMuted} strokeWidth={2.25} />
            </TouchableOpacity>
          </View>
          <Text style={styles.sheetVenue}>{venueName}</Text>
          <View style={[styles.roleRow, { marginTop: 10 }]}>
            {DISPUTE_KINDS.map((k) => (
              <TouchableOpacity
                key={k.id}
                style={[styles.roleChip, kind === k.id && styles.roleChipOn]}
                onPress={() => setKind(k.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: kind === k.id }}
              >
                <Text style={[styles.roleText, kind === k.id && styles.roleTextOn]}>{k.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={kind === 'ownership' ? 'Tell us who should run this page and how we can confirm it.' : 'What’s wrong?'}
            placeholderTextColor={c.textFaint}
            style={[styles.input, styles.inputTall, { marginTop: 10 }]}
            multiline
            maxLength={2000}
            testID="venue-dispute-message"
          />
          <TouchableOpacity
            style={[styles.submitBtn, !ok && styles.submitOff]}
            disabled={!ok}
            onPress={() => {
              // Server: venue_disputes (migration 012); an admin can freeze the page while it's checked.
              onClose();
              Alert.alert('Thanks for letting us know', 'Our team will look into it. Ownership disputes can lock the page while official paperwork is re-checked.');
            }}
            accessibilityRole="button"
            testID="venue-dispute-send"
          >
            <Text style={styles.submitText}>SEND</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: { ...ABS_FILL, zIndex: 52, backgroundColor: c.base },
    scroll: { flex: 1 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, alignSelf: 'flex-start' },
    backText: { color: c.text, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
    icon: {
      width: 60,
      height: 60,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.violetTint,
      borderWidth: 1,
      borderColor: c.violet,
    },
    iconPublic: { backgroundColor: c.greenTint, borderColor: c.green },
    headerCopy: { flex: 1, gap: 8 },
    name: { color: c.text, fontSize: 24, fontWeight: '800' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    kindChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: c.violetTint },
    kindChipPublic: { backgroundColor: c.greenTint },
    kindChipText: { color: c.violetText, fontSize: 12, fontWeight: '800' },
    kindChipTextPublic: { color: c.green },
    statusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    statusChipClaimed: { borderColor: c.accentBorder, backgroundColor: c.accentTint },
    statusText: { color: c.textMuted, fontSize: 12, fontWeight: '700', fontStyle: 'italic' },
    statusTextClaimed: { color: c.accent, fontStyle: 'normal', fontWeight: '800' },
    statusTextPending: { color: c.amber, fontStyle: 'normal' },
    details: { marginTop: 16, gap: 10 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    detailText: { flex: 1, color: c.textSecondary, fontSize: 14 },
    linkText: { color: c.accent, fontWeight: '700' },
    actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.accentBorder,
      backgroundColor: c.surface,
    },
    actionText: { color: c.accent, fontSize: 13, fontWeight: '800' },
    publicNote: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 16,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.green,
      backgroundColor: c.greenTint,
    },
    publicNoteText: { flex: 1, color: c.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: '600' },
    claimBox: { marginTop: 16, padding: 14, gap: 8, borderRadius: 14, borderWidth: 1, borderColor: c.violet, backgroundColor: c.violetTint },
    claimHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    claimTitle: { color: c.text, fontSize: 14, fontWeight: '800' },
    claimBody: { color: c.textSecondary, fontSize: 13, lineHeight: 18 },
    claimBtn: { marginTop: 4, alignItems: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: c.violet },
    claimBtnText: { color: c.white, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
    claimSecondary: { marginTop: 4, alignSelf: 'flex-start', paddingVertical: 6 },
    claimSecondaryText: { color: c.violetText, fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 8 },
    sectionLabel: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
    sectionSpaced: { marginTop: 24, marginBottom: 8 },
    list: { gap: 10 },
    empty: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    pastRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      opacity: 0.85,
    },
    pastCopy: { flex: 1, gap: 2 },
    pastTitle: { color: c.text, fontSize: 14, fontWeight: '700' },
    pastMeta: { color: c.textMuted, fontSize: 12 },
    postRow: { padding: 12, gap: 4, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    postBody: { color: c.textBody, fontSize: 14, lineHeight: 19 },
    postKind: { color: c.violet, fontSize: 11, fontWeight: '900' },
    disputeLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 28, padding: 6 },
    disputeText: { color: c.textMuted, fontSize: 12, textDecorationLine: 'underline' },
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
      maxHeight: '90%',
      paddingHorizontal: 18,
      paddingTop: 16,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      backgroundColor: c.sheet,
    },
    sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    sheetTitle: { color: c.text, fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
    sheetVenue: { color: c.text, fontSize: 18, fontWeight: '800' },
    sheetMeta: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    sheetBody: { color: c.textSecondary, fontSize: 13, lineHeight: 18 },
    fieldLabel: { color: c.textMuted, fontSize: 12, fontWeight: '700', marginTop: 4 },
    roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    roleChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    roleChipOn: { borderColor: c.violet, backgroundColor: c.violetTint },
    roleText: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
    roleTextOn: { color: c.violetText, fontWeight: '800' },
    input: {
      color: c.text,
      fontSize: 15,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    inputTall: { minHeight: 80, textAlignVertical: 'top' },
    methodNote: { color: c.amber, fontSize: 12, lineHeight: 17, fontWeight: '600' },
    methodNoteGood: { color: c.green },
    error: { color: c.red, fontSize: 12, fontWeight: '700' },
    submitBtn: { marginTop: 6, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: c.violet },
    submitOff: { opacity: 0.45 },
    submitText: { color: c.white, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  });
