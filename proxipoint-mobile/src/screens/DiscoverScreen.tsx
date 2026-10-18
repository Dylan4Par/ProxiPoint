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
import { useDiscoveryStore } from '../stores/useDiscoveryStore';
import { ProfileScreen } from './ProfileScreen';
import { SettingsScreen } from './SettingsScreen';
import { HostProfileScreen } from './HostProfileScreen';
import { ActivityScreen } from './ActivityScreen';
import { CalendarScreen } from './CalendarScreen';
import { setTimeWindow, useTimeWindow } from '../lib/timeWindow';
import { formatRange } from '../lib/calendarRange';
import { CalendarDays, X } from 'lucide-react-native';
import { CityPill, CityPickerSheet, type PickKind } from '../components/discovery/CityPicker';
import { cityAt, cityLabel, currentPosition, watchPosition, type CityPlace } from '../lib/places';
import { checkTagAlerts, unreadCount as activityUnread, useActivity } from '../lib/activity';
import { useBoosts } from '../lib/boost';
import { useModeration } from '../lib/moderation';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, type MyProfile, type MySettings } from '../lib/myProfile';
import type { PointRecap } from '../lib/pointRecap';
import type { DroppedPoint } from '../lib/droppedPoint';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme/ThemeContext';

type ScreenTab = Exclude<NavTab, 'drop'>;

export const DiscoverScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { mode, colors: c } = useTheme();
  // Live duplex telemetry socket hook
  useProximitySocket();
  const [tab, setTab] = useState<ScreenTab>('discover');
  const [dropOpen, setDropOpen] = useState(false);
  // Kept in memory for now; load from the backend (e.g. GET /me/points) once that exists.
  const [myDrops, setMyDrops] = useState<DroppedPoint[]>([]);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  // Set by "Drop again" so the Drop Point sheet opens filled in.
  const [dropPrefill, setDropPrefill] = useState<DroppedPoint | null>(null);
  // Profile and Settings open full-screen over everything (including the nav bar).
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
  const discoverNodes = useDiscoveryStore((state) => state.nodes);
  const toggleRsvp = useDiscoveryStore((state) => state.toggleRsvp);
  const setSelectedNodeId = useDiscoveryStore((state) => state.setSelectedNodeId);
  const syncMyPoint = useDiscoveryStore((state) => state.syncMyPoint);
  const viewPlace = useDiscoveryStore((state) => state.viewPlace);
  const setViewPlace = useDiscoveryStore((state) => state.setViewPlace);
  const setSelfCoordinates = useDiscoveryStore((state) => state.setSelfCoordinates);
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

  // From a host profile: show that Point on the map with its details open.
  const openHostPoint = (id: string) => {
    setHostHandle(null);
    setTab('discover');
    setSelectedNodeId(id);
    setDetailId(id);
  };
  const [overlay, setOverlay] = useState<'profile' | 'settings' | 'calendar' | null>(null);
  const [settingsSection, setSettingsSection] = useState<'edit' | null>(null);
  // In memory for now; load and save through the backend (GET/PATCH /me) once sign-in exists.
  const [profile, setProfile] = useState<MyProfile>(DEFAULT_PROFILE);

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
  const [settings, setSettings] = useState<MySettings>(DEFAULT_SETTINGS);
  // Point recaps posted from the Profile page (in memory until the backend has them).
  const [recaps, setRecaps] = useState<PointRecap[]>([]);

  // Activity alerts: whenever Discover's Points, boosts or your #tags change, look for new matches.
  const boostClock = useBoosts();
  const moderationVersion = useModeration();
  useEffect(() => {
    checkTagAlerts(discoverNodes as never, profile.interestTags ?? []);
  }, [discoverNodes, boostClock, moderationVersion, profile.interestTags]);
  useActivity(); // re-render for the unread badge
  const unread = activityUnread();

  // Android back button: Settings → Profile → closed.
  useEffect(() => {
    if (!overlay) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOverlay((current) => (current === 'settings' ? 'profile' : null)); // calendar/profile → closed
      return true;
    });
    return () => sub.remove();
  }, [overlay]);

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
    setTab(next);
  };

  const handleDropped = (point: DroppedPoint) => {
    setMyDrops((current) => [point, ...current.filter((drop) => drop.id !== point.id)]);
    // Give the new pin its full details (times, all #tags) so the calendar and alerts see it.
    syncMyPoint(point);
    setDropOpen(false);
    setDropPrefill(null);
    setTab('drops');
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
        <>
          <TopFilterHeader
            onOpenProfile={() => {
              setDetailId(null);
              setOverlay('profile');
            }}
            profileInitial={profile.displayName.trim().charAt(0).toUpperCase()}
            profilePhotoUri={profile.avatarUri}
            liveOnly={liveOnly}
            onToggleLiveOnly={() => setLiveOnly((on) => !on)}
            onOpenCalendar={() => {
              setDetailId(null);
              setOverlay('calendar');
            }}
          />
          {/* Map + cards share this area; the cards can grow to cover all of it (full list). */}
          <View style={styles.mapAndCards} onLayout={(event) => setCardsArea(event.nativeEvent.layout.height)}>
            <DiscoveryMapCanvas
              liveOnly={liveOnly}
              // Touching the map closes the detail sheet (the Point stays selected).
              onMapTouch={() => setDetailId(null)}
              coveredFromY={detailId ? detailTopY : null}
              // Picked from a cluster's list (several Points at one spot): show its details.
              onOpenPoint={setDetailId}
            />
            {/* Which city Discover is showing; tap to look somewhere else. (Hidden under the full list.) */}
            {cardsFull ? null : (
            <CityPill
              label={viewPlace.name ? cityLabel(viewPlace) : cityLabel(home)}
              exploring={viewPlace.kind === 'search'}
              tracking={Boolean(profile.trackLocation)}
              onPress={() => setCityPickerOpen(true)}
              onReturn={returnHome}
            />
            )}
            {/* Calendar dates on the map: chip to go back to the next 3 days. */}
            {timeWindow.custom && !cardsFull ? (
              <View style={styles.datePillRow} pointerEvents="box-none">
                <TouchableOpacity
                  style={styles.datePill}
                  onPress={() => setOverlay('calendar')}
                  accessibilityRole="button"
                  accessibilityLabel="Showing Calendar dates. Change dates"
                  testID="discover-date-window"
                >
                  <CalendarDays size={13} color={c.accent} strokeWidth={2.5} />
                  <Text style={styles.datePillText}>
                    {formatRange({ start: new Date(timeWindow.start), end: new Date(timeWindow.end) })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.datePillClose}
                  onPress={() => setTimeWindow(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Back to the next 3 days"
                  testID="discover-date-window-reset"
                >
                  <X size={13} color={c.text} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            ) : null}
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

      {tab === 'activity' ? (
        <ActivityScreen
          interestTags={profile.interestTags ?? []}
          onOpenPoint={openHostPoint}
          onEditTags={() => {
            setDetailId(null);
            setOverlay('profile');
          }}
          onToggleRsvp={(id) => toggleRsvp(id)}
          onOpenTag={(tag) => {
            // Make sure the chip exists in the header, then filter Discover by it.
            addTag(tag);
            const known = useDiscoveryStore.getState().tags.find(
              (t: string) => t.replace(/^#+/, '').toLowerCase() === tag.replace(/^#+/, '').toLowerCase(),
            );
            setSelectedTag(known ?? tag);
            setLiveOnly(false);
            goTo('discover');
          }}
        />
      ) : null}

      {tab === 'drops' ? (
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
        activeTab={dropOpen ? 'drop' : tab}
        onDiscover={() => {
          goTo('discover');
          setCardsReset((n) => n + 1); // full list → back to cards under the map
        }}
        onActivity={() => goTo('activity')}
        onDropPoint={() => {
          setDetailId(null);
          setHostHandle(null);
          // The nav button always starts a fresh Point.
          setManagingId(null);
          setDropPrefill(null);
          setDropOpen((open) => !open);
        }}
        onMyDrops={() => goTo('drops')}
        unreadCount={tab === 'activity' ? 0 : unread}
      />

      {hostHandle ? (
        <HostProfileScreen
          key={hostHandle}
          handle={hostHandle}
          onBack={() => setHostHandle(null)}
          onOpenPoint={openHostPoint}
        />
      ) : null}

      {overlay === 'profile' ? (
        <ProfileScreen
          profile={profile}
          drops={myDrops}
          onBack={() => setOverlay(null)}
          onOpenSettings={() => openSettings()}
          onOpenMyDrops={() => goTo('drops')}
          onOpenActivity={() => goTo('activity')}
          onDropPoint={() => {
            setOverlay(null);
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
          onChangeInterestTags={(interestTags, interestTagsPublic) =>
            // Server side: PUT /me/interest-tags
            setProfile((current) => ({ ...current, interestTags, interestTagsPublic }))
          }
          onChangeBanner={(uri) => setProfile((current) => ({ ...current, bannerUri: uri }))}
          recaps={recaps}
          onChangeRecaps={setRecaps}
        />
      ) : null}

      {overlay === 'calendar' ? (
        <CalendarScreen
          onBack={() => setOverlay(null)}
          onShowOnMap={(range) => {
            setTimeWindow(range); // the map + cards show these dates until reset
            setDetailId(null);
            setOverlay(null);
            setTab('discover');
          }}
          onOpenPoint={(id) => {
            setOverlay(null);
            openHostPoint(id); // select it on the map and open its details
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
          onBack={() => setOverlay('profile')}
          onViewProfile={() => setOverlay('profile')}
          onSaveProfile={setProfile}
          onChangeSettings={setSettings}
        />
      ) : null}

      <CityPickerSheet
        visible={cityPickerOpen}
        title="See Points in…"
        home={home}
        onPick={pickCity}
        onClose={() => setCityPickerOpen(false)}
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
  datePillRow: { position: 'absolute', top: 60, left: 14, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 15 },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: c.glassStrong,
    borderWidth: 1.5,
    borderColor: c.accent,
  },
  datePillText: { color: c.text, fontSize: 12, fontWeight: '800' },
  datePillClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.glassStrong,
    borderWidth: 1,
    borderColor: c.border,
  },
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
