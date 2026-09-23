import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { NATIVE_MAP_STYLE } from '@/constants/mapStyle';
import { circlePolygon } from '@/src/geo/circle';
import type { MapCoordinate, MapTarget } from '@/src/types/map';

type ProximityMapProps = {
  user: MapCoordinate;
  radiusMeters: number;
  targets: MapTarget[];
};

function Pin({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.pin} pointerEvents="none">
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function ProximityMap({ user, radiusMeters, targets }: ProximityMapProps) {
  const fence = circlePolygon(user.lat, user.lon, radiusMeters);
  const focus = [user, ...targets];
  const center: [number, number] = [
    focus.reduce((sum, point) => sum + point.lon, 0) / focus.length,
    focus.reduce((sum, point) => sum + point.lat, 0) / focus.length,
  ];
  const zoom = targets.length > 1 ? 13.5 : targets.length === 1 ? 14.5 : 15;

  return (
    <Map mapStyle={NATIVE_MAP_STYLE} style={StyleSheet.absoluteFill} logo={false} compass={false}>
      <Camera
        initialViewState={{ center: [user.lon, user.lat], zoom: 15 }}
        center={center}
        zoom={zoom}
        duration={600}
      />
      <GeoJSONSource id="geofence" data={fence}>
        <Layer
          id="geofence-fill"
          type="fill"
          source="geofence"
          paint={{ 'fill-color': '#38bdf8', 'fill-opacity': 0.18 }}
        />
        <Layer
          id="geofence-line"
          type="line"
          source="geofence"
          paint={{ 'line-color': '#38bdf8', 'line-width': 1.5 }}
        />
      </GeoJSONSource>
      <Marker id="user" lngLat={[user.lon, user.lat]} anchor="center">
        <Pin color="#38bdf8" label="You" />
      </Marker>
      {targets.map((target) => (
        <Marker key={target.id} id={target.id} lngLat={[target.lon, target.lat]} anchor="center">
          <Pin color="#facc15" label={target.name} />
        </Marker>
      ))}
    </Map>
  );
}

const styles = StyleSheet.create({
  pin: {
    alignItems: 'center',
    width: 140,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  label: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
});
