import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CalendarClock,
  Check,
  ChevronRight,
  EyeOff,
  Footprints,
  MapPin,
  MapPinCheck,
  Navigation,
  Share2,
  Flag,
  ShieldCheck,
  Star,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { CategoryBadge } from './CategoryBadge';
import { LiveBadge } from '../drops/LiveBadge';
import { ReportSheet, type ReportTarget } from '../safety/ReportSheet';
import { hostOf } from '../../lib/moderation';
import { useNavBarHeight } from './BottomNavBar';
import { formatBeaconDate, formatBeaconTime } from '../../lib/beaconWindow';
import { SHARE_BASE_URL } from '../../lib/droppedPoint';
import { isLiveNode } from '../../lib/liveStatus';
import { hereCountNow, hereLabel } from '../../lib/nearbyInterest';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';
import { formatDistance } from '../../lib/discoverFeed';
import { useUnits } from '../../lib/units';

const NAV_BAR_HEIGHT = 72;
/** The sheet starts this far down the screen, so the map (and the beacon pulse) stays in view. */
const SHEET_TOP_RATIO = 0.36;
const MAX_TAGS = 3;

/** Up to 3 hashtags, main (first) one first, from `tags` (array or text) or the single `tag`. */
function readTags(n: Record<string, unknown>): string[] {
  const raw: string[] = [];
  if (Array.isArray(n.tags)) n.tags.forEach((t) => typeof t === 'string' && raw.push(t));
  else if (typeof n.tags === 'string') raw.push(...n.tags.split(/[\s,]+/));
  if (typeof n.tag === 'string') raw.unshift(...n.tag.split(/[\s,]+/));
  const seen = new Set<string>();
  const tags: string[] = [];
  raw.forEach((t) => {
    const clean = t.replace(/^#+/, '').replace(/[^A-Za-z0-9_]/g, '');
    if (!clean || seen.has(clean.toLowerCase())) return;
    seen.add(clean.toLowerCase());
    tags.push(`#${clean}`);
  });
  return tags.slice(0, MAX_TAGS);
}

/**
 * Discover nodes come from the store and don't all carry the same fields yet, so everything
 * beyond the basics is read defensively and simply hidden when missing.
 */
interface NodeView {
  id: string;
  tag: string;
  /** Up to 3, main one first. */
  tags: string[];
  title: string;
  venue: string;
  status: string;
  eta: string;
  distanceMeters: number | null;
  attendeeCount: number;
  isRsvpd: boolean;
  description: string;
  host: string | null;
  photoUri: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxAttendance: number | null;
  requiresApproval: boolean;
  privacyRegion: string | null;
  latitude: number | null;
  longitude: number | null;
  live: boolean;
  hereCount: number;
  imHere: boolean;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function date(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readNode(node: unknown): NodeView {
  const n = (node ?? {}) as Record<string, unknown>;
  const privacy = n.locationPrivacy as { regionName?: unknown } | null | undefined;
  const hostValue = str(n.host) || str(n.hostHandle) || str(n.hostName);
  return {
    id: String(n.id ?? ''),
    tag: readTags(n)[0] ?? '',
    tags: readTags(n),
    title: str(n.title) || 'Untitled Point',
    venue: str(n.venue),
    status: str(n.status),
    eta: str(n.eta),
    distanceMeters: num(n.distanceMeters),
    attendeeCount: num(n.attendeeCount) ?? 0,
    isRsvpd: n.isRsvpd === true,
    description: str(n.description),
    host: hostValue || null,
    photoUri: str(n.coverPhotoUri) || str(n.photoUri) || str(n.imageUrl) || null,
    startsAt: date(n.startsAt),
    endsAt: date(n.endsAt),
    maxAttendance: num(n.maxAttendance),
    requiresApproval: n.requiresApproval === true || n.requiresRsvpApproval === true,
    privacyRegion: privacy && typeof privacy.regionName === 'string' ? privacy.regionName : null,
    latitude: num(n.latitude),
    longitude: num(n.longitude),
    live: isLiveNode(node),
    hereCount: num(n.hereCount) ?? 0,
    imHere: n.imHere === true,
  };
}

function whenText(view: NodeView): string {
  if (view.startsAt && view.endsAt) {
    if (view.live) return `Live now · until ${formatBeaconTime(view.endsAt)}`;
    const sameDay = view.startsAt.toDateString() === view.endsAt.toDateString();
    return sameDay
      ? `${formatBeaconDate(view.startsAt)} · ${formatBeaconTime(view.startsAt)} – ${formatBeaconTime(view.endsAt)}`
      : `${formatBeaconDate(view.startsAt)} ${formatBeaconTime(view.startsAt)} – ${formatBeaconDate(view.endsAt)} ${formatBeaconTime(view.endsAt)}`;
  }
  return view.live ? 'Happening now' : view.status || 'Time not set';
}

interface PointDetailSheetProps {
  /** The Discover node to show, or null when closed. */
  node: unknown | null;
  onClose: () => void;
  onToggleRsvp: (id: string) => void;
  /** Window Y of the sheet's top edge once it's in place, so the map can center above it. */
  onTopChange?: (y: number) => void;
  /** Tap on "Hosted by @x" → that host's public profile. */
  onOpenHost?: (handle: string) => void;
}

export const PointDetailSheet: React.FC<PointDetailSheetProps> = ({
  node,
  onClose,
  onToggleRsvp,
  onTopChange,
  onOpenHost,
}) => {
  useUnits(); // re-render when Settings switches km / miles
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const navBarHeight = useNavBarHeight();
  const toggleHere = useDiscoveryStore((state) => state.toggleHere);
  const slide = useRef(new Animated.Value(0)).current;
  const sheetRef = useRef<View | null>(null);
  const reportTop = () => {
    sheetRef.current?.measureInWindow((_x, y) => {
      if (Number.isFinite(y)) onTopChange?.(y);
    });
  };
  const [notice, setNotice] = useState('');
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const reportedRef = useRef(false);
  const view = node ? readNode(node) : null;

  useEffect(() => {
    setNotice('');
    if (!node) return;
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => reportTop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.id]);

  if (!view) return null;

  const screenHeight = Dimensions.get('window').height;
  const full = view.maxAttendance != null && view.attendeeCount >= view.maxAttendance && !view.isRsvpd;
  const going =
    view.maxAttendance != null
      ? `${view.attendeeCount} / ${view.maxAttendance} going${full ? ' · Full' : ''}`
      : `${view.attendeeCount} going`;
  // Exact place only when the host didn't hide it (or you're already going).
  const hidden = view.privacyRegion != null && !view.isRsvpd;
  const whereText = hidden ? `Somewhere in ${view.privacyRegion}` : view.venue || 'Location shared by the host';
  const canNavigate = !hidden && view.latitude != null && view.longitude != null;

  const rsvpLabel = view.isRsvpd
    ? view.requiresApproval
      ? 'REQUESTED'
      : 'GOING'
    : full
      ? 'FULL'
      : view.requiresApproval
        ? 'REQUEST TO JOIN'
        : 'RSVP';

  const share = async () => {
    try {
      const url = `${SHARE_BASE_URL}${encodeURIComponent(view.id)}`;
      const message = [view.title, `${whenText(view)} · ${hidden ? whereText : view.venue}`, url].filter(Boolean).join('\n');
      await Share.share(Platform.OS === 'ios' ? { message: message.replace(`\n${url}`, ''), url } : { message });
    } catch {
      setNotice('Couldn’t open sharing.');
    }
  };

  const directions = async () => {
    if (!canNavigate) return;
    const label = encodeURIComponent(view.venue || view.title);
    const url =
      Platform.OS === 'ios'
        ? `maps://?q=${label}&ll=${view.latitude},${view.longitude}`
        : `geo:${view.latitude},${view.longitude}?q=${view.latitude},${view.longitude}(${label})`;
    try {
      await Linking.openURL(url);
    } catch {
      setNotice('Couldn’t open your maps app.');
    }
  };

  return (
    <Animated.View
      ref={sheetRef as never}
      style={[
        styles.sheet,
        { bottom: navBarHeight },
        { top: screenHeight * SHEET_TOP_RATIO },
        {
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }],
        },
      ]}
      testID="point-detail-sheet"
    >
      <View style={styles.handleRow}>
        <TouchableOpacity onPress={onClose} style={styles.handleHit} accessibilityLabel="Close details">
          <View style={styles.handle} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
          testID="point-detail-close"
        >
          <X size={18} color={c.textMuted} strokeWidth={2.25} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() =>
            setReporting({ type: 'point', id: view.id, label: view.title, ownerHandle: hostOf(node) })
          }
          style={styles.reportBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Report this Point"
          testID="point-detail-report"
        >
          <Flag size={16} color={c.textFaint} strokeWidth={2.25} />
        </TouchableOpacity>
      </View>
      <ReportSheet
        target={reporting}
        onReported={() => {
          reportedRef.current = true;
        }}
        onClose={() => {
          setReporting(null);
          // A reported Point is hidden for you, so the details close with the report sheet.
          if (reportedRef.current) {
            reportedRef.current = false;
            onClose();
          }
        }}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {view.photoUri ? (
          <Image source={{ uri: view.photoUri }} style={styles.cover} resizeMode="cover" />
        ) : null}

        <View style={styles.titleRow}>
          <CategoryBadge tag={view.tag} title={view.title} photoUri={null} size={56} />
          <View style={styles.titleCopy}>
            {view.tags.length > 0 ? (
              <View style={styles.tagRow} testID="point-detail-tags">
                {view.tags.map((tag, index) =>
                  index === 0 ? (
                    // Main hashtag: filled, with a star, so it reads as the Point's category.
                    <View key={tag} style={styles.mainTag} accessibilityLabel={`Main hashtag ${tag}`}>
                      <Star size={10} color={c.onAccent} fill={c.onAccent} strokeWidth={2} />
                      <Text style={styles.mainTagText}>{tag}</Text>
                    </View>
                  ) : (
                    <View key={tag} style={styles.extraTag}>
                      <Text style={styles.extraTagText}>{tag}</Text>
                    </View>
                  ),
                )}
              </View>
            ) : null}
            <Text style={styles.title}>{view.title}</Text>
            {view.host ? (
              onOpenHost ? (
                <TouchableOpacity
                  style={styles.hostRow}
                  onPress={() => onOpenHost(view.host as string)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                  accessibilityRole="link"
                  accessibilityLabel={`View ${view.host}'s profile`}
                  testID="point-detail-host"
                >
                  <Text style={styles.host}>Hosted by </Text>
                  <Text style={styles.hostLink}>{view.host}</Text>
                  <ChevronRight size={14} color={c.accent} strokeWidth={2.5} />
                </TouchableOpacity>
              ) : (
                <Text style={styles.host}>Hosted by {view.host}</Text>
              )
            ) : null}
          </View>
        </View>

        <View style={styles.chipRow}>
          {view.live ? (
            <LiveBadge label="LIVE NOW" />
          ) : view.status ? (
            <View style={styles.soonChip}>
              <Text style={styles.soonText}>{view.status}</Text>
            </View>
          ) : null}
          {view.distanceMeters != null ? (
            <View style={styles.distanceChip}>
              <View style={styles.greenDot} />
              <Text style={styles.distanceText}>{formatDistance(view.distanceMeters)} away</Text>
            </View>
          ) : null}
          {view.eta ? (
            <View style={styles.etaChip}>
              <Footprints size={12} color={c.textMuted} strokeWidth={2.25} />
              <Text style={styles.etaText}>{view.eta}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Row Icon={CalendarClock} text={whenText(view)} />
          <Row Icon={hidden ? EyeOff : MapPin} text={whereText} tone={hidden ? c.violetSoft : undefined} />
          {hidden ? (
            <Text style={styles.subNote}>
              {view.requiresApproval ? 'Approved guests see the exact spot.' : 'You’ll see the exact spot after you RSVP.'}
            </Text>
          ) : null}
          <Row Icon={Users} text={going} />
          <Row
            Icon={ShieldCheck}
            text={view.requiresApproval ? 'The host approves each RSVP' : 'Anyone can RSVP'}
          />
        </View>

        {view.description ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>ABOUT</Text>
            <Text style={styles.description}>{view.description}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.rsvpBtn, view.isRsvpd && styles.rsvpBtnOn, full && styles.rsvpBtnFull]}
            onPress={() => onToggleRsvp(view.id)}
            disabled={full}
            accessibilityRole="button"
            accessibilityState={{ selected: view.isRsvpd, disabled: full }}
            testID="point-detail-rsvp"
          >
            {view.isRsvpd ? <Check size={16} color={c.accent} strokeWidth={3} /> : null}
            <Text style={[styles.rsvpText, view.isRsvpd && styles.rsvpTextOn, full && styles.rsvpTextFull]}>
              {rsvpLabel}
            </Text>
          </TouchableOpacity>
          <IconButton Icon={Share2} label="Share" onPress={share} />
          {canNavigate ? <IconButton Icon={Navigation} label="Directions" onPress={directions} /> : null}
        </View>
        {view.isRsvpd ? (
          <Text style={styles.subNote}>Tap {rsvpLabel} again to cancel your RSVP.</Text>
        ) : null}
        {/* Live: say you're here. Shown as a number on this Point only, and it switches itself
            off when the Point ends. Nobody sees who, or where you are. */}
        {view.live ? (
          <View style={styles.hereRow} testID="point-detail-here">
            <TouchableOpacity
              style={[styles.hereBtn, view.imHere && styles.hereBtnOn]}
              onPress={() => toggleHere(view.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: view.imHere }}
              accessibilityLabel={view.imHere ? "You're here. Tap to take it back" : "I'm here"}
              testID="point-detail-here-btn"
            >
              <MapPinCheck size={15} color={view.imHere ? c.base : c.green} strokeWidth={2.5} />
              <Text style={[styles.hereBtnText, view.imHere && styles.hereBtnTextOn]}>
                {view.imHere ? 'YOU’RE HERE' : 'I’M HERE'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.hereText}>
              {hereLabel(hereCountNow(view.hereCount, view.imHere, view.live)) ?? 'Be the first to say you’re here.'}
              {'\n'}
              <Text style={styles.hereHint}>Just a count: no names, no locations.</Text>
            </Text>
          </View>
        ) : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </ScrollView>
    </Animated.View>
  );
};

const Row: React.FC<{ Icon: LucideIcon; text: string; tone?: string }> = ({ Icon, text, tone }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
  <View style={styles.row}>
    <Icon size={16} color={tone ?? c.textMuted} strokeWidth={2.25} />
    <Text style={[styles.rowText, tone ? { color: tone } : null]}>{text}</Text>
  </View>
  );
};

const IconButton: React.FC<{ Icon: LucideIcon; label: string; onPress: () => void }> = ({ Icon, label, onPress }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
  <TouchableOpacity style={styles.iconBtn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    <Icon size={18} color={c.accent} strokeWidth={2.25} />
    <Text style={styles.iconBtnText}>{label}</Text>
  </TouchableOpacity>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: NAV_BAR_HEIGHT,
    zIndex: 30,
    backgroundColor: c.sheet,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderColor: c.accent,
  },
  // Tall enough to hold the close and report buttons, and above the scrolling content
  // (the cover photo used to slide over them).
  handleRow: { alignItems: 'center', paddingTop: 8, paddingBottom: 4, minHeight: 44, zIndex: 2, elevation: 2 },
  handleHit: { paddingVertical: 6, paddingHorizontal: 30 },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: c.borderStrong },
  closeBtn: { position: 'absolute', right: 14, top: 10, padding: 4 },
  reportBtn: { position: 'absolute', left: 16, top: 12, padding: 4 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: c.base },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleCopy: { flex: 1, gap: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  mainTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: c.accent,
  },
  mainTagText: { color: c.onAccent, fontSize: 12, fontWeight: '900' },
  extraTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  extraTagText: { color: c.accentSoft, fontSize: 12, fontWeight: '700' },
  title: { color: c.text, fontSize: 18, fontWeight: '800' },
  host: { color: c.textMuted, fontSize: 12 },
  hostRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 2 },
  hostLink: { color: c.accent, fontSize: 12, fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  soonChip: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  soonText: { color: c.greenDeep, fontSize: 11, fontWeight: '800' },
  distanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: c.chipBlue,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.greenDeep },
  distanceText: { color: c.sky, fontSize: 11, fontWeight: '700' },
  etaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  etaText: { color: c.textMuted, fontSize: 11 },
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { flex: 1, color: c.textSecondary, fontSize: 13 },
  subNote: { color: c.textMuted, fontSize: 11, lineHeight: 15, marginTop: -4, marginLeft: 26 },
  sectionLabel: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  description: { color: c.textBody, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  rsvpBtn: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    gap: 8,
    borderRadius: 14,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rsvpBtnOn: { backgroundColor: 'rgba(34, 211, 238, 0.12)', borderWidth: 1.5, borderColor: c.accent },
  rsvpBtnFull: { backgroundColor: c.border },
  rsvpText: { color: c.base, fontSize: 14, fontWeight: '900', letterSpacing: 1.2 },
  rsvpTextOn: { color: c.accent },
  rsvpTextFull: { color: c.textFaint },
  iconBtn: {
    minWidth: 72,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 10,
  },
  iconBtnText: { color: c.textSecondary, fontSize: 11, fontWeight: '700' },
  notice: { color: c.amber, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  hereRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hereBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: c.green,
  },
  hereBtnOn: { backgroundColor: c.green },
  hereBtnText: { color: c.green, fontSize: 13, fontWeight: '900', letterSpacing: 0.6 },
  hereBtnTextOn: { color: c.base },
  hereText: { flex: 1, color: c.textBody, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  hereHint: { color: c.textFaint, fontSize: 11, fontWeight: '600' },
});
