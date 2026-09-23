import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { DARK_RASTER_STYLE } from '@/constants/mapStyle';
import { circlePolygon } from '@/src/geo/circle';
import type { MapCoordinate, MapTarget } from '@/src/types/map';

type ProximityMapProps = {
  user: MapCoordinate;
  radiusMeters: number;
  target: MapTarget | null;
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

export default function ProximityMap({ user, radiusMeters, target }: ProximityMapProps) {
  const fence = circlePolygon(user.lat, user.lon, radiusMeters);
  const center: [number, number] = target
    ? [(user.lon + target.lon) / 2, (user.lat + target.lat) / 2]
    : [user.lon, user.lat];

  return (
    <Map mapStyle={DARK_RASTER_STYLE} style={StyleSheet.absoluteFill} logo={false} compass={false}>
      <Camera
        initialViewState={{ center: [user.lon, user.lat], zoom: 15 }}
        center={center}
        zoom={target ? 14.5 : 15}
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
      {target ? (
        <Marker id="target" lngLat={[target.lon, target.lat]} anchor="center">
          <Pin color="#facc15" label={target.name} />
        </Marker>
      ) : null}
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
