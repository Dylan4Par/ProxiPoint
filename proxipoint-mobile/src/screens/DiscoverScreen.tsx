import React, { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProximitySocket } from '../hooks/useProximitySocket';
import { DiscoveryMapCanvas } from '../components/discovery/DiscoveryMapCanvas';
import { TopFilterHeader } from '../components/discovery/TopFilterHeader';
import { EventCardList } from '../components/discovery/EventCardList';
import { BottomNavBar, type NavTab } from '../components/discovery/BottomNavBar';
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
import { CalendarScreen } from './CalendarScreen';
import { DiscoverFeedScreen } from './DiscoverFeedScreen';
import { ChannelsScreen, type ChannelsSegment } from './ChannelsScreen';
import { setTimeWindow, timeWindowLabel, useTimeWindow } from '../lib/timeWindow';
import { useMapPostFilter } from '../lib/mapFilters';
import { areaName } from '../lib/mapArea';
import { interestCell, setMyInterestMembership } from '../lib/nearbyInterest';
import { MapFilterSheet } from '../components/discovery/MapFilterSheet';
import { formatRange } from '../lib/calendarRange';
import { CalendarDays, ChevronDown, ChevronLeft, Plus } from 'lucide-react-native';
import { CityPill, CityPickerSheet, type PickKind } from '../components/discovery/CityPicker';
import { CITY_LIST, cityAt, cityLabel, currentPosition, watchPosition, type CityPlace } from '../lib/places';
import { checkTagAlerts, unreadCount as activityUnread, useActivity } from '../lib/activity';
import { addPost, getChannel, getChannels, getPost, syncAutoChannels } from '../lib/channels';
import { formatPointWhen, publicWhere } from '../lib/droppedPoint';
import { planAutoChannels } from '../lib/autoChannels';
import { useBoosts } from '../lib/boost';
import { useModeration } from '../lib/moderation';
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
  const [profileView, setProfileView] = useState<'main' | 'drops'>('main');
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
    return {
      ...DEFAULT_PROFILE,
      ...(seed?.profile ?? {}),
      ...(account?.displayName ? { displayName: account.displayName } : {}),
      ...(account?.handle ? { handle: `@${account.handle}` } : {}),
    };
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
  // Nearby interest numbers: count you in (your home area's ~1 km cell, never GPS) only when you've
  // opted in and follow some #tags.
  const interestTagsKey = (profile.interestTags ?? []).join(',');
  useEffect(() => {
    const tags = profile.interestTags ?? [];
    setMyInterestMembership(
      profile.countMeInInterests && tags.length ? { ...interestCell(home.latitude, home.longitude), tags } : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.countMeInInterests, interestTagsKey, home.latitude, home.longitude]);
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

  // Android back on My Drops returns to the Profile it was opened from.
  useEffect(() => {
    if (tab !== 'profile' || profileView !== 'drops') return;
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

  const updateDrop = (point: DroppedPoint) => {
    setMyDrops((current) => current.map((drop) => (drop.id === point.id ? point : drop)));
    // Keep the map pin and Discover card in step (tags, title, place, time; ending removes it).
    syncMyPoint(point);
  };

  const closeManage = () => {
    setManagingId(null);
    setJustDroppedId(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar
        barStyle={mode === 'light' ? 'dark-content' : 'light-content'}
        translucent
        backgroundColor="transparent"
      />

      {tab === 'discover' ? (
        <DiscoverFeedScreen
          interestTags={profile.interestTags ?? []}
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
            // Top row: + Event · city · dates (Next 3 days by default; ⌄ opens When → Calendar).
            topRow={
              <>
                <TouchableOpacity
                  ref={tourTarget('create-event')}
                  style={styles.createEventBtn}
                  onPress={() => {
                    setDetailId(null);
                    setHostHandle(null);
                    // Always starts a fresh Point.
                    setManagingId(null);
                    setDropPrefill(null);
                    setDropOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Create event"
                  testID="map-drop-point"
                >
                  <Plus size={16} color={c.onAccent} strokeWidth={3} />
                  <Text style={styles.createEventText} numberOfLines={1}>
                    Event
                  </Text>
                </TouchableOpacity>
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
            }
          />
          {/* Map + cards share this area; the cards can grow to cover all of it (full list). */}
          <View
            ref={tourTarget('map-area')}
            collapsable={false}
            style={styles.mapAndCards}
            onLayout={(event) => setCardsArea(event.nativeEvent.layout.height)}>
            <DiscoveryMapCanvas
              liveOnly={liveOnly}
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
                setOverlay('calendar');
              }}
            />
            <EventCardList
              liveOnly={liveOnly}
              // Cards always open the Point's details (even if it's inside a map bubble).
              onOpenDetails={setDetailId}
              fullHeight={cardsArea}
              resetSignal={cardsReset}
              onFullChange={setCardsFull}
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
          interestTags={profile.interestTags ?? []}
          onOpenPoint={openHostPoint}
          onToggleRsvp={(id) => toggleRsvp(id)}
          onEditTags={() => goTo('profile')}
          onOpenTag={showTagOnMap}
        />
      ) : null}

      {tab === 'profile' && profileView === 'main' ? (
        <ProfileScreen
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
          onOpenActivity={() => {
            goTo('channels');
            setChannelsSegment('alerts');
          }}
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
          // Server side: PATCH /me { countInInterests }
          onChangeCountMeIn={(countMeInInterests) => setProfile((current) => ({ ...current, countMeInInterests }))}
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

      <DropPointModal
        visible={dropOpen}
        prefill={dropPrefill}
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

      <BottomNavBar
        activeTab={tab}
        onDiscover={() => goTo('discover')}
        onMap={() => {
          goTo('map');
          setCardsReset((n) => n + 1); // full list → back to cards under the map
        }}
        onChannels={() => goTo('channels')}
        onProfile={() => goTo('profile')}
        unreadCount={tab === 'channels' && channelsSegment === 'alerts' ? 0 : unread}
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
          // Settings opens over the Profile tab, so closing it lands back there.
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
  datePillText: { color: c.text, fontSize: 12, fontWeight: '800', flexShrink: 1 },
  /* Explore Map top row */
  createEventBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.accent,
  },
  createEventText: { color: c.onAccent, fontSize: 13, fontWeight: '800' },
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
