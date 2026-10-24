import React, { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, Landmark, MapPin, Mountain, Search, Signpost, Store, Trees, X, type LucideIcon } from 'lucide-react-native';
import { useVisiblePosts } from '../../lib/channels';
import { formatDistance } from '../../lib/discoverFeed';
import { calculateDistanceMeters } from '../../lib/locationFilter';
import {
  PLACE_KIND_LABEL,
  SAMPLE_PLACES,
  blockPlace,
  buildPlaceIndex,
  placesNear,
  searchLocalPlaces,
  type LocalPlace,
  type PlaceKind,
} from '../../lib/localPlaces';
import { snapToBlock, type LatLon } from '../../lib/postRanking';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

export const PLACE_ICON: Record<PlaceKind, LucideIcon> = {
  venue: Store,
  park: Trees,
  trail: Mountain,
  intersection: Signpost,
  building: Building2,
  plaza: Landmark,
  block: MapPin,
};

/**
 * Every place the app knows right now: sample places, Point venues, and places that only exist
 * on posts. Server side later: GET /places?lat&lon&q.
 */
export function usePlaceIndex(): LocalPlace[] {
  const nodes = useDiscoveryStore((state) => state.nodes) as unknown as Record<string, unknown>;
  const posts = useVisiblePosts();
  return useMemo(
    () => buildPlaceIndex(SAMPLE_PLACES, nodes as Parameters<typeof buildPlaceIndex>[1], posts),
    [nodes, posts],
  );
}

/** "Park · 350m" */
export function placeMeta(place: LocalPlace, from?: LatLon | null): string {
  const meters = from ? calculateDistanceMeters(from.latitude, from.longitude, place.latitude, place.longitude) : null;
  return [PLACE_KIND_LABEL[place.kind], meters != null ? formatDistance(meters) : null].filter(Boolean).join(' · ');
}

/**
 * Pick what a post is about: search parks, venues, trails, intersections and buildings, or use
 * the block you're on (about 100 m; never your exact spot).
 */
export const PlacePicker: React.FC<{
  visible: boolean;
  places: LocalPlace[];
  myLocation: LatLon;
  onPick: (place: LocalPlace) => void;
  onClose: () => void;
}> = ({ visible, places, myLocation, onPick, onClose }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const block = blockPlace(places, snapToBlock(myLocation));
  const list = query.trim().length >= 2 ? searchLocalPlaces(places, query, myLocation, 15) : placesNear(places, myLocation, 12);

  const pick = (place: LocalPlace) => {
    setQuery('');
    onPick(place);
  };
  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]} testID="place-picker">
        <View style={styles.header}>
          <Text style={styles.title}>What’s it about?</Text>
          <TouchableOpacity onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <X size={22} color={c.text} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
        <View style={styles.searchBox}>
          <Search size={16} color={c.textMuted} strokeWidth={2.25} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search parks, venues, trails, streets"
            placeholderTextColor={c.textFaint}
            autoCorrect={false}
            autoFocus
            accessibilityLabel="Search places"
            testID="place-picker-search"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <X size={15} color={c.textMuted} strokeWidth={2.5} />
            </TouchableOpacity>
          ) : null}
        </View>

        <FlatList
          data={list}
          keyExtractor={(place) => place.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <>
              <TouchableOpacity style={styles.row} onPress={() => pick(block)} accessibilityRole="button" testID="place-picker-block">
                <View style={[styles.icon, styles.iconBlock]}>
                  <MapPin size={16} color={c.violet} strokeWidth={2.25} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.name}>Your block</Text>
                  <Text style={styles.meta}>{block.name} · shows the block, never your exact spot</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.label}>{query.trim().length >= 2 ? 'PLACES' : 'NEARBY'}</Text>
            </>
          }
          ListEmptyComponent={<Text style={styles.empty}>No places match “{query.trim()}”.</Text>}
          renderItem={({ item }) => {
            const Icon = PLACE_ICON[item.kind];
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => pick(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${placeMeta(item, myLocation)}`}
                testID={`place-option-${item.id}`}
              >
                <View style={styles.icon}>
                  <Icon size={16} color={c.accent} strokeWidth={2.25} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.meta}>{placeMeta(item, myLocation)}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.base },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    title: { color: c.text, fontSize: 18, fontWeight: '800' },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    searchInput: { flex: 1, color: c.text, fontSize: 15, paddingVertical: 11 },
    label: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 14, marginBottom: 4, marginHorizontal: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accentTint,
    },
    iconBlock: { backgroundColor: c.violetTint },
    copy: { flex: 1, gap: 2 },
    name: { color: c.text, fontSize: 15, fontWeight: '700' },
    meta: { color: c.textMuted, fontSize: 12 },
    empty: { color: c.textFaint, fontSize: 13, marginHorizontal: 16, marginTop: 8 },
  });
