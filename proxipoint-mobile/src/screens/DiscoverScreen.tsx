import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { canonicalizeTags } from '../lib/hashtags';
import { BackHandler, StyleSheet, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProximitySocket } from '../hooks/useProximitySocket';
import { DiscoveryMapCanvas } from '../components/discovery/DiscoveryMapCanvas';
import { TopFilterHeader } from '../components/discovery/TopFilterHeader';
import { EventCardList } from '../components/discovery/EventCardList';
import { BottomNavBar, type NavTab } from '../components/discovery/BottomNavBar';
import { CreateChooserSheet } from '../components/discovery/CreateChooserSheet';
import { DropPointModal } from '../components/discovery/DropPointModal';
import { ManagePointSheet } from '../components/drops/ManagePointSheet';
import { MyDropsScreen } from './MyDropsScreen';
import { PointDetailSheet } from '../components/discovery/PointDetailSheet';
import { PhotoPolicyHost } from '../components/safety/PhotoPolicyHost';
import { CircleCropHost } from '../components/common/CircleCropHost';
import { TourOverlay } from '../components/tour/TourOverlay';
import { tourTarget } from '../components/tour/tourTargets';
import { MAP_TOUR, MAP_TOUR_KEY } from '../lib/tour';
import { useDiscoveryStore } from '../stores/useDiscoveryStore';
import { useAuthStore } from '../stores/useAuthStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUnits, setUnits } from '../lib/units';
import { ProfileScreen } from './ProfileScreen';
import { SettingsScreen } from './SettingsScreen';
import { HostProfileScreen } from './HostProfileScreen';
import { canPostIn } from '../lib/channelAccess';
import { ActivityScreen } from './ActivityScreen';
import { CampaignsView } from '../components/campaigns/CampaignsView';
import { AlertsScreen } from '../components/profile/AlertsScreen';
import { HostInsightsScreen } from '../components/profile/HostInsightsScreen';
import { CalendarScreen } from './CalendarScreen';
import { DiscoverFeedScreen } from './DiscoverFeedScreen';
import { ChannelsScreen, type ChannelsSegment } from './ChannelsScreen';
import { setTimeWindow, timeWindowLabel, useTimeWindow } from '../lib/timeWindow';
import { useMapPostFilter } from '../lib/mapFilters';
import { areaName } from '../lib/mapArea';
import { setMyInterestMembership } from '../lib/nearbyInterest';
import { MapFilterSheet } from '../components/discovery/MapFilterSheet';
import { formatRange } from '../lib/calendarRange';
import { CalendarDays, ChevronDown, ChevronLeft } from 'lucide-react-native';
import { CityPill, CityPickerSheet, type PickKind } from '../components/discovery/CityPicker';
import { CITY_LIST, cityAt, cityLabel, currentPosition, watchPosition, type CityPlace } from '../lib/places';
import { checkTagAlerts, unreadCount as activityUnread, useActivity } from '../lib/activity';
import { addPost, getChannel, getChannels, getPost, syncAutoChannels } from '../lib/channels';
import { formatPointWhen, publicWhere, recentDropPlaces } from '../lib/droppedPoint';
import { announcementText, campaignEvents, takeDueBroadcasts, type Campaign, type NewCampaignEvent } from '../lib/campaigns';
import { createBeaconDraft, toBeaconCreatePayload } from '../lib/beaconDraft';
import { formatBeaconStart, presetForHours, windowDurationHours } from '../lib/beaconWindow';
import { BeaconApiError, postBeacon } from '../services/beaconApi';
import { planAutoChannels } from '../lib/autoChannels';
import { useBoosts } from '../lib/boost';
import { useModeration } from '../lib/moderation';
import { myTagSuggestions } from '../lib/tagInput';
import { setFollowedTags } from '../lib/discoverFilters';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, type MyProfile, type MySettings } from '../lib/myProfile';
import type { PointRecap } from '../lib/pointRecap';
import type { DroppedPoint } from '../lib/droppedPoint';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme/ThemeContext';

/** Where the Distance units setting is saved on the phone. */
const UNITS_KEY = 'pp.settings.units.v1';

type ScreenTab = NavTab;

export const DiscoverScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { mode, colors: c } = useTheme();
  // Live duplex telemetry socket hook
  useProximitySocket();
  // Opens on the Discover feed; the map lives on Explore Map.
  const [tab, setTab] = useState<ScreenTab>('discover');
  // Profile tab: the profile itself, or My Drops opened from it.
  // Profile tab: the profile itself, or a page opened from it (My Drops, alerts, My Series).
  const [profileView, setProfileView] = useState<'main' | 'drops' | 'alerts' | 'series' | 'insights'>('main');
  // Profile opened to a section (e.g. MY #TAGS from Alerts' "Following #tags"). New key = new request.
  const [profileFocus, setProfileFocus] = useState<{ key: number; section: 'tags' } | null>(null);
  // Channels tab: which view (Feed / Alerts / My Channels) and which channel page is open.
  const [channelsSegment, setChannelsSegment] = useState<ChannelsSegment>('feed');
  const [channelId, setChannelId] = useState<string | null>(null);
  // A channel post's page (comments), opened from a feed, a channel or a pin on the map.
  const [postId, setPostId] = useState<string | null>(null);
  // Place page in the Channels tab (a park, venue, trail… and everything said about it).
  const [placeId, setPlaceId] = useState<string | null>(null);
  // Set when that post was opened from a pin on the map: Back returns to the map, at the pin.
  const [postFromMap, setPostFromMap] = useState<{ latitude: number; longitude: number } | null>(null);
  // "Show on map" for a pinned post: Explore Map opens centered there. New key = new request.
  // Search opened from another tab (Channels' search button). New key = new request.
  const [searchRequest, setSearchRequest] = useState<{ key: number; text?: string } | null>(null);
  const [mapFocus, setMapFocus] = useState<{ latitude: number; longitude: number; key: number } | null>(null);
  const [dropOpen, setDropOpen] = useState(false);
  // How much of the Explore Map the card list covers (the map stays full size under it).
  const [cardsCover, setCardsCover] = useState(0);
  // The bottom bar's +: Single Drop or Series.
  const [createChooser, setCreateChooser] = useState(false);
  const [newSeriesRequest, setNewSeriesRequest] = useState<number | null>(null);
  const clearNewSeriesRequest = useCallback(() => setNewSeriesRequest(null), []);
  // Kept in memory for now; load from the backend (e.g. GET /me/points) once that exists.
  const [myDrops, setMyDrops] = useState<DroppedPoint[]>([]);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  // Set by "Drop again" so the Drop Point sheet opens filled in.
  const [dropPrefill, setDropPrefill] = useState<DroppedPoint | null>(null);
  // Settings and the Calendar open full-screen over everything (including the nav bar).
  // Discover "Live Now" filter (shared by the header chips, the map and the cards).
  const [liveOnly, setLiveOnly] = useState(false);
  // Public detail sheet for a Discover card (the card stays selected after it closes).
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailTopY, setDetailTopY] = useState<number | null>(null);
  // Height of the map + cards area (for the full-screen card list).
  const [cardsArea, setCardsArea] = useState<number | null>(null);
  // Tapping Discover in the nav bar sends the card list back to its default size.
  const [cardsReset, setCardsReset] = useState(0);
  const [cardsFull, setCardsFull] = useState(false);
  // Dates the map shows: the next 3 days, or what was picked in the Calendar.
  const timeWindow = useTimeWindow();
  const postFilter = useMapPostFilter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const discoverNodes = useDiscoveryStore((state) => state.nodes);
  const toggleRsvp = useDiscoveryStore((state) => state.toggleRsvp);
  const setSelectedNodeId = useDiscoveryStore((state) => state.setSelectedNodeId);
  const syncMyPoint = useDiscoveryStore((state) => state.syncMyPoint);
  const viewPlace = useDiscoveryStore((state) => state.viewPlace);
  const setViewPlace = useDiscoveryStore((state) => state.setViewPlace);
  const setSelfCoordinates = useDiscoveryStore((state) => state.setSelfCoordinates);
  const selfCoordinates = useDiscoveryStore((state) => state.selfCoordinates);
  const addTag = useDiscoveryStore((state) => state.addTag);
  const setSelectedTag = useDiscoveryStore((state) => state.setSelectedTag);
  // Public profile of a host, opened from "Hosted by @x" on the detail sheet.
  const [hostHandle, setHostHandle] = useState<string | null>(null);
  const detailNode = detailId
    ? (Object.values(discoverNodes || {}) as Array<{ id: string }>).find((node) => node.id === detailId) ?? null
    : null;

  // Android back button closes the detail sheet first.
  useEffect(() => {
    if (!detailId) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setDetailId(null);
      return true;
    });
    return () => sub.remove();
  }, [detailId]);

  // Android back on a host profile returns to the Point it was opened from.
  useEffect(() => {
    if (!hostHandle) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setHostHandle(null);
      return true;
    });
    return () => sub.remove();
  }, [hostHandle]);

  // From a host profile, the feed or a channel: show that Point on Explore Map with its details open.
  const openHostPoint = (id: string) => {
    setHostHandle(null);
    setTab('map');
    setSelectedNodeId(id);
    setDetailId(id);
  };
  const [overlay, setOverlay] = useState<'settings' | 'calendar' | null>(null);
  // Calendar opened from Discover's When chip: its button sets the dates and stays on Discover.
  const [calendarFromDiscover, setCalendarFromDiscover] = useState(false);
  // An @handle tapped anywhere: yours goes to the Profile tab, anyone else's opens over the screen.
  const openProfile = (handle: string) => {
    const me = profile.handle.replace(/^@+/, '').toLowerCase();
    if (handle.replace(/^@+/, '').toLowerCase() === me) goTo('profile');
    else setHostHandle(handle);
  };
  const [settingsSection, setSettingsSection] = useState<'edit' | null>(null);
  // Starts from the signed-in account and what onboarding chose; edits stay in memory until the
  // backend has GET/PATCH /me.
  const [profile, setProfile] = useState<MyProfile>(() => {
    const { session, seed } = useAuthStore.getState();
    const account = session?.account;
    const merged = {
      ...DEFAULT_PROFILE,
      ...(seed?.profile ?? {}),
      ...(account?.displayName ? { displayName: account.displayName } : {}),
      ...(account?.handle ? { handle: `@${account.handle}` } : {}),
    };
    // Followed tags saved before the allowed list: old spellings map onto it, the rest are dropped.
    return { ...merged, interestTags: canonicalizeTags(merged.interestTags) };
  });

  // ---- Where Discover is looking -------------------------------------------------------------
  // The app's default area (where the sample Points are) until a home city is chosen.
  const [defaultArea, setDefaultArea] = useState<CityPlace>(() => {
    const spot = useDiscoveryStore.getState().selfCoordinates;
    return { name: '', latitude: spot.latitude, longitude: spot.longitude };
  });
  useEffect(() => {
    let alive = true;
    void cityAt(defaultArea.latitude, defaultArea.longitude).then((named) => {
      if (alive && named) setDefaultArea((area) => ({ ...area, name: named.name, region: named.region }));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const home: CityPlace = profile.homeCity ?? defaultArea;
  // "Count me in" for nearby interest numbers is turned off for now (no toggle anywhere), so you're
  // never added to the counts, even if an older account had opted in.
  useEffect(() => {
    setMyInterestMembership(null);
  }, []);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [gpsPlace, setGpsPlace] = useState<CityPlace | null>(null);

  // Tracking off: you're "at" your home city and Discover opens there.
  // Tracking on: follow GPS (Discover re-centers only after you've moved a couple of km).
  useEffect(() => {
    if (!profile.trackLocation) {
      setGpsPlace(null);
      setSelfCoordinates({ latitude: home.latitude, longitude: home.longitude });
      if (useDiscoveryStore.getState().viewPlace.kind !== 'search') setViewPlace({ ...home, kind: 'home' });
      return;
    }
    let stop: () => void = () => undefined;
    let alive = true;
    const moveTo = async (latitude: number, longitude: number, first: boolean) => {
      setSelfCoordinates({ latitude, longitude });
      const view = useDiscoveryStore.getState().viewPlace;
      const farFromView = Math.hypot(
        (latitude - view.latitude) * 111320,
        (longitude - view.longitude) * 111320 * Math.cos((latitude * Math.PI) / 180),
      );
      if (view.kind === 'search') return; // exploring another city: leave the view alone
      if (!first && farFromView < 2000) return;
      const named = (await cityAt(latitude, longitude)) ?? { name: 'Your location', latitude, longitude };
      if (!alive) return;
      const place = { ...named, latitude, longitude };
      setGpsPlace(place);
      setViewPlace({ ...place, kind: 'gps' });
    };
    void currentPosition().then(async (fix) => {
      if (!alive || !fix.ok) return;
      await moveTo(fix.latitude, fix.longitude, true);
      stop = await watchPosition((lat, lon) => void moveTo(lat, lon, false));
      if (!alive) stop();
    });
    return () => {
      alive = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.trackLocation, home.latitude, home.longitude]);

  // Keep the label right once the default area's name comes back from the geocoder.
  useEffect(() => {
    if (!profile.homeCity && viewPlace.kind === 'home' && viewPlace.latitude === defaultArea.latitude && !viewPlace.name && defaultArea.name) {
      setViewPlace({ ...defaultArea, kind: 'home' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultArea.name]);

  const pickCity = (place: CityPlace, kind: PickKind) => {
    setCityPickerOpen(false);
    setDetailId(null);
    if (kind === 'gps') {
      setSelfCoordinates({ latitude: place.latitude, longitude: place.longitude });
      setGpsPlace(place);
    }
    setViewPlace({ ...place, kind });
  };

  // ✕ on the city pill: back to where you are (GPS) or your home city.
  const returnHome = () => {
    setDetailId(null);
    if (profile.trackLocation && gpsPlace) setViewPlace({ ...gpsPlace, kind: 'gps' });
    else setViewPlace({ ...home, kind: 'home' });
  };
  const [settings, setSettings] = useState<MySettings>(() => {
    const seed = useAuthStore.getState().seed;
    const base = { ...DEFAULT_SETTINGS, units: getUnits() };
    return seed ? { ...base, notifications: seed.notifications } : base;
  });
  // Distance units apply app-wide (every distance reads lib/units) and are saved on the phone.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(UNITS_KEY)
      .then((saved) => {
        if (!cancelled && (saved === 'metric' || saved === 'imperial')) {
          setSettings((current) => (current.units === saved ? current : { ...current, units: saved }));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    setUnits(settings.units);
    AsyncStorage.setItem(UNITS_KEY, settings.units).catch(() => undefined);
  }, [settings.units]);
  // First-run tour of Explore Map: the step showing, or null. Seen once per phone (Settings can replay it).
  const [tourStep, setTourStep] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    AsyncStorage.getItem(MAP_TOUR_KEY)
      .then((seen) => {
        if (cancelled || seen) return;
        // First open: land on Explore Map, give the map a moment to draw, then start.
        setTab('map');
        timer = setTimeout(() => !cancelled && setTourStep(0), 700);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);
  // Step 1.1 points at the Tags field, so the Create Event sheet is open for that step only.
  useEffect(() => {
    if (tourStep == null) return;
    const needsSheet = Boolean(MAP_TOUR[tourStep]?.needsCreateSheet);
    if (needsSheet) {
      setDetailId(null);
      setManagingId(null);
      setDropPrefill(null);
    }
    setDropOpen(needsSheet);
  }, [tourStep]);
  const endTour = () => {
    setTourStep(null);
    setDropOpen(false);
    AsyncStorage.setItem(MAP_TOUR_KEY, new Date().toISOString()).catch(() => undefined);
  };
  const startTour = () => {
    goTo('map');
    setTimeout(() => setTourStep(0), 400);
  };

  // Point recaps posted from the Profile page (in memory until the backend has them).
  const [recaps, setRecaps] = useState<PointRecap[]>([]);

  // Activity alerts: whenever Discover's Points, boosts or your #tags change, look for new matches.
  const boostClock = useBoosts();
  const moderationVersion = useModeration();
  useEffect(() => {
    checkTagAlerts(discoverNodes as never, profile.interestTags ?? []);
  }, [discoverNodes, boostClock, moderationVersion, profile.interestTags]);
  // Auto channels: a general one for the city you're looking at, plus one per #tag that Points
  // around it use but no channel covers yet, so Channels is never empty in a new area.
  useEffect(() => {
    const city = viewPlace.name || home.name;
    if (city) syncAutoChannels(planAutoChannels(getChannels(), discoverNodes as never, city));
  }, [discoverNodes, viewPlace.name, home.name]);
  useActivity(); // re-render for the unread badge
  const unread = activityUnread();

  // Android back button: closes Settings (back to the Profile tab) or the Calendar.
  useEffect(() => {
    if (!overlay) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOverlay(null);
      return true;
    });
    return () => sub.remove();
  }, [overlay]);

  // Android back on a Profile page (My Drops, alerts, My Series) returns to the Profile.
  useEffect(() => {
    if (tab !== 'profile' || profileView === 'main') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setProfileView('main');
      return true;
    });
    return () => sub.remove();
  }, [tab, profileView]);

  const openSettings = (section: 'edit' | null = null) => {
    setSettingsSection(section);
    setOverlay('settings');
  };

  // Explore Map's "Include my Followed Tags" filter uses your followed #tags.
  useEffect(() => setFollowedTags(profile.interestTags), [profile.interestTags]);
  // Tags you use most (your Drops, then Followed Tags), offered on Create Drop.
  const myTags = useMemo(() => myTagSuggestions(profile.interestTags, myDrops), [profile.interestTags, myDrops]);
  const recentPlaces = useMemo(() => recentDropPlaces(myDrops), [myDrops]);
  const managing = myDrops.find((drop) => drop.id === managingId) ?? null;

  const openDropAgain = (id: string) => {
    const source = myDrops.find((drop) => drop.id === id);
    if (!source) return;
    setManagingId(null);
    setDropPrefill(source);
    setDropOpen(true);
  };

  const closeDrop = () => {
    setDropOpen(false);
    setDropPrefill(null);
  };

  const goTo = (next: ScreenTab) => {
    setDetailId(null);
    setHostHandle(null);
    setOverlay(null);
    setDropOpen(false);
    setDropPrefill(null);
    setManagingId(null);
    // A tab always opens on its main view (tapping Channels again leaves a channel page).
    setProfileView('main');
    setChannelId(null);
    setPostId(null);
    setPlaceId(null);
    setPostFromMap(null);
    setMapFocus(null);
    setSearchRequest(null); // one-shot: Discover shouldn't refocus search on later visits
    setTab(next);
  };

  // Explore Map filtered to one #tag (from Discover search or Channels alerts).
  const showTagOnMap = (tag: string) => {
    // Make sure the chip exists in the header, then filter by it.
    addTag(tag);
    const known = useDiscoveryStore.getState().tags.find(
      (t: string) => t.replace(/^#+/, '').toLowerCase() === tag.replace(/^#+/, '').toLowerCase(),
    );
    setSelectedTag(known ?? tag);
    setLiveOnly(false);
    goTo('map');
  };

  const handleDropped = (point: DroppedPoint) => {
    setMyDrops((current) => [point, ...current.filter((drop) => drop.id !== point.id)]);
    // Give the new pin its full details (times, all #tags) so the calendar and alerts see it.
    syncMyPoint(point);
    // Posted to a channel you're in: the channel gets a post about the new Point.
    // (Server side this happens with the Point's create call.)
    const channel = point.channelId ? getChannel(point.channelId) : null;
    if (channel?.joined && canPostIn(channel)) {
      addPost(channel.id, profile.handle, `New Point: ${point.title}\n${formatPointWhen(point)} · ${publicWhere(point)}`);
    }
    setDropOpen(false);
    setDropPrefill(null);
    setTab('profile');
    setProfileView('drops');
    setJustDroppedId(point.id);
    setManagingId(point.id);
  };

  // ---- Campaigns ----------------------------------------------------------------------------
  /** New events typed into a campaign become real Points (same path as Create Drop). */
  const createCampaignPoints = async (
    events: NewCampaignEvent[],
    meta: { campaignName: string; description: string; tags: string[] },
  ): Promise<DroppedPoint[]> => {
    const store = useDiscoveryStore.getState();
    const created: DroppedPoint[] = [];
    for (const event of events) {
      if (!event.place) continue;
      const start = new Date(event.startsAt);
      const end = new Date(event.endsAt);
      const durationHours = windowDurationHours(start, end);
      const draft = createBeaconDraft({
        title: event.title,
        description: meta.description,
        tags: meta.tags.join(', '),
        visibility: 'public',
        channelId: null,
        venue: event.place.label,
        latitude: event.place.latitude,
        longitude: event.place.longitude,
        isLiveNow: false,
        duration: presetForHours(durationHours),
        durationHours,
        scheduledStart: formatBeaconStart(start),
        tierLevel: 'micro',
      });
      let id: string | undefined;
      let synced = true;
      try {
        // Sent alongside the usual payload; the backend needs to accept these fields.
        const saved = await postBeacon(
          Object.assign(toBeaconCreatePayload(draft), { startsAt: event.startsAt, endsAt: event.endsAt, campaignName: meta.campaignName }),
        );
        const savedId = (saved as { id?: unknown } | null)?.id;
        id = store.adoptPersistedBeacon(saved, draft) || (savedId != null ? String(savedId) : undefined);
      } catch (error) {
        if (error instanceof BeaconApiError && error.status >= 400 && error.status < 500) {
          throw new Error(`The server rejected "${event.title}". Check its title and place, then try again.`);
        }
        id = store.dropBeacon(draft); // offline: on this phone only, like Create Drop
        synced = false;
      }
      created.push({
        id: id ?? `local-${Date.now()}-${created.length}`,
        title: event.title,
        description: meta.description,
        tags: meta.tags.map((tag) => tag.replace(/^#+/, '')),
        visibility: 'public',
        channelId: null,
        venue: event.place.label,
        latitude: event.place.latitude,
        longitude: event.place.longitude,
        isLiveNow: false,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        coverPhotoUri: null,
        requiresApproval: false,
        maxAttendance: null,
        locationPrivacy: null,
        beaconRadius: null,
        invites: [],
        synced,
        createdAt: new Date().toISOString(),
      });
    }
    setMyDrops((current) => [...created, ...current.filter((drop) => !created.some((p) => p.id === drop.id))]);
    created.forEach((point) => syncMyPoint(point));
    return created;
  };

  /** A campaign's announcement: posted in each chosen channel you can post in. The other audiences
   *  (#tag followers, your followers, RSVP reminders) are sent by the server. */
  const announceCampaign = (campaign: Campaign, events: DroppedPoint[]) => {
    const text = announcementText(campaign, events);
    campaign.audience.channelIds.forEach((id) => {
      const channel = getChannel(id);
      if (channel?.joined && canPostIn(channel)) addPost(channel.id, profile.handle, text, null, [], 'heads_up');
    });
  };

  // Scheduled announcements go out when their time comes (checked on the 30-second clock).
  useEffect(() => {
    takeDueBroadcasts().forEach((campaign) => announceCampaign(campaign, campaignEvents(campaign, myDrops)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boostClock]);

  const updateDrop = (point: DroppedPoint) => {
    setMyDrops((current) => current.map((drop) => (drop.id === point.id ? point : drop)));
    // Keep the map pin and Discover card in step (tags, title, place, time; ending removes it).
    syncMyPoint(point);
  };

  const closeManage = () => {
    setManagingId(null);
    setJustDroppedId(null);
  };

  // City · dates row, shared by Explore Map and Discover (same area, same dates, same sheet).
  const exploreTopRow = (
    <>
      <CityPill
        inline
        label={viewPlace.name ? cityLabel(viewPlace) : cityLabel(home)}
        exploring={viewPlace.kind === 'search'}
        tracking={Boolean(profile.trackLocation)}
        onPress={() => setCityPickerOpen(true)}
        onReturn={returnHome}
      />
      {/* Dates, like Discover's: opens the When sheet, which has the quick
          ranges and Pick dates (the Calendar). Next 3 days there puts it back. */}
      <TouchableOpacity
        ref={tourTarget('map-date-chip')}
        style={[styles.dateChip, timeWindow.custom && styles.dateChipOn]}
        onPress={() => setFiltersOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Showing ${timeWindowLabel(timeWindow) ?? 'Calendar dates'}. Change dates`}
        testID="discover-date-window"
      >
        <CalendarDays size={13} color={c.accent} strokeWidth={2.5} />
        <Text style={styles.datePillText} numberOfLines={1}>
          {timeWindowLabel(timeWindow) ??
            formatRange({ start: new Date(timeWindow.start), end: new Date(timeWindow.end) })}
        </Text>
        <ChevronDown size={14} color={c.accent} strokeWidth={2.5} />
      </TouchableOpacity>
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Edge-to-edge: the status bar is always see-through; only its icon color is set.
          (translucent / backgroundColor are removed in Expo SDK 58 / React Native 0.88.) */}
      <StatusBar barStyle={mode === 'light' ? 'dark-content' : 'light-content'} />

      {tab === 'discover' ? (
        <DiscoverFeedScreen
          interestTags={profile.interestTags ?? []}
          // Same filters as Explore Map: city · dates, then Filter & sort, All, Live Now and #tags.
          liveOnly={liveOnly}
          filterHeader={
            <TopFilterHeader
              embedded
              liveOnly={liveOnly}
              onToggleLiveOnly={() => setLiveOnly((on) => !on)}
              topRow={exploreTopRow}
            />
          }
          placeLabel={viewPlace.name ? cityLabel(viewPlace) : cityLabel(home)}
          onOpenPoint={openHostPoint}
          onToggleRsvp={(id) => toggleRsvp(id)}
          onOpenChannel={(id) => {
            goTo('channels');
            setChannelId(id);
          }}
          onBrowseChannels={() => {
            goTo('channels');
            setChannelsSegment('manage');
          }}
          onOpenMap={() => goTo('map')}
          onOpenSettings={() => openSettings()}
          // Same area picker as the map's city pill, so Discover and the map stay on one place.
          onPickLocation={() => setCityPickerOpen(true)}
          onShowTagOnMap={showTagOnMap}
          searchRequest={searchRequest}
          onOpenProfile={openProfile}
          onOpenPost={(id) => {
            goTo('channels');
            setPostId(id);
          }}
          onOpenPlace={(id) => {
            goTo('channels');
            setPlaceId(id);
          }}
          onPickDates={() => {
            setCalendarFromDiscover(true);
            setOverlay('calendar');
          }}
          // Up next: Manage opens over Discover.
          onManagePoint={(id) => {
            setJustDroppedId(null);
            setManagingId(id);
          }}
        />
      ) : null}

      {tab === 'map' ? (
        <>
          <TopFilterHeader
            liveOnly={liveOnly}
            onToggleLiveOnly={() => setLiveOnly((on) => !on)}
            // Top row: city (fills the row) · dates (Next 3 days by default; ⌄ opens When → Calendar).
            // Creating a Drop is the + in the bottom bar.
            topRow={exploreTopRow}
          />
          {/* Map + cards share this area; the cards can grow to cover all of it (full list). */}
          <View
            ref={tourTarget('map-area')}
            collapsable={false}
            style={styles.mapAndCards}
            onLayout={(event) => setCardsArea(event.nativeEvent.layout.height)}>
            {/* The map fills the area; the card list slides over its bottom. */}
            <View style={StyleSheet.absoluteFill}>
            <DiscoveryMapCanvas
              liveOnly={liveOnly}
              coveredBottom={cardsCover}
              // The open Point stays on the map even if the filters hide it (until it's closed).
              showAlwaysId={detailId}
              // Touching the map closes the detail sheet (the Point stays selected).
              onMapTouch={() => setDetailId(null)}
              coveredFromY={detailId ? detailTopY : null}
              // Picked from a cluster's list (several Points at one spot): show its details.
              onOpenPoint={setDetailId}
              // Speech-bubble pins for channel posts: open the post and its comments.
              onOpenPost={(id) => {
                const place = getPost(id)?.place ?? null;
                goTo('channels');
                setPostId(id);
                setPostFromMap(place ? { latitude: place.latitude, longitude: place.longitude } : null);
              }}
              focusRequest={mapFocus}
              // Panned or zoomed away: make what's on screen the area (Discover follows).
              onReturnHome={returnHome}
              onSearchArea={(area) => {
                setDetailId(null);
                setViewPlace({
                  name: areaName(area, CITY_LIST),
                  latitude: area.latitude,
                  longitude: area.longitude,
                  kind: 'search',
                });
              }}
            />
            </View>
            <EventCardList
              liveOnly={liveOnly}
              // Cards always open the Point's details (even if it's inside a map bubble).
              onOpenDetails={setDetailId}
              fullHeight={cardsArea}
              resetSignal={cardsReset}
              onFullChange={setCardsFull}
              onCoverChange={setCardsCover}
            />
          </View>
          <PointDetailSheet
            node={detailNode}
            onClose={() => setDetailId(null)}
            onToggleRsvp={(id) => toggleRsvp(id)}
            onTopChange={setDetailTopY}
            onOpenHost={setHostHandle}
          />
        </>
      ) : null}

      {tab === 'channels' ? (
        <ChannelsScreen
          myDrops={myDrops}
          onCreateCampaignPoints={createCampaignPoints}
          onAnnounceCampaign={announceCampaign}
          newSeriesRequest={newSeriesRequest}
          onNewSeriesHandled={clearNewSeriesRequest}
          onManagePoint={(id) => {
            setJustDroppedId(null);
            setManagingId(id);
          }}
          segment={channelsSegment}
          onChangeSegment={setChannelsSegment}
          channelId={channelId}
          onOpenChannel={(id) => {
            setChannelId(id);
            // A channel opened from a post page replaces it; Back then goes to the channel list.
            if (id) {
              setPostId(null);
              setPostFromMap(null);
            }
          }}
          postId={postId}
          onOpenPost={(id) => {
            // Back from a post opened on the map: return to the map, centered on its pin.
            if (id === null && postFromMap) {
              const spot = postFromMap;
              goTo('map');
              setMapFocus({ ...spot, key: Date.now() });
              return;
            }
            setPostId(id);
            if (id === null) setPostFromMap(null);
          }}
          myLocation={selfCoordinates}
          // Opens over Channels, so Back comes straight back to the post.
          onOpenProfile={openProfile}
          onOpenSearch={() => {
            goTo('discover');
            setSearchRequest({ key: Date.now() });
          }}
          onShowPostOnMap={(post) => {
            if (!post.place) return;
            goTo('map');
            setMapFocus({ latitude: post.place.latitude, longitude: post.place.longitude, key: Date.now() });
          }}
          placeId={placeId}
          onOpenPlace={(id) => {
            setPlaceId(id);
            // A place opened from a post page replaces it (Back then goes to where the post was opened from).
            if (id) {
              setPostId(null);
              setPostFromMap(null);
            }
          }}
          onShowSpotOnMap={(spot) => {
            goTo('map');
            setMapFocus({ ...spot, key: Date.now() });
          }}
          myHandle={profile.handle}
          unreadAlerts={unread}
          onOpenAlerts={() => {
            goTo('profile');
            setProfileView('alerts');
          }}
          interestTags={profile.interestTags ?? []}
          onOpenPoint={openHostPoint}
          onToggleRsvp={(id) => toggleRsvp(id)}
          onEditTags={() => {
            goTo('profile');
            setProfileFocus({ key: Date.now(), section: 'tags' });
          }}
          onOpenTag={showTagOnMap}
        />
      ) : null}

      {tab === 'profile' && profileView === 'main' ? (
        <ProfileScreen
          focusRequest={profileFocus}
          profile={profile}
          drops={myDrops}
          asTab
          onOpenSettings={() => openSettings()}
          onOpenMyDrops={() => setProfileView('drops')}
          onOpenDrop={(id) => {
            setJustDroppedId(null);
            setManagingId(id);
          }}
          onDropAgain={openDropAgain}
          onOpenActivity={() => setProfileView('alerts')}
          onOpenCampaigns={() => setProfileView('series')}
          onOpenInsights={() => setProfileView('insights')}
          onDropPoint={() => {
            setManagingId(null);
            setDropPrefill(null);
            setDropOpen(true);
          }}
          onChangeAvatar={(uri) => setProfile((current) => ({ ...current, avatarUri: uri }))}
          onChangeBio={(bio) => setProfile((current) => ({ ...current, bio }))}
          defaultAreaLabel={cityLabel(defaultArea)}
          onChangeHomeCity={(city) => {
            // Server side: PATCH /me { homeCity }
            setProfile((current) => ({ ...current, homeCity: city }));
            if (!profile.trackLocation) setViewPlace({ ...city, kind: 'home' });
          }}
          onChangeTracking={(on) => setProfile((current) => ({ ...current, trackLocation: on }))}
          // Server side: PATCH /me { channelsPublic }
          onChangeChannelsPublic={(channelsPublic) => setProfile((current) => ({ ...current, channelsPublic }))}
          onOpenChannel={(id) => {
            goTo('channels');
            setChannelId(id);
          }}
          onBrowseChannels={() => {
            goTo('channels');
            setChannelsSegment('manage');
          }}
          onChangeInterestTags={(interestTags, interestTagsPublic) =>
            // Server side: PUT /me/interest-tags
            setProfile((current) => ({ ...current, interestTags, interestTagsPublic }))
          }
          onChangeBanner={(uri) => setProfile((current) => ({ ...current, bannerUri: uri }))}
          recaps={recaps}
          onChangeRecaps={setRecaps}
          onOpenPost={(id) => {
            goTo('channels');
            setPostId(id);
          }}
          homeArea={{ latitude: home.latitude, longitude: home.longitude }}
        />
      ) : null}

      {tab === 'profile' && profileView === 'drops' ? (
        <View style={styles.subPage}>
          <TouchableOpacity
            style={styles.subBack}
            onPress={() => setProfileView('main')}
            accessibilityRole="button"
            accessibilityLabel="Back to Profile"
            testID="my-drops-back"
          >
            <ChevronLeft size={20} color={c.text} strokeWidth={2.5} />
            <Text style={styles.subBackText}>PROFILE</Text>
          </TouchableOpacity>
          <MyDropsScreen
            drops={myDrops}
            onManage={(id) => {
              setJustDroppedId(null);
              setManagingId(id);
            }}
            onDropNew={() => {
              setDropPrefill(null);
              setDropOpen(true);
            }}
            onDropAgain={openDropAgain}
          />
        </View>
      ) : null}

      {tab === 'profile' && (profileView === 'alerts' || profileView === 'series' || profileView === 'insights') ? (
        <View style={styles.subPage}>
          <View style={styles.subHeaderRow}>
            <TouchableOpacity
              style={styles.subBack}
              onPress={() => setProfileView('main')}
              accessibilityRole="button"
              accessibilityLabel="Back to Profile"
              testID="profile-subpage-back"
            >
              <ChevronLeft size={20} color={c.text} strokeWidth={2.5} />
              <Text style={styles.subBackText}>PROFILE</Text>
            </TouchableOpacity>
            <Text style={styles.subTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {profileView === 'alerts'
                ? 'Notifications & Proximity Alerts'
                : profileView === 'insights'
                  ? 'Host Insights & Analytics'
                  : 'My Series'}
            </Text>
            {profileView === 'insights' ? (
              <View style={styles.proBadge}>
                <Text style={styles.proText}>PRO</Text>
              </View>
            ) : null}
          </View>
          {profileView === 'insights' ? (
            <HostInsightsScreen drops={myDrops} />
          ) : profileView === 'alerts' ? (
            <AlertsScreen
              interestTags={profile.interestTags ?? []}
              onOpenPoint={openHostPoint}
              onEditTags={() => {
                setProfileView('main');
                setProfileFocus({ key: Date.now(), section: 'tags' });
              }}
            />
          ) : (
            <CampaignsView
              drops={myDrops}
              onCreatePoints={createCampaignPoints}
              onAnnounce={announceCampaign}
              onOpenPoint={(id) => {
                setJustDroppedId(null);
                setManagingId(id);
              }}
              newRequest={newSeriesRequest}
              onNewHandled={clearNewSeriesRequest}
            />
          )}
        </View>
      ) : null}

      <DropPointModal
        visible={dropOpen}
        prefill={dropPrefill}
        myTags={myTags}
        recentPlaces={recentPlaces}
        onClose={closeDrop}
        onDropped={handleDropped}
      />

      <ManagePointSheet
        point={managing}
        justDropped={managing != null && managing.id === justDroppedId}
        onChange={updateDrop}
        onClose={closeManage}
        onDropAgain={openDropAgain}
      />

      {/* When sheet (Next 3 days, presets, Pick dates): opened by the dates chip on either tab. */}
      <MapFilterSheet
        visible={filtersOpen}
        title="When"
        showPostFilters={false}
        window={timeWindow}
        postFilter={postFilter}
        onClose={() => setFiltersOpen(false)}
        onPickDates={() => {
          setFiltersOpen(false);
          setDetailId(null);
          // From Discover, the Calendar's button comes back to Discover.
          if (tab === 'discover') setCalendarFromDiscover(true);
          setOverlay('calendar');
        }}
      />

      <BottomNavBar
        activeTab={tab}
        onDiscover={() => goTo('discover')}
        onMap={() => {
          goTo('map');
          setCardsReset((n) => n + 1); // full list → back to cards under the map
        }}
        onChannels={() => goTo('channels')}
        onProfile={() => goTo('profile')}
        // Unread alerts now sit on Profile (View alerts).
        badgeTab="profile"
        unreadCount={tab === 'profile' && profileView === 'alerts' ? 0 : unread}
        dropActive={dropOpen || createChooser}
        onDrop={() => setCreateChooser(true)}
      />

      <CreateChooserSheet
        visible={createChooser}
        onClose={() => setCreateChooser(false)}
        onSingle={() => {
          // Same as + Drop elsewhere: a fresh Point over whatever tab is open.
          setCreateChooser(false);
          setDetailId(null);
          setHostHandle(null);
          setManagingId(null);
          setDropPrefill(null);
          setDropOpen(true);
        }}
        onSeries={() => {
          // Profile → Manage My Series, with a new series open.
          setCreateChooser(false);
          goTo('profile');
          setProfileView('series');
          setNewSeriesRequest(Date.now());
        }}
      />

      {hostHandle ? (
        <HostProfileScreen
          key={hostHandle}
          handle={hostHandle}
          onBack={() => setHostHandle(null)}
          onOpenPoint={openHostPoint}
          // From their Contributions: the post in Channels (closes the profile).
          onOpenPost={(id) => {
            setHostHandle(null);
            goTo('channels');
            setPostId(id);
          }}
        />
      ) : null}

      {overlay === 'calendar' ? (
        <CalendarScreen
          onBack={() => {
            setOverlay(null);
            setCalendarFromDiscover(false);
          }}
          onShowOnMap={(range) => {
            setTimeWindow(range); // Discover, the map and the cards show these dates until reset
            setDetailId(null);
            setOverlay(null);
            if (calendarFromDiscover) setCalendarFromDiscover(false);
            else setTab('map');
          }}
        />
      ) : null}

      {overlay === 'settings' ? (
        <SettingsScreen
          // Remount when opened for a different section, so it opens that one.
          key={settingsSection ?? 'all'}
          profile={profile}
          settings={settings}
          initialSection={settingsSection}
          // Settings opens over the current tab (Profile or Discover), so closing it lands back there.
          onBack={() => setOverlay(null)}
          onViewProfile={() => {
            setOverlay(null);
            goTo('profile');
          }}
          onSaveProfile={setProfile}
          onChangeSettings={setSettings}
          onReplayTour={() => {
            setOverlay(null);
            startTour();
          }}
        />
      ) : null}

      <CityPickerSheet
        visible={cityPickerOpen}
        title="See Points in…"
        home={home}
        onPick={pickCity}
        onClose={() => setCityPickerOpen(false)}
      />

      {/* First-run tour, above everything else on this screen. */}
      <TourOverlay
        steps={MAP_TOUR}
        index={tourStep}
        onNext={() => (tourStep != null && tourStep < MAP_TOUR.length - 1 ? setTourStep(tourStep + 1) : endTour())}
        onBack={() => setTourStep((current) => (current != null && current > 0 ? current - 1 : current))}
        onSkip={endTour}
      />

      {/* Photo rules: the one-time agreement before a first upload, and the full rules page. */}
      <PhotoPolicyHost />
      {/* Circle cropper for profile pictures and cover photos. */}
      <CircleCropHost />
    </SafeAreaView>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.base,
  },
  mapAndCards: { flex: 1 },
  subPage: { flex: 1 },
  subBack: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, alignSelf: 'flex-start' },
  subBackText: { color: c.text, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
  subHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 16 },
  subTitle: { flex: 1, textAlign: 'right', color: c.text, fontSize: 16, fontWeight: '800' },
  proBadge: { marginLeft: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: '#f59e0b' },
  proText: { color: '#1f1300', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  datePillText: { color: c.text, fontSize: 12, fontWeight: '800', flexShrink: 1 },
  /* Explore Map top row */
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
    maxWidth: '48%',
    paddingHorizontal: 10,
    minHeight: 38,
    borderRadius: 19,
    backgroundColor: c.glassStrong,
    borderWidth: 1,
    borderColor: c.border,
  },
  dateChipOn: { borderColor: c.accent, borderWidth: 1.5 },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 32,
  },
  placeholderTitle: {
    color: c.text,
    fontSize: 17,
    fontWeight: '800',
  },
  placeholderBody: {
    color: c.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
});
