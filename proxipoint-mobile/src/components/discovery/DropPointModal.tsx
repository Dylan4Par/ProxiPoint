import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
  Share,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  Building2,
  EyeOff,
  Map as MapIcon,
  Calendar,
  ChevronDown,
  Crosshair,
  Repeat,
  Globe,
  Landmark,
  Lock,
  MapPin,
  Users,
  Link2,
  Rocket,
  UserPlus,
  ImagePlus,
  Move,
  RotateCcw,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import {
  addEmailInvite,
  addPhoneInvite,
  addProxiPointInvite,
  removeInvite,
  type BeaconInvite,
  type InviteKind,
} from '../../lib/beaconInvite';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import {
  BEACON_DESCRIPTION_WORD_LIMIT,
  clampBeaconDescription,
  countBeaconWords,
  createBeaconDraft,
  GEOCODE_DEBOUNCE_MS,
  normalizeVisibility,
  parseBeaconTags,
  toBeaconCreatePayload,
} from '../../lib/beaconDraft';
import { useChannels, type Channel } from '../../lib/channels';
import { canPostIn } from '../../lib/channelAccess';
import { BeaconApiError, postBeacon } from '../../services/beaconApi';
import { cleanVenueLabel, shareMessage, shareUrl, type DroppedPoint } from '../../lib/droppedPoint';
import {
  BOUNDARY_RADII,
  getRecommendedTier,
  inferPlaceType,
  resolveBoundaryTiers,
} from '../../lib/boundaryTiers';
import { captureCurrentFix, geocodePlaces } from '../../services/placeGeocoder';
import { nearestPlace } from '../../lib/placeSearch';
import { WhenChip } from './WhenChip';
import { MapRecenterButton, MapZoomStack, mapControlPositions } from './MapControls';
import { tourTarget } from '../tour/tourTargets';
import { dropRangeError } from '../../lib/dropRange';
import { useUnits } from '../../lib/units';
import { ensurePhotoPolicyAccepted } from '../../lib/photoPolicy';
import { cropToCircle } from '../../lib/coverPhoto';
import { currentPosition } from '../../lib/places';
import { PhotoRulesNote } from '../safety/PhotoRulesNote';
import { rememberTags, tagsToInput, useTagField } from '../../lib/tagInput';
import { DiscoveryLeafletMap, type DropAnimation, type PrivacyMapPreview } from './DiscoveryLeafletMap';
import {
  lookupPrivacyRegions,
  type LatLon,
  type PrivacyRegion,
  type PrivacyRegionLevel,
  type RegionGeometry,
} from '../../services/regionLookup';
import {
  applyDateInput,
  applyTimeInput,
  changeWindowEnd,
  changeWindowStart,
  formatBeaconDate,
  formatBeaconStart,
  formatBeaconTime,
  liveBeaconWindow,
  slideLiveWindow,
  presetForHours,
  windowDurationHours,
} from '../../lib/beaconWindow';
import {
  NO_REPEAT,
  REPEAT_OPTIONS,
  describeRepeat,
  followStart,
  previewNextDates,
  ruleForFrequency,
  toRepeatPayload,
  toggleRepeatWeekday,
  validateRepeat,
  weekdayLetter,
  weekdayShort,
  type RepeatRule,
} from '../../lib/recurrence';
import {
  type BeaconVisibility,
  type BoundaryTierLevel,
  type PlaceSuggestion,
} from '../../types/beacon';
import { useNavBarHeight } from './BottomNavBar';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';
import { KeyboardAwareScrollView } from '../common/KeyboardAwareScrollView';

const NAV_BAR_HEIGHT = 72;

interface DropPointModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful drop, so the screen can open the Manage sheet. */
  onDropped?: (point: DroppedPoint) => void;
  /**
   * "Drop again": an earlier Point to copy into the sheet. Everything is filled in except the
   * time, which starts as Live Now with the same length as the original.
   */
  prefill?: DroppedPoint | null;
}

const VISIBILITY_OPTIONS: Array<{
  id: BeaconVisibility;
  label: string;
  accent: string;
  Icon: LucideIcon;
  hint: string;
}> = [
  {
    id: 'private',
    label: 'Private',
    accent: '#f59e0b',
    Icon: Lock,
    hint: 'Only people you invite can see this Point.',
  },
  {
    id: 'channel',
    label: 'Channel',
    accent: '#a78bfa',
    Icon: Users,
    hint: 'Only members of the channel you pick can see this Point.',
  },
  {
    id: 'public',
    label: 'Public',
    accent: '#34d399',
    Icon: Globe,
    hint: 'Anyone nearby on ProxiPoint can see this Point.',
  },
];

/** The one-line summary under the perimeter chips, worded for the chosen visibility. */
function describeReach(visibility: BeaconVisibility, tags: string, radius: string, channelName?: string): string {
  if (visibility === 'public') return `Visible to anyone on ProxiPoint within ${radius}.`;
  if (visibility === 'channel') {
    return channelName ? `Visible to ${channelName} members within ${radius}.` : `Pick a channel to choose who sees this within ${radius}.`;
  }
  const tagList = parseBeaconTags(tags)
    .map((tag) => `#${tag.replace(/^#+/, '')}`)
    .slice(0, 3);
  if (tagList.length === 0) return `Visible to people you invite within ${radius}.`;
  const more = parseBeaconTags(tags).length > tagList.length ? ' and more' : '';
  return `Broadcasting to people following ${tagList.join(', ')}${more} within ${radius}.`;
}


/** Chip label and icon for each kind of region the host can hide inside. */
const PRIVACY_LEVELS: Record<PrivacyRegionLevel, { label: string; Icon: LucideIcon }> = {
  street: { label: 'Street', Icon: MapPin },
  neighborhood: { label: 'Neighborhood', Icon: Building2 },
  city: { label: 'City', Icon: MapIcon },
};
/** Radius of a circle with the same area as a region outline (used when a named area is moved). */
function equivalentRadiusMeters(geometry: RegionGeometry): number {
  const rings: number[][][] =
    geometry.type === 'Polygon'
      ? [(geometry.coordinates as number[][][])[0]]
      : (geometry.coordinates as number[][][][]).map((polygon) => polygon[0]);
  let areaM2 = 0;
  rings.forEach((ring) => {
    if (!ring || ring.length < 3) return;
    const lat0 = (ring.reduce((sum, point) => sum + point[1], 0) / ring.length) * (Math.PI / 180);
    const mx = 111320 * Math.cos(lat0);
    const my = 110540;
    let twice = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      twice += x1 * mx * (y2 * my) - x2 * mx * (y1 * my);
    }
    areaM2 += Math.abs(twice) / 2;
  });
  return Math.max(100, Math.round(Math.sqrt(areaM2 / Math.PI)));
}

/** Where the host dragged an area to. Keyed by region id. */
interface RegionMove {
  center: LatLon;
  radiusMeters: number;
}

/** Cover photos are saved as square JPEGs this size and shown as circles. */
const COVER_PHOTO_SIZE = 512;

interface CoverPhoto {
  uri: string;
  base64?: string;
}
const DEFAULT_MAX_ATTENDANCE = 10;
const MAX_ATTENDANCE_LIMIT = 9999;

/**
 * Keeps the invite field as "@handle": adds the @ for the user, ignores extra @s,
 * and drops spaces and symbols that can't be part of a handle.
 * Clearing the field completely (backspacing over the @) leaves it empty.
 */
function formatHandleInput(raw: string): string {
  if (raw === '') return '';
  const handle = raw.replace(/@/g, '').replace(/[^A-Za-z0-9_.-]/g, '');
  return `@${handle}`;
}



/**
 * Cyan glow around a box that holds text fields.
 * The glow is a separate layer that only fades in and out, so switching it on never restyles
 * the box itself. On Android, adding a shadow/elevation to the box while someone is typing in it
 * can make the field lose focus and close the keyboard.
 */
function GlowFrame({ active, children }: { active: boolean; children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View>
      <View pointerEvents="none" style={[styles.glowLayer, { opacity: active ? 1 : 0 }]} />
      {children}
    </View>
  );
}

function TierGlyph({ id, active }: { id: BoundaryTierLevel; active: boolean }) {
  const { colors: c } = useTheme();
  const color = active ? c.text : c.textSecondary;
  const props = { size: 18, color, strokeWidth: 2.25 };
  if (id === 'micro') return <MapPin {...props} />;
  if (id === 'neighborhood') return <Building2 {...props} />;
  return <Landmark {...props} />;
}

export const DropPointModal: React.FC<DropPointModalProps> = ({ visible, onClose, onDropped, prefill = null }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c, tone } = useTheme();
  const insets = useSafeAreaInsets();
  const navBarHeight = useNavBarHeight();
  const rawAndroidHeight = StatusBar.currentHeight ?? 0;
  const resolvedTop =
    Platform.OS === 'android'
      ? Math.max(rawAndroidHeight, insets.top, 56)
      : Math.max(insets.top, 24);

  const selfCoordinates = useDiscoveryStore((state) => state.selfCoordinates);
  const units = useUnits();
  /** Points can only be dropped within 100 mi of you; null when `spot` is in range. */
  const rangeError = (spot: { latitude: number; longitude: number }) =>
    dropRangeError({ latitude: selfCoordinates.latitude, longitude: selfCoordinates.longitude }, spot, units);
  const dropBeacon = useDiscoveryStore((state) => state.dropBeacon);
  const adoptPersistedBeacon = useDiscoveryStore((state) => state.adoptPersistedBeacon);
  const setPreviewGeofence = useDiscoveryStore((state) => state.setPreviewGeofence);
  // Existing beacons feed the hashtag suggestions. If your store keeps them under a different
  // name than `beacons`/`events`, point this selector at that list.
  const knownBeacons = useDiscoveryStore((state) => {
    const store = state as unknown as { beacons?: unknown[]; events?: unknown[] };
    return store.beacons ?? store.events;
  });

  const [visibility, setVisibility] = useState<BeaconVisibility>('public');
  // Channel the Point is posted to: required for Channel visibility, optional for the others.
  const [channelId, setChannelId] = useState<string | null>(null);
  const allChannels = useChannels();
  const initialWindow = useRef(liveBeaconWindow());
  const [isLiveNow, setIsLiveNow] = useState(true);
  const [startsAt, setStartsAt] = useState(initialWindow.current.startsAt);
  const [endsAt, setEndsAt] = useState(initialWindow.current.endsAt);
  // Repeat only applies to scheduled events; Live Now is always a one-off.
  const [repeat, setRepeat] = useState<RepeatRule>(NO_REPEAT);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const durationRef = useRef(initialWindow.current.endsAt.getTime() - initialWindow.current.startsAt.getTime());
  const clockHold = useRef(0);
  // The sheet's scroll view and the Live Now / Schedule card, so newly shown options can be scrolled into view.
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const whenCardRef = useRef<View>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const tagField = useTagField(tags, setTags, knownBeacons);
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
  const [inviteKind, setInviteKind] = useState<InviteKind>('proxipoint');
  // "Link" tab: open the share sheet with the Point's link as soon as it's dropped.
  const [shareAfterDrop, setShareAfterDrop] = useState(false);
  const [handleInput, setHandleInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [mapPicking, setMapPicking] = useState(false);
  // Select on map: the spot under the fixed center pin, and where to move the map.
  const pickCenter = useRef<{ latitude: number; longitude: number } | null>(null);
  const [pickFocus, setPickFocus] = useState<{ key: number; latitude: number; longitude: number; zoom?: number } | null>(
    null,
  );
  const [locatingPick, setLocatingPick] = useState(false);
  const [pickNotice, setPickNotice] = useState('');
  // Select on map: + / − buttons (same as Explore Map's).
  const [pickZoom, setPickZoom] = useState<{ key: number; delta: number } | null>(null);
  const [perimeterOn, setPerimeterOn] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [maxAttendance, setMaxAttendance] = useState<number | null>(null);
  const [coverPhoto, setCoverPhoto] = useState<CoverPhoto | null>(null);
  const [privacyOn, setPrivacyOn] = useState(false);
  const [privacyRegions, setPrivacyRegions] = useState<PrivacyRegion[]>([]);
  const [privacyRegionId, setPrivacyRegionId] = useState<string | null>(null);
  const [privacySource, setPrivacySource] = useState<'server' | 'approximate'>('approximate');
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [regionMoves, setRegionMoves] = useState<Record<string, RegionMove>>({});
  const [privacyMoving, setPrivacyMoving] = useState(false);
  const [movingSnapshot, setMovingSnapshot] = useState<PrivacyMapPreview | null>(null);
  const [dropAnimation, setDropAnimation] = useState<DropAnimation | null>(null);
  const reducedMotion = useRef(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const skipSearch = useRef(false);
  const selectedLabel = useRef<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Drafts: the sheet keeps what you've filled in while you visit other tabs. It only starts
   * fresh after the ✕, after a successful drop, or when "Drop again" loads a different Point.
   */
  const draftCleared = useRef(true);
  const appliedPrefillId = useRef<string | null>(null);
  /** "Start over": clears the form in place (ignoring any "Drop again" source). */
  const startingOver = useRef(false);
  const [resetKey, setResetKey] = useState(0);
  const [confirmingStartOver, setConfirmingStartOver] = useState(false);
  /** Spot the privacy regions were last looked up for (moved areas survive a re-open). */
  const lastRegionSpot = useRef<string | null>(null);
  /** Privacy level to pick once regions load (set by "Drop again"). */
  const preferredPrivacyLevel = useRef<string | null>(null);

  const boundaryTiers = useMemo(
    () => resolveBoundaryTiers({ placeName: placeLabel, placeType }),
    [placeLabel, placeType],
  );
  const activeTier = boundaryTiers.find((tier) => tier.id === selectedTier) ?? boundaryTiers[0];
  const baseRegion = privacyRegions.find((region) => region.id === privacyRegionId) ?? null;
  const regionMove = baseRegion ? regionMoves[baseRegion.id] : undefined;
  // A moved area becomes a circle of the same size, centered where the host dropped it.
  const selectedRegion: PrivacyRegion | null =
    baseRegion && regionMove
      ? {
          ...baseRegion,
          name: baseRegion.geometry ? `Near ${baseRegion.name}` : baseRegion.name,
          center: regionMove.center,
          radiusMeters: regionMove.radiusMeters,
          geometry: undefined,
        }
      : baseRegion;

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Respect the system "Reduce motion" setting for the drop animation.
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) reducedMotion.current = enabled;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reducedMotion.current = enabled;
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const startOver = startingOver.current;
    startingOver.current = false;
    const loadingPrefill = !startOver && prefill != null && prefill.id !== appliedPrefillId.current;
    if (!startOver && !loadingPrefill && !draftCleared.current) {
      // Back to an unfinished draft: keep every field, only reset the in-between UI.
      setSubmitting(false);
      setRevealing(false);
      setMapPicking(false);
      setPrivacyMoving(false);
      setMovingSnapshot(null);
      setDropAnimation(null);
      setSuggestions([]);
      setSearching(false);
      setLocating(false);
      setFormError(null);
      clockHold.current = 0;
      // A Live Now draft whose end has already passed gets a fresh default window.
      if (isLiveNow && endsAt.getTime() <= Date.now() + 60 * 1000) {
        const fresh = liveBeaconWindow();
        durationRef.current = fresh.endsAt.getTime() - fresh.startsAt.getTime();
        setStartsAt(fresh.startsAt);
        setEndsAt(fresh.endsAt);
      }
      return;
    }
    draftCleared.current = false;
    appliedPrefillId.current = prefill?.id ?? null;
    // Start over = blank form, even if the sheet was opened from "Drop again".
    const source = startOver ? null : prefill;
    lastRegionSpot.current = null;

    const window = liveBeaconWindow();
    durationRef.current = window.endsAt.getTime() - window.startsAt.getTime();
    clockHold.current = 0;
    setVisibility('public');
    setChannelId(null);
    setIsLiveNow(true);
    setStartsAt(window.startsAt);
    setEndsAt(window.endsAt);
    setRepeat(NO_REPEAT);
    setRepeatOpen(false);
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
    setInviteKind('proxipoint');
    setShareAfterDrop(false);
    setHandleInput('');
    setPhoneInput('');
    setEmailInput('');
    setInviteError('');
    setMapPicking(false);
    setPerimeterOn(false);
    setRequiresApproval(false);
    setMaxAttendance(null);
    setCoverPhoto(null);
    setPrivacyOn(false);
    setPrivacyRegions([]);
    setPrivacyRegionId(null);
    setRegionsLoading(false);
    setRegionMoves({});
    setPrivacyMoving(false);
    setMovingSnapshot(null);
    setDropAnimation(null);
    setPhotoBusy(false);
    skipSearch.current = false;
    selectedLabel.current = null;
    preferredPrivacyLevel.current = null;
    setPreviewGeofence(null);

    if (!source) return;

    // ---- "Drop again": copy the earlier Point into the sheet ----
    // Old 'tag_network' Points come back as Public.
    setVisibility(normalizeVisibility(source.visibility));
    setChannelId(source.channelId ?? null);
    setTitle(source.title);
    setDescription(source.description);
    setTags(tagsToInput(source.tags));
    setRequiresApproval(source.requiresApproval);
    setMaxAttendance(source.maxAttendance);
    setInvites(source.invites);
    setInviteOpen(source.visibility === 'private' && source.invites.length > 0);

    // Time: the old dates are over, so start Live Now with the same length as the original.
    const originalMs = new Date(source.endsAt).getTime() - new Date(source.startsAt).getTime();
    if (Number.isFinite(originalMs) && originalMs >= 15 * 60 * 1000) {
      const start = window.startsAt;
      const end = new Date(start.getTime() + originalMs);
      durationRef.current = originalMs;
      setStartsAt(start);
      setEndsAt(end);
    }

    // Location: same spot and venue name, without kicking off a new search.
    const venue = cleanVenueLabel(source.venue);
    skipSearch.current = true;
    selectedLabel.current = venue;
    setLocationSearch(venue);
    setCoords({ lat: source.latitude, lon: source.longitude });
    const semantic = inferPlaceType(venue, undefined);
    setPlaceLabel(venue);
    setPlaceType(semantic);

    // Beacon: same reach (matched by its label, e.g. "300m"), or the place's usual tier if off.
    const tiers = resolveBoundaryTiers({ placeName: venue, placeType: semantic });
    const matchedTier = source.beaconRadius
      ? tiers.find((tier) => tier.displayRadius === source.beaconRadius)
      : undefined;
    const tierId = matchedTier?.id ?? getRecommendedTier(semantic);
    setSelectedTier(tierId);
    setSelectedRadiusMeters(BOUNDARY_RADII[tierId]);
    setPerimeterOn(source.beaconRadius != null);

    // Location privacy: same level; the regions are looked up again from the spot.
    if (source.locationPrivacy) {
      preferredPrivacyLevel.current = source.locationPrivacy.level;
      setPrivacyOn(true);
    }

    // Cover photo: re-encode the saved file so the photo is sent with the new Point too.
    if (source.coverPhotoUri) {
      const uri = source.coverPhotoUri;
      setCoverPhoto({ uri });
      setPhotoBusy(true);
      void ImageManipulator.manipulateAsync(uri, [], {
        compress: 0.75,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      })
        .then((output) => setCoverPhoto({ uri: output.uri, base64: output.base64 }))
        .catch(() => setCoverPhoto(null)) // file no longer on the phone; pick it again
        .finally(() => setPhotoBusy(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, prefill, resetKey, setPreviewGeofence]);

  useEffect(() => {
    if (!visible || !isLiveNow) return;
    const tick = () => {
      if (Platform.OS === 'web') {
        const activeId = document.activeElement?.getAttribute?.('data-testid') ?? '';
        if (activeId.startsWith('drop-start-') || activeId.startsWith('drop-end-')) return;
      } else if (clockHold.current > 0) {
        return;
      }
      // Live Now: start is always "now"; End is whatever the user picked and stays fixed.
      const next = slideLiveWindow(new Date(), durationRef.current);
      setStartsAt((current) => (current.getTime() === next.startsAt.getTime() ? current : next.startsAt));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [visible, isLiveNow]);

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

  // Find the named regions around the exact spot whenever privacy is on and the spot changes.
  useEffect(() => {
    if (!visible || !privacyOn || !coords) {
      setRegionsLoading(false);
      return;
    }
    const controller = new AbortController();
    setRegionsLoading(true);
    void lookupPrivacyRegions({ latitude: coords.lat, longitude: coords.lon }, controller.signal)
      .then((result) => {
        setPrivacyRegions(result.regions);
        // A new spot means old positions no longer apply; the same spot (re-opened draft) keeps them.
        const spotKey = `${coords.lat.toFixed(6)},${coords.lon.toFixed(6)}`;
        if (lastRegionSpot.current !== spotKey) setRegionMoves({});
        lastRegionSpot.current = spotKey;
        setPrivacySource(result.source);
        setPrivacyRegionId((current) => {
          if (current && result.regions.some((region) => region.id === current)) return current;
          // "Drop again": use the same level as the original Point.
          const preferred = preferredPrivacyLevel.current
            ? result.regions.find((region) => region.level === preferredPrivacyLevel.current)
            : undefined;
          preferredPrivacyLevel.current = null;
          if (preferred) return preferred.id;
          // Default to the neighborhood: hides a home well while still saying roughly where.
          return (result.regions.find((region) => region.level === 'neighborhood') ?? result.regions[0])?.id ?? null;
        });
      })
      .catch(() => {
        // Aborted because the spot changed again; the next lookup takes over.
      })
      .finally(() => {
        if (!controller.signal.aborted) setRegionsLoading(false);
      });
    return () => controller.abort();
  }, [visible, privacyOn, coords]);

  useEffect(() => {
    if (!visible) return;
    // Don't search for the place that's already chosen (picked from the list, GPS, the map, or
    // filled in by "Drop again"). The ref check alone can be used up by an earlier render,
    // which left the suggestion list open over the Location Privacy tile.
    const alreadyChosen = selectedLabel.current != null && locationSearch === selectedLabel.current;
    if (skipSearch.current || alreadyChosen) {
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

  /** Sets the Point's place. Refuses (with a message) a spot more than 100 mi from you. */
  const applyPlace = (place: PlaceSuggestion): boolean => {
    const tooFar = rangeError(place);
    if (tooFar) {
      setFormError(tooFar);
      return false;
    }
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
    return true;
  };

  const handleMapPick = (latitude: number, longitude: number) => {
    // Too far away: say so on the map and stay there, so the pin can be moved closer.
    const tooFar = rangeError({ latitude, longitude });
    if (tooFar) {
      setPickNotice(tooFar);
      return;
    }
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

  const scheduleClose = (point?: DroppedPoint, animation?: Omit<DropAnimation, 'key'>) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setRevealing(true);
    if (animation) setDropAnimation({ ...animation, key: Date.now() });
    // Long enough to watch the pin land and the beacon spread; short when motion is reduced.
    const delay = animation && !animation.reducedMotion ? 1800 : 700;
    if (point) draftCleared.current = true; // dropped: the next open starts fresh
    const share = point && shareAfterDrop;
    closeTimer.current = setTimeout(() => {
      if (point && onDropped) onDropped(point);
      else onClose();
      // Link tab: the Point exists now, so its link can go out. Same message as Manage → Share.
      if (share && point) {
        void Share.share(
          Platform.OS === 'ios'
            ? { message: shareMessage(point).replace(`\n${shareUrl(point)}`, ''), url: shareUrl(point) }
            : { message: shareMessage(point) },
          { subject: point.title },
        ).catch(() => undefined);
      }
    }, delay);
  };

  const handleDropBeacon = () => {
    if (submitting) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !coords) {
      setFormError(trimmedTitle ? 'Choose a place or tap GPS to set coordinates.' : 'Add a title before dropping this Point.');
      return;
    }

    // A share link counts as the invite for a Private Point.
    if (visibility === 'private' && invites.length === 0 && !shareAfterDrop) {
      setInviteOpen(true);
      setFormError('Private Points need at least one invite. Add someone, share a link, or switch to Channel or Public.');
      return;
    }

    if (visibility === 'channel' && !channelId) {
      setFormError('Channel Points need a channel. Pick one under Tags, or switch to Public.');
      return;
    }

    // Also catches a place kept from "Drop again" after you've moved far away.
    const tooFar = rangeError({ latitude: coords.lat, longitude: coords.lon });
    if (tooFar) {
      setFormError(tooFar);
      return;
    }

    const now = new Date();
    const effectiveStart = isLiveNow ? now : startsAt;
    if (endsAt.getTime() <= now.getTime()) {
      setFormError('The end time has already passed. Pick a later end.');
      return;
    }
    if (endsAt.getTime() <= effectiveStart.getTime()) {
      setFormError('End must be after start.');
      return;
    }
    if (!isLiveNow && startsAt.getTime() < now.getTime() - 60 * 1000) {
      setFormError('Scheduled start is in the past. Pick a later start or use Live Now.');
      return;
    }
    const repeatError = isLiveNow ? null : validateRepeat(repeat, startsAt, endsAt);
    if (repeatError) {
      setFormError(repeatError);
      setRepeatOpen(true);
      revealWhenCard();
      return;
    }
    const recurrence = isLiveNow ? null : toRepeatPayload(repeat, startsAt);

    const durationHours = windowDurationHours(effectiveStart, endsAt);
    const draft = createBeaconDraft({
      title: trimmedTitle,
      description,
      tags,
      visibility,
      channelId,
      venue: cleanVenueLabel(locationSearch) || 'Dropped Point',
      latitude: coords.lat,
      longitude: coords.lon,
      isLiveNow,
      duration: presetForHours(durationHours),
      durationHours,
      scheduledStart: formatBeaconStart(effectiveStart),
      radiusMeters: selectedRadiusMeters,
      tierLevel: selectedTier,
    });

    setSubmitting(true);
    setFormError(null);
    // Sent alongside the existing payload; the backend needs to accept these fields.
    const payload = Object.assign(toBeaconCreatePayload(draft), {
      requiresRsvpApproval: requiresApproval,
      maxAttendance, // null = no limit
      // Repeating event, or null for a one-time one. `rrule` is RFC 5545 (UNTIL in UTC);
      // the server should expand it in `timezone`, keeping each event's length the same as the first.
      recurrence,
      // Link invite: the server returns a share link that opens the Point (for a Private Point,
      // the link itself grants access, like an invite).
      shareLink: shareAfterDrop,
      // 512x512 JPEG as a data URI (about 40–80 KB), or null. Shown as a circle by the app.
      coverPhoto: coverPhoto?.base64 ? `data:image/jpeg;base64,${coverPhoto.base64}` : null,
      // The server should place a randomly offset circle of this radius around the real spot,
      // store that offset once, and only send exact coordinates to the host and confirmed guests.
      // The server re-checks the region from the exact spot; it only uses these to confirm the choice.
      locationPrivacy:
        privacyOn && selectedRegion
          ? {
              level: selectedRegion.level,
              regionId: selectedRegion.id,
              regionName: selectedRegion.name,
              // Present only when the host moved the area. The server must check the exact
              // spot is still 25–85% of the radius from this center before accepting it.
              customArea: regionMove
                ? {
                    latitude: regionMove.center.latitude,
                    longitude: regionMove.center.longitude,
                    radiusMeters: regionMove.radiusMeters,
                  }
                : undefined,
            }
          : { level: 'exact' as const },
    });
    const buildDroppedPoint = (id: string | undefined, synced: boolean): DroppedPoint => ({
      id: id ?? `local-${Date.now()}`,
      title: trimmedTitle,
      description: description.trim(),
      tags: parseBeaconTags(tags).map((tag) => tag.replace(/^#+/, '')),
      visibility,
      channelId,
      venue: cleanVenueLabel(locationSearch) || 'Dropped Point',
      latitude: coords.lat,
      longitude: coords.lon,
      isLiveNow,
      startsAt: effectiveStart.toISOString(),
      endsAt: endsAt.toISOString(),
      recurrence,
      coverPhotoUri: coverPhoto?.uri ?? null,
      requiresApproval,
      maxAttendance,
      locationPrivacy:
        privacyOn && selectedRegion ? { level: selectedRegion.level, regionName: selectedRegion.name } : null,
      beaconRadius: visibility !== 'private' && perimeterOn ? activeTier.displayRadius : null,
      invites,
      synced,
      createdAt: new Date().toISOString(),
    });

    const landing: Omit<DropAnimation, 'key'> = {
      latitude: coords.lat,
      longitude: coords.lon,
      beaconRadiusMeters: visibility !== 'private' && perimeterOn ? selectedRadiusMeters : undefined,
      privacy:
        privacyOn && selectedRegion
          ? {
              latitude: selectedRegion.center.latitude,
              longitude: selectedRegion.center.longitude,
              radiusMeters:
                selectedRegion.radiusMeters ??
                (selectedRegion.geometry ? equivalentRadiusMeters(selectedRegion.geometry) : 750),
            }
          : undefined,
      reducedMotion: reducedMotion.current,
    };

    void postBeacon(payload)
      .then((saved) => {
        rememberTags(parseBeaconTags(tags));
        // Same id as the Point's pin on the map, so My Drops (e.g. Boost) can find it.
        const nodeId = adoptPersistedBeacon(saved, draft);
        const savedId = (saved as { id?: unknown } | null)?.id;
        scheduleClose(buildDroppedPoint(nodeId || (savedId != null ? String(savedId) : undefined), true), landing);
      })
      .catch((error: unknown) => {
        if (error instanceof BeaconApiError && error.status >= 400 && error.status < 500) {
          setFormError('The server rejected this drop. Check the title and place, then try again.');
          setSubmitting(false);
          return;
        }
        rememberTags(parseBeaconTags(tags));
        const nodeId = dropBeacon(draft);
        scheduleClose(buildDroppedPoint(nodeId, false), landing);
      });
  };

  if (!visible) return null;

  const titleAndTagsComplete = title.trim().length > 0 && parseBeaconTags(tags).length > 0;
  // Shown next to the title so it's clear switching tabs won't lose anything.
  const hasDraftContent =
    !revealing &&
    (title.trim().length > 0 ||
      description.trim().length > 0 ||
      parseBeaconTags(tags).length > 0 ||
      coords != null ||
      coverPhoto != null ||
      invites.length > 0);

  const sheetCovered = revealing || mapPicking || privacyMoving;

  const startMovingArea = () => {
    if (!selectedRegion || !coords) return;
    const radiusMeters =
      selectedRegion.radiusMeters ??
      (selectedRegion.geometry ? equivalentRadiusMeters(selectedRegion.geometry) : 750);
    // Frozen while dragging, so the map isn't redrawn (and re-zoomed) after every drag.
    setMovingSnapshot({
      name: selectedRegion.name,
      center: selectedRegion.center,
      radiusMeters,
      exact: { latitude: coords.lat, longitude: coords.lon },
      editable: true,
    });
    setSuggestions([]);
    setPrivacyMoving(true);
  };

  const handlePrivacyMove = (latitude: number, longitude: number) => {
    if (!baseRegion || !movingSnapshot?.radiusMeters) return;
    setRegionMoves((current) => ({
      ...current,
      [baseRegion.id]: { center: { latitude, longitude }, radiusMeters: movingSnapshot.radiusMeters as number },
    }));
  };

  const finishMovingArea = () => {
    setPrivacyMoving(false);
    setMovingSnapshot(null);
  };

  const resetAreaPosition = () => {
    if (!baseRegion) return;
    setRegionMoves((current) => {
      const next = { ...current };
      delete next[baseRegion.id];
      return next;
    });
  };

  /**
   * After the time card grows or changes (Live Now / Schedule, Repeat options), scroll just enough
   * to show all of it above the Drop Point button, without pushing its top off screen.
   */
  const revealWhenCard = () => {
    setTimeout(() => {
      const scroll = scrollRef.current;
      const card = whenCardRef.current;
      if (!scroll || !card) return;
      scroll.measureInWindow((_sx, scrollTop, _sw, scrollHeight) => {
        card.measureInWindow((_cx, cardTop, _cw, cardHeight) => {
          const overlap = cardTop + cardHeight + 16 - (scrollTop + scrollHeight);
          const room = cardTop - scrollTop - 8;
          const shift = Math.min(overlap, Math.max(0, room));
          if (shift > 0) scroll.scrollTo({ y: scrollYRef.current + shift, animated: true });
        });
      });
    }, 60);
  };

  const selectLiveNow = () => {
    const window = liveBeaconWindow();
    // Keep the End the user already chose if it's still in the future; otherwise use the default.
    const nextEnd = endsAt.getTime() > window.startsAt.getTime() ? endsAt : window.endsAt;
    durationRef.current = nextEnd.getTime() - window.startsAt.getTime();
    setIsLiveNow(true);
    setStartsAt(window.startsAt);
    setEndsAt(nextEnd);
    setFormError(null);
    revealWhenCard();
  };

  const selectSchedule = () => {
    // Start from the current window; both Start and End are now editable and stop auto-ticking.
    setIsLiveNow(false);
    setFormError(null);
    revealWhenCard();
  };

  const guestReveal = requiresApproval
    ? 'Approved guests see the exact spot.'
    : 'Guests see the exact spot after they RSVP.';
  const privacyHint = !privacyOn
    ? 'Everyone who can see this Point sees the exact pin.'
    : !coords
      ? 'Set a location first, then choose an area to hide it in.'
      : selectedRegion
        ? `Others will see: somewhere in ${selectedRegion.name}. ${guestReveal}`
        : 'Finding areas around this spot…';

  const activeVisibility =
    VISIBILITY_OPTIONS.find((option) => option.id === visibility) ??
    VISIBILITY_OPTIONS.find((option) => option.id === 'public')!;

  // Channel choices: channels you've joined first, then (not for Channel visibility, which needs
  // membership) channels whose #tags match what's typed. Only channels you can post in (restricted
  // ones need approval). The picked one always stays listed.
  const tagKeys = new Set(parseBeaconTags(tags).map((tag) => tag.replace(/^#+/, '').toLowerCase()));
  const joinedChannels = allChannels.filter((channel) => channel.joined && canPostIn(channel));
  const tagMatches =
    visibility === 'channel'
      ? []
      : allChannels.filter(
          (channel) => !channel.joined && canPostIn(channel) && channel.tags.some((tag) => tagKeys.has(tag.replace(/^#+/, '').toLowerCase())),
        );
  const pickedChannel = channelId ? allChannels.find((channel) => channel.id === channelId) ?? null : null;
  const channelOptions: Channel[] = [...joinedChannels, ...tagMatches].slice(0, 8);
  if (pickedChannel && !channelOptions.some((channel) => channel.id === pickedChannel.id)) channelOptions.unshift(pickedChannel);
  const channelHint =
    visibility === 'channel'
      ? pickedChannel
        ? `Only ${pickedChannel.name} members can see it.`
        : joinedChannels.length
          ? 'Pick which channel can see it.'
          : 'Join a channel first to drop a channel-only Point.'
      : pickedChannel
        ? pickedChannel.joined
          ? `Also listed in ${pickedChannel.name}, with a post there.`
          : `Also listed in ${pickedChannel.name}.`
        : 'Optional: list it in a channel too.';

  const selectVisibility = (next: BeaconVisibility) => {
    setVisibility(next);
    setFormError(null);
    // Channel visibility needs a channel you're in: drop a picked channel you haven't joined.
    if (next === 'channel' && pickedChannel && !pickedChannel.joined) setChannelId(null);
    // A private beacon only reaches invitees, so open the invite panel right away.
    if (next === 'private') {
      setInviteOpen(true);
      setInviteError('');
    }
  };

  const pickCoverPhoto = async () => {
    if (photoBusy) return;
    if (!(await ensurePhotoPolicyAccepted())) return;
    setPhotoBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false, // ProxiPoint's circle cropper opens next instead of the phone's square one
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      // Drag / pinch inside a circle guide, then saved as a 512px square JPEG.
      const output = await cropToCircle(result.assets[0]);
      if (!output) return;
      setCoverPhoto({ uri: output.uri, base64: output.base64 });
      setFormError(null);
    } catch {
      setFormError('Couldn’t load that photo. Try a different one.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const stepMaxAttendance = (delta: number) => {
    setMaxAttendance((current) => {
      if (current == null) return delta > 0 ? DEFAULT_MAX_ATTENDANCE : null;
      const next = current + delta;
      // Stepping below 1 goes back to "No limit".
      if (next < 1) return null;
      return Math.min(MAX_ATTENDANCE_LIMIT, next);
    });
  };

  const typeMaxAttendance = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    if (!digits) {
      setMaxAttendance(null);
      return;
    }
    const value = Math.min(MAX_ATTENDANCE_LIMIT, parseInt(digits, 10));
    setMaxAttendance(value < 1 ? null : value);
  };

  const holdClock = () => {
    clockHold.current += 1;
  };

  const releaseClock = () => {
    clockHold.current = Math.max(0, clockHold.current - 1);
  };

  const commitStart = (kind: 'date' | 'time', value: string) => {
    const next = kind === 'date' ? applyDateInput(startsAt, value) : applyTimeInput(startsAt, value);
    if (!next) return;
    const updated = changeWindowStart(startsAt, endsAt, next);
    durationRef.current = updated.endsAt.getTime() - updated.startsAt.getTime();
    setRepeat((rule) => followStart(rule, startsAt, updated.startsAt));
    setStartsAt(updated.startsAt);
    setEndsAt(updated.endsAt);
    setFormError(null);
    if (updated.switchedToSchedule) setIsLiveNow(false);
  };

  const commitEnd = (kind: 'date' | 'time', value: string) => {
    const next = kind === 'date' ? applyDateInput(endsAt, value) : applyTimeInput(endsAt, value);
    if (!next) return;
    // In Live Now the real start is "now", so measure the end against the current moment.
    const anchor = isLiveNow ? new Date() : startsAt;
    const end = changeWindowEnd(anchor, next, kind);
    durationRef.current = end.getTime() - anchor.getTime();
    setEndsAt(end);
    setFormError(null);
  };

  return (
    <View style={[styles.overlay, { bottom: navBarHeight }]} testID="drop-beacon-sheet">
      <View style={styles.mapBand} testID="drop-beacon-map" pointerEvents={sheetCovered ? 'auto' : 'none'}>
        <DiscoveryLeafletMap
          // Select on map: tapping the map just moves that spot under the center pin.
          onMapPick={
            mapPicking
              ? (latitude, longitude) => setPickFocus({ key: Date.now(), latitude, longitude })
              : undefined
          }
          onCenterChange={
            mapPicking
              ? (latitude, longitude) => {
                  pickCenter.current = { latitude, longitude };
                }
              : undefined
          }
          focus={mapPicking ? pickFocus : null}
          zoomRequest={mapPicking ? pickZoom : null}
          // Select on map: a single pin on the current spot instead of the perimeter circles.
          showGeofence={!privacyMoving && !revealing && !mapPicking}
          privacyPreview={privacyMoving ? movingSnapshot : null}
          onPrivacyMove={privacyMoving ? handlePrivacyMove : undefined}
          dropAnimation={revealing ? dropAnimation : null}
        />
      </View>
      {privacyMoving ? (
        <View style={[styles.mapPickBar, styles.moveBar]} testID="privacy-move-bar">
          <View style={styles.moveBarCopy}>
            <Text style={styles.mapPickHint}>Drag the shaded area</Text>
            <Text style={styles.moveBarSub}>Your exact spot always stays inside it.</Text>
          </View>
          <TouchableOpacity onPress={finishMovingArea} testID="privacy-move-done" accessibilityRole="button">
            <Text style={styles.moveBarDone}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {mapPicking ? (
        <>
          {/* Fixed pin in the middle of the map: move the map underneath it. Its tip marks the spot. */}
          <View style={styles.centerPinLayer} pointerEvents="none" testID="map-pick-center-pin">
            <View style={styles.centerPin}>
              <MapPin size={46} color={c.base} fill={c.accent} strokeWidth={1.75} />
            </View>
            <View style={styles.centerPinDot} />
          </View>

          {/* Back to where you are, and zoom: same buttons and spots as on Explore Map */}
          <MapRecenterButton
            style={mapControlPositions(insets.top).recenter}
            busy={locatingPick}
            onPress={async () => {
              if (locatingPick) return;
              setLocatingPick(true);
              setPickNotice('');
              const fix = await currentPosition();
              setLocatingPick(false);
              const spot = fix.ok
                ? { latitude: fix.latitude, longitude: fix.longitude }
                : { latitude: selfCoordinates.latitude, longitude: selfCoordinates.longitude };
              if (!fix.ok) setPickNotice(fix.reason === 'denied' ? 'Location is off, so this is your home area.' : 'Couldn’t get your location; showing your home area.');
              setPickFocus({ key: Date.now(), ...spot, zoom: 17 });
            }}
            testID="map-pick-locate"
          />
          <MapZoomStack
            style={mapControlPositions(insets.top).zoom}
            onZoomIn={() => setPickZoom({ key: Date.now(), delta: 1 })}
            onZoomOut={() => setPickZoom({ key: Date.now(), delta: -1 })}
            testIDPrefix="map-pick-zoom"
          />

          <View style={styles.mapPickPanel} testID="map-pick-bar">
            <View style={styles.mapPickRow}>
              <Text style={styles.mapPickHint}>Move the map to put the pin on the spot</Text>
              <TouchableOpacity onPress={() => setMapPicking(false)} testID="map-pick-cancel" accessibilityRole="button">
                <Text style={styles.mapPickCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
            {pickNotice ? <Text style={styles.mapPickNotice}>{pickNotice}</Text> : null}
            <TouchableOpacity
              style={styles.mapPickAccept}
              onPress={() => {
                const spot = pickCenter.current;
                if (spot) handleMapPick(spot.latitude, spot.longitude);
                else setMapPicking(false);
              }}
              accessibilityRole="button"
              testID="map-pick-accept"
            >
              <Text style={styles.mapPickAcceptText}>ACCEPT LOCATION</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
      <KeyboardAvoidingView
        style={[styles.sheetContainer, sheetCovered && styles.sheetHidden]}
        pointerEvents={sheetCovered ? 'none' : 'auto'}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={navBarHeight}
      >
        <View style={{ paddingTop: resolvedTop }}>
          <View style={styles.pullBar} />
          <View style={styles.headerRow}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>CREATE DROP</Text>
              {hasDraftContent ? (
                <View style={styles.draftPill} testID="drop-draft-pill">
                  <Text style={styles.draftPillText}>DRAFT SAVED</Text>
                </View>
              ) : null}
            </View>
            {hasDraftContent ? (
              <TouchableOpacity
                onPress={() => setConfirmingStartOver(true)}
                style={styles.startOverBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Start over"
                testID="drop-start-over"
              >
                <RotateCcw size={14} color={c.textSecondary} strokeWidth={2.25} />
                <Text style={styles.startOverText}>Start over</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <KeyboardAwareScrollView
          ref={scrollRef}
          onScroll={(event) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
          }}
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.visibilityBlock}>
          <View style={styles.visibilityContainer}>
            {VISIBILITY_OPTIONS.map((option) => {
              const active = visibility === option.id;
              const { Icon } = option;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.visibilityTab,
                    active && {
                      backgroundColor: `${tone(option.accent)}22`,
                      borderWidth: 1,
                      borderColor: tone(option.accent),
                    },
                  ]}
                  onPress={() => selectVisibility(option.id)}
                  testID={`drop-visibility-${option.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.label}. ${option.hint}`}
                  accessibilityState={{ selected: active }}
                >
                  <Icon size={14} color={active ? tone(option.accent) : c.textMuted} strokeWidth={2.25} />
                  <Text
                    style={[styles.visibilityText, active && styles.visibilityTextActive]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.visibilityHint} testID="drop-visibility-hint">
            {activeVisibility.hint}
          </Text>
          </View>

          <GlowFrame active={titleAndTagsComplete}>
          <View style={[styles.groupedContainer, titleAndTagsComplete && styles.glowBorder]} testID="drop-details">
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Title</Text>
              <TextInput
                placeholder="e.g. Boulder Tech & GIS Meetup"
                placeholderTextColor={c.textFaint}
                style={styles.textInput}
                value={title}
                onChangeText={setTitle}
                testID="drop-title"
              />
            </View>
            <View style={styles.hairline} />
            <View style={styles.inputRow} ref={tourTarget('drop-tags')} collapsable={false}>
              <Text style={styles.inputLabel}>Tags</Text>
              <TextInput
                placeholder="#TechMeetup, #PostGIS"
                placeholderTextColor={c.textFaint}
                style={styles.textInput}
                value={tags}
                onChangeText={tagField.onChangeText}
                onFocus={tagField.onFocus}
                onBlur={tagField.onBlur}
                autoCapitalize="none"
                autoCorrect={false}
                testID="drop-tags"
              />
            </View>
            {/* Always mounted (just collapsed when empty) so the layout under the field never jumps. */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                style={tagField.suggestions.length > 0 ? null : styles.collapsed}
                contentContainerStyle={tagField.suggestions.length > 0 ? styles.tagSuggestionRow : null}
                testID="drop-tag-suggestions"
              >
                {tagField.suggestions.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={styles.tagSuggestion}
                    onPress={() => tagField.applySuggestion(tag)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add tag ${tag}`}
                    testID={`drop-tag-suggestion-${tag}`}
                  >
                    <Text style={styles.tagSuggestionText}>#{tag}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            <View style={styles.hairline} />
            <View style={styles.photoRow}>
              <TouchableOpacity
                onPress={pickCoverPhoto}
                disabled={photoBusy}
                style={[styles.photoCircle, coverPhoto && styles.photoCircleFilled]}
                accessibilityRole="button"
                accessibilityLabel={coverPhoto ? 'Change cover photo' : 'Add cover photo'}
                testID="drop-photo"
              >
                {photoBusy ? (
                  <ActivityIndicator color={c.accent} />
                ) : coverPhoto ? (
                  <Image source={{ uri: coverPhoto.uri }} style={styles.photoImage} />
                ) : (
                  <ImagePlus size={22} color={c.accent} strokeWidth={2} />
                )}
              </TouchableOpacity>
              <View style={styles.photoCopy}>
                <Text style={styles.descriptionLabel}>Cover photo</Text>
                <Text style={styles.photoHint}>
                  {coverPhoto ? 'Tap the circle to change it.' : 'Optional. Cropped to a circle for the map and cards.'}
                </Text>
                <PhotoRulesNote style={{ marginTop: 3 }} />
              </View>
              {coverPhoto && !photoBusy ? (
                <TouchableOpacity
                  onPress={() => setCoverPhoto(null)}
                  style={styles.photoRemove}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove cover photo"
                  testID="drop-photo-remove"
                >
                  <X size={16} color={c.textMuted} strokeWidth={2.25} />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.hairline} />
            {/* Channel: who can see it (Channel visibility), or where else it's listed (Public/Private). */}
            <View style={styles.channelField} testID="drop-channel">
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Channel</Text>
                <Text
                  style={[styles.channelHint, visibility === 'channel' && !pickedChannel && styles.channelHintNeeded]}
                  numberOfLines={2}
                >
                  {channelHint}
                </Text>
              </View>
              {channelOptions.length || visibility !== 'channel' ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="always"
                  contentContainerStyle={styles.channelChips}
                >
                  {visibility !== 'channel' ? (
                    <TouchableOpacity
                      style={[styles.channelChip, !channelId && styles.channelChipActive]}
                      onPress={() => setChannelId(null)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: !channelId }}
                      testID="drop-channel-none"
                    >
                      <Text style={[styles.channelChipText, !channelId && styles.channelChipTextActive]}>None</Text>
                    </TouchableOpacity>
                  ) : null}
                  {channelOptions.map((channel) => {
                    const active = channel.id === channelId;
                    return (
                      <TouchableOpacity
                        key={channel.id}
                        style={[styles.channelChip, active && styles.channelChipActive]}
                        onPress={() => {
                          setChannelId(active && visibility !== 'channel' ? null : channel.id);
                          setFormError(null);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Post to ${channel.name}`}
                        testID={`drop-channel-${channel.id}`}
                      >
                        <Text style={[styles.channelChipText, active && styles.channelChipTextActive]} numberOfLines={1}>
                          {channel.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : null}
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
                placeholderTextColor={c.textFaint}
                style={styles.descriptionInput}
                value={description}
                onChangeText={(value) => setDescription(clampBeaconDescription(value))}
                multiline
                textAlignVertical="top"
                testID="drop-description"
              />
            </View>
          </View>

          </GlowFrame>

          <View style={styles.locationBlock}>
            <GlowFrame active={Boolean(coords)}>
            <View style={[styles.locationContainer, coords && styles.glowBorder]}>
              <View style={styles.locationCopy}>
                <TextInput
                  placeholder="Search location or venue..."
                  placeholderTextColor={c.textFaint}
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
                    // Start with the Point's spot (or yours) under the center pin.
                    const start = coords
                      ? { latitude: coords.lat, longitude: coords.lon }
                      : { latitude: selfCoordinates.latitude, longitude: selfCoordinates.longitude };
                    pickCenter.current = start;
                    setPickFocus({ key: Date.now(), ...start, zoom: 16 });
                    setPickNotice('');
                    setMapPicking(true);
                  }}
                  style={styles.mapPickBtn}
                  testID="drop-select-on-map"
                  accessibilityRole="button"
                >
                  <MapPin size={14} color={c.accent} strokeWidth={2.25} />
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
                  <ActivityIndicator size="small" color={c.accent} />
                ) : (
                  <Crosshair size={20} color={c.accent} strokeWidth={2} />
                )}
              </TouchableOpacity>
            </View>
            </GlowFrame>

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

          <View style={[styles.scaleRailContainer, privacyOn && styles.privacyGlow]} testID="drop-privacy">
            <View style={styles.scaleRailHeaderRow}>
              <View style={styles.privacyHeading}>
                <EyeOff size={13} color={privacyOn ? c.violetSoft : c.textMuted} strokeWidth={2.25} />
                <Text style={styles.scaleRailHeading}>LOCATION PRIVACY</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPrivacyOn((on) => !on)}
                style={[styles.perimeterToggle, privacyOn ? styles.privacyToggleOn : styles.perimeterToggleOff]}
                testID="drop-privacy-toggle"
                accessibilityRole="switch"
                accessibilityLabel="Location privacy"
                accessibilityState={{ checked: privacyOn }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View style={[styles.perimeterThumb, privacyOn && styles.privacyThumbOn]} />
              </TouchableOpacity>
            </View>
            {privacyOn && coords ? (
              <View testID="drop-privacy-body">
                {regionsLoading && privacyRegions.length === 0 ? (
                  <View style={styles.privacyLoading}>
                    <ActivityIndicator size="small" color={c.violet} />
                  </View>
                ) : (
                  <View style={styles.scaleChipsRow}>
                    {privacyRegions.map((region) => {
                      const isActive = region.id === privacyRegionId;
                      const { label, Icon } = PRIVACY_LEVELS[region.level];
                      return (
                        <TouchableOpacity
                          key={region.id}
                          style={[styles.scaleChip, isActive && styles.privacyChipActive]}
                          onPress={() => setPrivacyRegionId(region.id)}
                          activeOpacity={0.8}
                          testID={`drop-privacy-${region.level}`}
                          accessibilityRole="button"
                          accessibilityLabel={`${label}: ${region.name}`}
                          accessibilityState={{ selected: isActive }}
                        >
                          {/* Blurred-area glyph: a soft filled disc instead of the perimeter's ring. */}
                          <View style={[styles.privacyBlob, isActive && styles.privacyBlobActive]}>
                            <Icon size={14} color={isActive ? c.text : c.textSecondary} strokeWidth={2.25} />
                          </View>
                          <Text
                            style={[styles.scaleChipText, isActive && styles.scaleChipTextActive]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.85}
                          >
                            {label}
                          </Text>
                          <Text
                            style={[styles.scaleChipSub, isActive && styles.privacyChipSubActive]}
                            numberOfLines={1}
                          >
                            {region.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {selectedRegion ? (
                  <View style={styles.privacyPreview} testID="drop-privacy-preview">
                    <DiscoveryLeafletMap
                      showGeofence={false}
                      interactive={false}
                      privacyPreview={{
                        name: selectedRegion.name,
                        center: selectedRegion.center,
                        geometry: selectedRegion.geometry,
                        radiusMeters: selectedRegion.radiusMeters,
                        exact: { latitude: coords.lat, longitude: coords.lon },
                      }}
                    />
                    <View style={styles.privacyLegend} pointerEvents="none">
                      <View style={styles.legendItem}>
                        <View style={styles.legendDotPublic} />
                        <Text style={styles.legendText}>What others see</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={styles.legendDotExact} />
                        <Text style={styles.legendText}>Your exact spot</Text>
                      </View>
                    </View>
                  </View>
                ) : null}

                {selectedRegion ? (
                  <View style={styles.moveRow}>
                    <TouchableOpacity
                      onPress={startMovingArea}
                      style={styles.moveBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Move the shaded area"
                      testID="drop-privacy-move"
                    >
                      <Move size={14} color={c.violetSoft} strokeWidth={2.25} />
                      <Text style={styles.moveBtnText}>Move area</Text>
                    </TouchableOpacity>
                    {regionMove ? (
                      <TouchableOpacity
                        onPress={resetAreaPosition}
                        style={styles.resetBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Reset the area position"
                        testID="drop-privacy-reset"
                      >
                        <RotateCcw size={13} color={c.textMuted} strokeWidth={2.25} />
                        <Text style={styles.resetBtnText}>Reset</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}

                {privacySource === 'approximate' && selectedRegion ? (
                  <Text style={styles.privacySourceNote}>
                    Approximate areas until region data is connected.
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.broadcastSubtext} testID="drop-privacy-hint">
              {privacyHint}
            </Text>
          </View>

          {visibility !== 'private' ? (
          <View style={[styles.scaleRailContainer, perimeterOn && styles.fieldGlow]} testID="drop-perimeter">
            <View style={styles.scaleRailHeaderRow}>
              <Text style={styles.scaleRailHeading}>BROADCAST PERIMETER</Text>
              <View style={styles.perimeterControls}>
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
                        accessibilityRole="button"
                        accessibilityLabel={`${tier.label}, ${tier.displayRadius}`}
                        accessibilityState={{ selected: isActive }}
                      >
                        <TierGlyph id={tier.id} active={isActive} />
                        <Text
                          style={[styles.scaleChipText, isActive && styles.scaleChipTextActive]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.85}
                        >
                          {tier.label}
                        </Text>
                        <Text style={[styles.scaleChipSub, isActive && styles.scaleChipSubActive]}>
                          {tier.displayRadius}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.broadcastSubtext} testID="drop-broadcast">
                  {describeReach(visibility, tags, activeTier.displayRadius, pickedChannel?.name)}
                </Text>
              </View>
            ) : null}
          </View>
          ) : null}

          <View style={[styles.scaleRailContainer, requiresApproval && styles.fieldGlow]} testID="drop-approval">
            <View style={[styles.scaleRailHeaderRow, styles.approvalHeaderRow]}>
              <Text style={styles.scaleRailHeading}>REQUIRES RSVP APPROVAL</Text>
              <TouchableOpacity
                onPress={() => setRequiresApproval((on) => !on)}
                style={[styles.perimeterToggle, requiresApproval ? styles.perimeterToggleOn : styles.perimeterToggleOff]}
                testID="drop-approval-toggle"
                accessibilityRole="switch"
                accessibilityLabel="Requires RSVP approval"
                accessibilityState={{ checked: requiresApproval }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View style={[styles.perimeterThumb, requiresApproval && styles.perimeterThumbOn]} />
              </TouchableOpacity>
            </View>
            <Text style={styles.broadcastSubtext} testID="drop-approval-hint">
              {requiresApproval
                ? 'People request to join, and you approve each RSVP before they’re in.'
                : 'Anyone who can see this Point can RSVP right away.'}
            </Text>

            <View style={styles.hairline} />

            <View style={styles.capacityRow} testID="drop-capacity">
              <View style={styles.capacityCopy}>
                <Text style={styles.scaleRailHeading}>MAX ATTENDANCE</Text>
                <Text style={styles.capacityHint}>
                  {maxAttendance == null ? 'No limit' : `Closes RSVPs at ${maxAttendance}`}
                </Text>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity
                  onPress={() => stepMaxAttendance(-1)}
                  disabled={maxAttendance == null}
                  style={[styles.stepperBtn, maxAttendance == null && styles.stepperBtnDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease max attendance"
                  testID="drop-capacity-minus"
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  value={maxAttendance == null ? '' : String(maxAttendance)}
                  onChangeText={typeMaxAttendance}
                  placeholder="∞"
                  placeholderTextColor={c.textMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                  style={styles.stepperInput}
                  accessibilityLabel="Max attendance"
                  testID="drop-capacity-input"
                />
                <TouchableOpacity
                  onPress={() => stepMaxAttendance(1)}
                  disabled={maxAttendance != null && maxAttendance >= MAX_ATTENDANCE_LIMIT}
                  style={styles.stepperBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Increase max attendance"
                  testID="drop-capacity-plus"
                >
                  <Text style={styles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View ref={whenCardRef} collapsable={false} style={styles.groupedContainer}>
            <View style={styles.timeToggleRow}>
              <TouchableOpacity
                style={[styles.pillToggle, isLiveNow && styles.pillToggleActive]}
                onPress={selectLiveNow}
                testID="drop-live"
              >
                <Rocket size={14} color={isLiveNow ? c.accent : c.textFaint} strokeWidth={2.25} />
                <Text style={[styles.pillToggleText, isLiveNow && styles.pillToggleTextActive]}>Live Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pillToggle, !isLiveNow && styles.pillToggleActive]}
                onPress={selectSchedule}
                testID="drop-schedule"
              >
                <Calendar size={14} color={!isLiveNow ? c.accent : c.textFaint} strokeWidth={2.25} />
                <Text style={[styles.pillToggleText, !isLiveNow && styles.pillToggleTextActive]}>Schedule</Text>
              </TouchableOpacity>
            </View>

            {isLiveNow ? (
              <View style={styles.whenBlock} testID="drop-live-window">
                <View style={styles.whenRow}>
                  <View style={styles.whenRail}>
                    <View style={styles.whenDotOpen} />
                  </View>
                  <Text style={styles.whenLabel}>End</Text>
                  <View style={styles.whenChips}>
                    <WhenChip
                      kind="date"
                      date={endsAt}
                      minimumDate={startsAt}
                      display={formatBeaconDate(endsAt)}
                      onCommit={(value) => commitEnd('date', value)}
                      onFocus={holdClock}
                      onBlur={releaseClock}
                      testID="drop-end-date"
                      label="End date"
                    />
                    <WhenChip
                      kind="time"
                      date={endsAt}
                      display={formatBeaconTime(endsAt)}
                      onCommit={(value) => commitEnd('time', value)}
                      onFocus={holdClock}
                      onBlur={releaseClock}
                      testID="drop-end-time"
                      label="End time"
                    />
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.whenBlock} testID="drop-window">
                <View style={styles.whenRow}>
                  <View style={styles.whenRail}>
                    <View style={styles.whenDotFilled} />
                  </View>
                  <Text style={styles.whenLabel}>Start</Text>
                  <View style={styles.whenChips}>
                    <WhenChip
                      kind="date"
                      date={startsAt}
                      minimumDate={new Date()}
                      display={formatBeaconDate(startsAt)}
                      onCommit={(value) => commitStart('date', value)}
                      onFocus={holdClock}
                      onBlur={releaseClock}
                      testID="drop-start-date"
                      label="Start date"
                    />
                    <WhenChip
                      kind="time"
                      date={startsAt}
                      display={formatBeaconTime(startsAt)}
                      onCommit={(value) => commitStart('time', value)}
                      onFocus={holdClock}
                      onBlur={releaseClock}
                      testID="drop-start-time"
                      label="Start time"
                    />
                  </View>
                </View>
                <View style={styles.whenBridge}>
                  <View style={styles.whenRail}>
                    <View style={styles.whenConnector}>
                      <View style={styles.whenPip} />
                      <View style={styles.whenPip} />
                      <View style={styles.whenPip} />
                    </View>
                  </View>
                  <View style={styles.whenRule} />
                </View>
                <View style={styles.whenRow}>
                  <View style={styles.whenRail}>
                    <View style={styles.whenDotOpen} />
                  </View>
                  <Text style={styles.whenLabel}>End</Text>
                  <View style={styles.whenChips}>
                    <WhenChip
                      kind="date"
                      date={endsAt}
                      minimumDate={startsAt}
                      display={formatBeaconDate(endsAt)}
                      onCommit={(value) => commitEnd('date', value)}
                      onFocus={holdClock}
                      onBlur={releaseClock}
                      testID="drop-end-date"
                      label="End date"
                    />
                    <WhenChip
                      kind="time"
                      date={endsAt}
                      display={formatBeaconTime(endsAt)}
                      onCommit={(value) => commitEnd('time', value)}
                      onFocus={holdClock}
                      onBlur={releaseClock}
                      testID="drop-end-time"
                      label="End time"
                    />
                  </View>
                </View>

                {/* ---- Repeat: one rule under the window, expanded in place ---- */}
                <View style={styles.whenBridge}>
                  <View style={styles.whenRail} />
                  <View style={styles.whenRule} />
                </View>
                <TouchableOpacity
                  style={styles.whenRow}
                  onPress={() => {
                    if (!repeatOpen) revealWhenCard();
                    setRepeatOpen((openPanel) => !openPanel);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: repeatOpen }}
                  accessibilityLabel={`Repeat: ${describeRepeat(repeat, startsAt)}`}
                  testID="drop-repeat"
                >
                  <View style={styles.whenRail}>
                    <Repeat
                      size={14}
                      color={repeat.frequency === 'none' ? c.textFaint : c.accent}
                      strokeWidth={2.25}
                    />
                  </View>
                  <Text style={[styles.whenLabel, styles.repeatLabel]}>Repeat</Text>
                  <View style={styles.whenChips}>
                    <View style={[styles.whenChip, styles.repeatChip]}>
                      <Text style={styles.whenChipText} numberOfLines={1} testID="drop-repeat-label">
                        {REPEAT_OPTIONS.find((option) => option.value === repeat.frequency)?.label ?? 'Never'}
                      </Text>
                      <ChevronDown size={14} color={c.textMuted} strokeWidth={2.25} />
                    </View>
                  </View>
                </TouchableOpacity>

                {repeatOpen ? (
                  <View style={styles.repeatPanel} testID="drop-repeat-panel">
                    <View style={styles.repeatOptions} accessibilityRole="radiogroup">
                      {REPEAT_OPTIONS.map((option) => {
                        const selected = repeat.frequency === option.value;
                        return (
                          <TouchableOpacity
                            key={option.value}
                            style={[styles.repeatOption, selected && styles.repeatOptionActive]}
                            onPress={() => {
                              setRepeat((rule) => ruleForFrequency(option.value, startsAt, rule));
                              setFormError(null);
                              revealWhenCard();
                            }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            testID={`drop-repeat-${option.value}`}
                          >
                            <Text style={[styles.repeatOptionText, selected && styles.repeatOptionTextActive]}>
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {repeat.frequency === 'weekly' || repeat.frequency === 'biweekly' ? (
                      <View style={styles.weekdayRow}>
                        {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                          const on = repeat.weekdays.includes(day);
                          const locked = day === startsAt.getDay();
                          return (
                            <TouchableOpacity
                              key={day}
                              style={[styles.weekdayDot, on && styles.weekdayDotOn, locked && styles.weekdayDotLocked]}
                              disabled={locked}
                              onPress={() => {
                                setRepeat((rule) => toggleRepeatWeekday(rule, day, startsAt));
                                setFormError(null);
                              }}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: on, disabled: locked }}
                              accessibilityLabel={locked ? `${weekdayShort(day)}, the start day` : weekdayShort(day)}
                              testID={`drop-repeat-day-${day}`}
                            >
                              <Text style={[styles.weekdayText, on && styles.weekdayTextOn]}>{weekdayLetter(day)}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}

                    {repeat.frequency !== 'none' ? (
                      <View style={styles.whenRow}>
                        <View style={styles.whenRail} />
                        <Text style={styles.whenLabel}>Ends</Text>
                        <View style={styles.whenChips}>
                          <TouchableOpacity
                            style={[styles.repeatOption, !repeat.until && styles.repeatOptionActive]}
                            onPress={() => {
                              setRepeat((rule) => ({ ...rule, until: null }));
                              setFormError(null);
                            }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: !repeat.until }}
                            testID="drop-repeat-never-ends"
                          >
                            <Text style={[styles.repeatOptionText, !repeat.until && styles.repeatOptionTextActive]}>
                              Never
                            </Text>
                          </TouchableOpacity>
                          <WhenChip
                            kind="date"
                            date={
                              (repeat.until ? applyDateInput(startsAt, repeat.until) : null) ??
                              new Date(startsAt.getTime() + 8 * 7 * 86_400_000)
                            }
                            minimumDate={startsAt}
                            display={
                              repeat.until
                                ? formatBeaconDate(applyDateInput(startsAt, repeat.until) ?? startsAt)
                                : 'On date'
                            }
                            onCommit={(value) => {
                              setRepeat((rule) => ({ ...rule, until: value }));
                              setFormError(null);
                            }}
                            onFocus={holdClock}
                            onBlur={releaseClock}
                            testID="drop-repeat-until"
                            label="Repeat end date"
                          />
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {repeat.frequency !== 'none' ? (
                  <Text style={styles.repeatHint} testID="drop-repeat-summary">
                    {describeRepeat(repeat, startsAt)}
                    {previewNextDates(repeat, startsAt) ? ` · Next: ${previewNextDates(repeat, startsAt)}` : ''}
                    {repeat.until ? '' : ' · Up to a year'}
                  </Text>
                ) : null}
              </View>
            )}
          </View>

          {/* Private Points need their guest list up front. Everything else invites from the Manage sheet. */}
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
              <UserPlus size={16} color={c.accent} strokeWidth={2.25} />
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
                      ['proxipoint', 'Users'],
                      ['phone', 'Phone'],
                      ['email', 'Email'],
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

                {inviteKind === 'proxipoint' ? (
                  <Text style={styles.inviteHint}>Invite people already on ProxiPoint by their @handle.</Text>
                ) : null}
                {inviteKind === 'phone' ? (
                  <Text style={styles.inviteHint}>
                    They’ll get a text with a link to this Point, even if they don’t have the app yet.
                  </Text>
                ) : null}

                {inviteKind === 'email' ? (
                  <Text style={styles.inviteHint}>
                    They’ll get an email with a link to this Point, even if they don’t have the app yet.
                  </Text>
                ) : null}


                {inviteKind === 'proxipoint' ? (
                  <View style={styles.inviteEntry}>
                    <TextInput
                      testID="invite-handle-input"
                      value={handleInput}
                      onChangeText={(text) => setHandleInput(formatHandleInput(text))}
                      onFocus={() => setHandleInput((current) => current || '@')}
                      onBlur={() => setHandleInput((current) => (current === '@' ? '' : current))}
                      onSubmitEditing={() => {
                        const next = addProxiPointInvite(invites, handleInput);
                        setInvites(next.invites);
                        setInviteError(next.error);
                        if (!next.error) setHandleInput('');
                      }}
                      placeholder="@ranger-7"
                      placeholderTextColor={c.textFaint}
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
                      placeholderTextColor={c.textFaint}
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

                {inviteKind === 'email' ? (
                  <View style={styles.inviteEntry}>
                    <TextInput
                      testID="invite-email-input"
                      value={emailInput}
                      onChangeText={setEmailInput}
                      onSubmitEditing={() => {
                        const next = addEmailInvite(invites, emailInput);
                        setInvites(next.invites);
                        setInviteError(next.error);
                        if (!next.error) setEmailInput('');
                      }}
                      placeholder="sam@example.com"
                      placeholderTextColor={c.textFaint}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      style={styles.inviteInput}
                    />
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={styles.inviteAddBtn}
                      onPress={() => {
                        const next = addEmailInvite(invites, emailInput);
                        setInvites(next.invites);
                        setInviteError(next.error);
                        if (!next.error) setEmailInput('');
                      }}
                    >
                      <Text style={styles.inviteAddText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {inviteError ? <Text style={styles.inviteError} testID="invite-error">{inviteError}</Text> : null}

                {/* Share the Point's link from any app once it's dropped (not a tab of its own). */}
                <View style={styles.linkRow} testID="invite-link">
                  <Link2 size={16} color={c.accent} strokeWidth={2.25} />
                  <Text style={styles.linkRowText}>Share the link after I drop it</Text>
                  <Switch
                    value={shareAfterDrop}
                    onValueChange={setShareAfterDrop}
                    trackColor={{ false: c.borderStrong, true: c.accentTrack }}
                    thumbColor={shareAfterDrop ? c.accent : c.textMuted}
                    accessibilityLabel="Share the link after dropping"
                    testID="invite-link-toggle"
                  />
                </View>
                {shareAfterDrop && visibility === 'private' ? (
                  <Text style={styles.linkNote}>Anyone you send the link to can open this Point and RSVP, even though it’s Private.</Text>
                ) : null}
              </View>
            ) : null}
          </View>
          ) : null}
        </KeyboardAwareScrollView>

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
            {submitting ? <ActivityIndicator color={c.base} style={styles.dropSpinner} /> : null}
            <Text style={styles.primaryDropText}>{submitting ? 'DROPPING' : 'DROP POINT'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={confirmingStartOver}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmingStartOver(false)}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard} testID="drop-start-over-confirm">
            <Text style={styles.confirmTitle}>Start over?</Text>
            <Text style={styles.confirmBody}>
              Everything you’ve filled in for this Point will be cleared: photo, details, location, privacy,
              beacon, RSVP settings, times and invites. This can’t be undone.
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmKeep]}
                onPress={() => setConfirmingStartOver(false)}
                accessibilityRole="button"
                testID="drop-start-over-cancel"
              >
                <Text style={styles.confirmKeepText}>Keep editing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmClear]}
                onPress={() => {
                  setConfirmingStartOver(false);
                  draftCleared.current = true;
                  startingOver.current = true;
                  setResetKey((key) => key + 1);
                }}
                accessibilityRole="button"
                testID="drop-start-over-confirm-button"
              >
                <Text style={styles.confirmClearText}>Clear all</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
    flexDirection: 'column',
    zIndex: 30,
    backgroundColor: c.base,
  },
  mapBand: {
    flex: 1,
    backgroundColor: c.mapBase,
  },
  sheetContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.sheet,
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
    backgroundColor: c.borderStrong,
    alignSelf: 'center',
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    color: c.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    color: c.textMuted,
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
    backgroundColor: c.base,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: c.border,
    gap: 4,
  },
  visibilityBlock: {
    gap: 8,
  },
  visibilityTab: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  visibilityText: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  visibilityTextActive: {
    color: c.text,
  },
  visibilityHint: {
    color: c.textMuted,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 4,
  },
  groupedContainer: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  photoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.accent,
    backgroundColor: c.base,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoCircleFilled: {
    borderStyle: 'solid',
    borderWidth: 2,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoCopy: {
    flex: 1,
    gap: 3,
  },
  photoHint: {
    color: c.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  photoRemove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.border,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  inputLabel: {
    color: c.textMuted,
    width: 60,
    fontSize: 12,
    fontWeight: '600',
  },
  channelField: { gap: 8, paddingVertical: 2 },
  channelHint: { flex: 1, color: c.textFaint, fontSize: 12, lineHeight: 16 },
  channelHintNeeded: { color: c.violet, fontWeight: '700' },
  channelChips: { gap: 8 },
  channelChip: {
    maxWidth: 200,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: c.surfaceDim,
    borderWidth: 1,
    borderColor: c.border,
  },
  channelChipActive: { backgroundColor: c.violetTint, borderColor: c.violet },
  channelChipText: { color: c.textSecondary, fontSize: 12.5, fontWeight: '700' },
  channelChipTextActive: { color: c.violetText },
  tagSuggestionRow: {
    gap: 8,
    paddingTop: 10,
    paddingLeft: 60,
  },
  tagSuggestion: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.base,
  },
  tagSuggestionText: {
    color: c.accentSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  descriptionLabel: {
    color: c.textMuted,
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
    color: c.text,
    fontSize: 13,
    minHeight: 32,
    maxHeight: 88,
    padding: 0,
  },
  wordCount: {
    color: c.textFaint,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  wordCountFull: {
    color: c.amber,
  },
  textInput: {
    flex: 1,
    color: c.text,
    fontSize: 13,
    padding: 0,
  },
  hairline: {
    height: 1,
    backgroundColor: c.border,
    marginVertical: 10,
  },
  scaleRailContainer: {
    backgroundColor: c.base,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  scaleRailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scaleRailHeading: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  scaleChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 10,
  },
  scaleChip: {
    flex: 1,
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  scaleChipActive: {
    backgroundColor: 'rgba(34, 211, 238, 0.18)',
    borderColor: c.accent,
  },
  scaleChipText: {
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  scaleChipTextActive: {
    color: c.text,
  },
  scaleChipSub: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  scaleChipSubActive: {
    color: c.accentSoft,
    fontWeight: '800',
  },
  broadcastSubtext: {
    color: c.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  locationBlock: {
    position: 'relative',
    zIndex: 4,
  },
  startOverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
  },
  startOverText: { color: c.textSecondary, fontSize: 12, fontWeight: '700' },
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
  confirmBtn: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  confirmKeep: { borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.base },
  confirmKeepText: { color: c.text, fontSize: 14, fontWeight: '700' },
  confirmClear: { backgroundColor: c.danger },
  confirmClearText: { color: c.white, fontSize: 14, fontWeight: '800' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  draftPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
  },
  draftPillText: { color: c.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  glowLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    backgroundColor: c.surface,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 8,
  },
  glowBorder: {
    borderColor: c.accent,
  },
  collapsed: {
    height: 0,
  },
  fieldGlow: {
    borderColor: c.accent,
    borderWidth: 1.5,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 8,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    minHeight: 56,
    paddingVertical: 10,
  },
  locationCopy: {
    flex: 1,
  },
  locationInput: {
    color: c.text,
    fontSize: 17,
    fontWeight: '600',
    padding: 0,
  },
  locationDivider: {
    height: 1,
    backgroundColor: c.borderStrong,
    marginTop: 8,
    marginBottom: 6,
  },
  coordReadout: {
    color: c.sky,
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
    color: c.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  mapPickBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 6,
    backgroundColor: c.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.accent,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  centerPinLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The pin's tip sits exactly on the middle of the map (the icon is 46 tall; its tip is ~42 down).
  centerPin: { marginTop: -42, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  centerPinDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.accent,
    borderWidth: 1.5,
    borderColor: c.base,
  },
  mapPickPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 6,
    gap: 10,
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: c.accent,
    padding: 14,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  mapPickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapPickNotice: { color: c.amber, fontSize: 12, fontWeight: '600' },
  mapPickAccept: {
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPickAcceptText: { color: c.base, fontSize: 14, fontWeight: '900', letterSpacing: 1.2 },
  mapPickHint: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  mapPickCancel: {
    color: c.accent,
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
    backgroundColor: c.accent,
  },
  perimeterToggleOff: {
    backgroundColor: c.border,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  perimeterThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: c.textMuted,
  },
  /* Location privacy uses violet so it never reads as the cyan broadcast perimeter. */
  privacyGlow: {
    borderColor: c.violet,
    borderWidth: 1.5,
    shadowColor: c.violet,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  privacyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  privacyToggleOn: {
    backgroundColor: c.violet,
  },
  privacyThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: c.violetBase,
  },
  privacyChipActive: {
    backgroundColor: 'rgba(167, 139, 250, 0.18)',
    borderColor: c.violet,
  },
  privacyChipSubActive: {
    color: c.violetSoft,
    fontWeight: '800',
  },
  privacyBlob: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.14)',
  },
  privacyBlobActive: {
    backgroundColor: 'rgba(167, 139, 250, 0.35)',
    shadowColor: c.violet,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  privacyLoading: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyPreview: {
    height: 170,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.borderStrong,
    marginBottom: 10,
    backgroundColor: c.mapBase,
  },
  privacyLegend: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: c.photoChipStrong,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDotPublic: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: c.violet,
    backgroundColor: c.violetBase,
  },
  legendDotExact: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: c.pinRim,
    backgroundColor: c.accentDeep,
  },
  legendText: {
    color: c.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  moveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.violet,
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
  },
  moveBtnText: {
    color: c.violetText,
    fontSize: 12,
    fontWeight: '700',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  resetBtnText: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  moveBar: {
    borderColor: c.violet,
    shadowColor: c.violet,
  },
  moveBarCopy: {
    flex: 1,
    gap: 2,
  },
  moveBarSub: {
    color: c.textSecondary,
    fontSize: 12,
  },
  moveBarDone: {
    color: c.violetSoft,
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 12,
  },
  privacySourceNote: {
    color: c.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  approvalHeaderRow: {
    marginBottom: 6,
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  capacityCopy: {
    flex: 1,
    gap: 4,
  },
  capacityHint: {
    color: c.textSecondary,
    fontSize: 12,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderStrong,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.35,
  },
  stepperBtnText: {
    color: c.accent,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  stepperInput: {
    minWidth: 52,
    height: 36,
    paddingHorizontal: 4,
    color: c.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: c.borderStrong,
  },
  perimeterThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: c.onAccent,
  },
  targetIconBtn: {
    padding: 6,
    minWidth: 32,
    alignItems: 'center',
  },
  searchingText: {
    color: c.textFaint,
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
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
    zIndex: 6,
    elevation: 6,
  },
  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  suggestionLabel: {
    color: c.text,
    fontSize: 13,
    fontWeight: '600',
  },
  suggestionSubtitle: {
    color: c.textFaint,
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
    backgroundColor: c.base,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillToggleActive: {
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderColor: c.accent,
  },
  pillToggleText: {
    color: c.textFaint,
    fontSize: 12,
    fontWeight: '700',
  },
  pillToggleTextActive: {
    color: c.text,
  },
  whenBlock: {
    marginTop: 8,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: c.border,
    paddingBottom: 24,
    paddingHorizontal: 12,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  pickerTitle: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
  },
  pickerCancel: {
    color: c.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  pickerDone: {
    color: c.accent,
    fontSize: 15,
    fontWeight: '800',
  },
  whenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  whenRail: {
    width: 16,
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  whenDotFilled: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.textMuted,
  },
  whenDotOpen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: c.textMuted,
  },
  whenBridge: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 14,
    gap: 8,
  },
  whenConnector: {
    height: 14,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  whenPip: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: c.textFaint,
  },
  whenRule: {
    flex: 1,
    height: 1,
    backgroundColor: c.borderStrong,
  },
  whenLabel: {
    color: c.textMuted,
    fontSize: 16,
    fontWeight: '500',
    width: 48,
  },
  whenChips: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  whenChip: {
    position: 'relative',
    backgroundColor: c.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    overflow: 'hidden',
  },
  whenChipText: {
    color: c.text,
    fontSize: 14,
    fontWeight: '600',
  },
  repeatLabel: {
    width: undefined,
  },
  repeatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  repeatPanel: {
    marginTop: 10,
    gap: 10,
  },
  repeatOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  repeatOption: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: c.base,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  repeatOptionActive: {
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderColor: c.accent,
  },
  repeatOptionText: {
    color: c.textFaint,
    fontSize: 13,
    fontWeight: '700',
  },
  repeatOptionTextActive: {
    color: c.text,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekdayDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.base,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  weekdayDotOn: {
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderColor: c.accent,
  },
  weekdayDotLocked: {
    borderWidth: 2,
  },
  weekdayText: {
    color: c.textFaint,
    fontSize: 13,
    fontWeight: '700',
  },
  weekdayTextOn: {
    color: c.text,
  },
  repeatHint: {
    marginTop: 8,
    marginLeft: 24,
    color: c.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  ctaDock: {
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: c.sheet,
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
    borderColor: c.accent,
    backgroundColor: c.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  inviteBtnText: {
    color: c.textBody,
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
    borderColor: c.border,
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
    color: c.red,
    fontSize: 12,
    fontWeight: '800',
  },
  invitePanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.base,
    padding: 12,
    gap: 8,
  },
  inviteHeading: {
    color: c.textFaint,
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
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
    paddingHorizontal: 4,
  },
  inviteKindSelected: {
    backgroundColor: c.accent,
    borderColor: c.accentSoft,
  },
  inviteKindText: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  inviteKindTextSelected: {
    color: c.onAccent,
  },
  inviteList: {
    gap: 6,
  },
  inviteRow: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
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
    fontSize: 13,
    fontWeight: '700',
  },
  inviteRowMeta: {
    color: c.textFaint,
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
    backgroundColor: c.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  inviteAddBtn: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteAddText: {
    color: c.onAccent,
    fontSize: 13,
    fontWeight: '800',
  },
  inviteHint: {
    color: c.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  linkRowText: { flex: 1, color: c.text, fontSize: 13, fontWeight: '700' },
  linkNote: { color: c.textFaint, fontSize: 11.5, lineHeight: 16 },
  inviteError: {
    color: c.amber,
    fontSize: 11,
    fontWeight: '600',
  },
  formError: {
    color: c.amber,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  primaryDropBtn: {
    backgroundColor: c.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: c.accent,
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
    color: c.base,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
});