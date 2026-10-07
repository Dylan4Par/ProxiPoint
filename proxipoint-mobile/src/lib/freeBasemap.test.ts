import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DISCOVERY_MAP_ZOOM,
  FREE_DARK_LABEL_URL,
  FREE_DARK_TILE_URL,
  FREE_MAP_ATTRIBUTION,
  buildMarkerPayload,
  circlePolygon,
  declutterScaleForZoom,
  fanPins,
  localPixel,
  metersPerPixel,
  offsetGeographicPoint,
  scriptJson,
} from './freeBasemap';
import { nodeInsideViewport } from '../stores/useDiscoveryStore';
import type { DiscoveryNode } from '../stores/useDiscoveryStore';

test('the basemap is a keyless Esri dark canvas with street labels', () => {
  assert.match(FREE_DARK_TILE_URL, /World_Dark_Gray_Base\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}$/);
  assert.match(FREE_DARK_LABEL_URL, /World_Dark_Gray_Reference\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}$/);
  assert.equal(FREE_DARK_TILE_URL.includes('api_key'), false);
  assert.equal(FREE_DARK_TILE_URL.includes('token'), false);
  assert.match(FREE_MAP_ATTRIBUTION, /Esri/);
  assert.match(FREE_MAP_ATTRIBUTION, /OpenStreetMap/);
  assert.equal(DISCOVERY_MAP_ZOOM, 15);
});

test('a south-east pixel nudge moves the coordinate south and east', () => {
  const moved = offsetGeographicPoint({ latitude: 40.015, longitude: -105.28 }, 40, 20, 15);
  assert.ok(moved.latitude < 40.015);
  assert.ok(moved.longitude > -105.28);
  const px = localPixel(moved, { latitude: 40.015, longitude: -105.28 }, 15);
  assert.ok(Math.abs(px.x - 40) < 2);
  assert.ok(Math.abs(px.y - 20) < 2);
});

test('meters per pixel shrink as the map zooms in', () => {
  assert.ok(metersPerPixel(40, 16) < metersPerPixel(40, 14));
});

test('declutter eases off once the street zoom is close', () => {
  assert.ok(declutterScaleForZoom(14) < 1);
  assert.ok(declutterScaleForZoom(16) >= 1.45);
});

test('identical downtown coordinates fan into separate pins', () => {
  const origin = { latitude: 40.0149, longitude: -105.2778 };
  const shared = { latitude: 40.0176, longitude: -105.2793 };
  const fanned = fanPins(
    [
      { id: 'downtown-1', ...shared },
      { id: 'downtown-2', ...shared },
      { id: 'downtown-3', ...shared },
    ],
    origin,
    DISCOVERY_MAP_ZOOM,
  );
  const pixels = fanned.map((pin) => localPixel(pin, origin, DISCOVERY_MAP_ZOOM));
  const spread = Math.hypot(pixels[0].x - pixels[1].x, pixels[0].y - pixels[1].y);
  assert.ok(spread > 10);
  const markers = buildMarkerPayload(
    [
      { id: 'downtown-1', title: 'Acoustic', tag: '#LiveMusic', ...shared },
      { id: 'downtown-2', title: 'Market', tag: '#Food', ...shared },
    ],
    origin,
    17,
    'downtown-1',
  );
  assert.equal(markers[0].selected, true);
  assert.equal(markers[0].label, 'LiveMusic');
  assert.notEqual(markers[0].latitude, markers[1].latitude);
  assert.equal(scriptJson({ title: '</script>' }).includes('<'), false);
});

test('a 120 meter ring sits around the coordinate and closes', () => {
  const ring = circlePolygon({ latitude: 40.0176, longitude: -105.2793 }, 120);
  assert.equal(ring[0].latitude, ring[ring.length - 1].latitude);
  assert.ok(ring[16].latitude > 40.0176);
  assert.ok(ring[0].longitude > -105.2793);
});

test('geographic viewport bounds keep a pin and drop one outside the frame', () => {
  const inside = { latitude: 40.0176, longitude: -105.2793 } as DiscoveryNode;
  const outside = { latitude: 39.7, longitude: -105.2793 } as DiscoveryNode;
  const bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1, south: 40.0, north: 40.03, west: -105.3, east: -105.26 };
  assert.equal(nodeInsideViewport(inside, bounds), true);
  assert.equal(nodeInsideViewport(outside, bounds), false);
});
