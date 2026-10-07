import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import * as LeafletNamespace from 'leaflet';
import { DISCOVERY_PIN_CSS } from '../../lib/discoveryMapDocument';
import {
  DISCOVERY_MAP_ZOOM,
  FREE_DARK_LABEL_URL,
  FREE_DARK_TILE_URL,
  FREE_MAP_ATTRIBUTION,
  LEAFLET_CSS_URL,
  buildMarkerPayload,
  declutterScaleForZoom,
  escapeHtml,
} from '../../lib/freeBasemap';
import { NAV_HEIGHT, opticalCenter } from '../../lib/mapViewport';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { DiscoveryMapChrome } from './DiscoveryMapChrome';

const LeafletModule = LeafletNamespace as typeof LeafletNamespace & {
  default?: typeof LeafletNamespace;
};
const L = LeafletModule.default?.map ? LeafletModule.default : LeafletModule;

function ensureMapCss() {
  if (typeof document === 'undefined') return;
  if (!document.querySelector('link[data-proxipoint-leaflet]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS_URL;
    link.dataset.proxipointLeaflet = '1';
    document.head.appendChild(link);
  }
  if (document.getElementById('proxipoint-pin-css')) return;
  const style = document.createElement('style');
  style.id = 'proxipoint-pin-css';
  style.textContent = DISCOVERY_PIN_CSS;
  document.head.appendChild(style);
}

function hostElement(node: View | null): HTMLElement | null {
  if (!node) return null;
  const candidate = node as unknown as HTMLElement;
  return typeof candidate.clientWidth === 'number' ? candidate : null;
}

function centerForOptical(
  map: L.Map,
  latlng: L.LatLngExpression,
  zoom: number,
  opticalY: number,
  height: number,
): L.LatLng {
  const projected = map.project(latlng, zoom);
  const dy = height / 2 - opticalY;
  return map.unproject(projected.add([0, dy]), zoom);
}

export const DiscoveryLeafletMap: React.FC = () => {
  const nodes = useDiscoveryStore((state) => state.nodes);
  const selectedNodeId = useDiscoveryStore((state) => state.selectedNodeId);
  const selfCoordinates = useDiscoveryStore((state) => state.selfCoordinates);
  const focusToken = useDiscoveryStore((state) => state.focusToken);
  const drawerHeight = useDiscoveryStore((state) => state.drawerHeight);
  const headerHeight = useDiscoveryStore((state) => state.headerHeight);
  const drawerDragging = useDiscoveryStore((state) => state.drawerDragging);
  const selectNodeFromPin = useDiscoveryStore((state) => state.selectNodeFromPin);
  const setViewportBounds = useDiscoveryStore((state) => state.setViewportBounds);

  const hostRef = useRef<View>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const opticalRef = useRef<number | null>(null);
  const selectRef = useRef(selectNodeFromPin);
  selectRef.current = selectNodeFromPin;
  const bootRef = useRef<() => void>(() => {});
  const bootingRef = useRef(false);
  const aliveRef = useRef(true);
  const [zoom, setZoom] = useState(DISCOVERY_MAP_ZOOM);
  const [ready, setReady] = useState(false);

  const publishBounds = (map: L.Map) => {
    const bounds = map.getBounds();
    setViewportBounds({
      minX: 0,
      maxX: 1400,
      minY: 0,
      maxY: 1400,
      south: bounds.getSouth(),
      north: bounds.getNorth(),
      west: bounds.getWest(),
      east: bounds.getEast(),
    });
    setZoom(map.getZoom());
  };

  const drawMarkers = (map: L.Map) => {
    const markerLayer = markerLayerRef.current;
    const userLayer = userLayerRef.current;
    if (!markerLayer || !userLayer) return;
    markerLayer.clearLayers();
    userLayer.clearLayers();

    const state = useDiscoveryStore.getState();
    const markers = buildMarkerPayload(
      Object.values(state.nodes),
      state.selfCoordinates,
      map.getZoom(),
      state.selectedNodeId,
    );

    markers.forEach((pin) => {
      const icon = L.divIcon({
        className: 'pp-pin',
        html: `<div class="pp-head${pin.selected ? ' pp-selected' : ''}"></div><div class="pp-tip-dot${pin.selected ? ' pp-selected' : ''}"></div>`,
        iconSize: [22, 28],
        iconAnchor: [11, 26],
      });
      const marker = L.marker([pin.latitude, pin.longitude], {
        icon,
        zIndexOffset: pin.selected ? 800 : 0,
        title: pin.title,
      });
      marker.bindTooltip(escapeHtml(pin.label), {
        permanent: true,
        direction: pin.labelAnchor,
        className: pin.selected ? 'pp-tip pp-tip-selected' : 'pp-tip',
        offset: [0, -4],
      });
      marker.on('click', (event: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(event.originalEvent);
        selectRef.current(pin.id);
      });
      marker.addTo(markerLayer);

      if (pin.selected) {
        L.circle([pin.trueLatitude, pin.trueLongitude], {
          radius: 120,
          color: '#22d3ee',
          weight: 1.5,
          dashArray: '4 6',
          fillColor: '#22d3ee',
          fillOpacity: 0.08,
        }).addTo(markerLayer);
      }
    });

    L.circleMarker([state.selfCoordinates.latitude, state.selfCoordinates.longitude], {
      radius: 7,
      color: '#ffffff',
      weight: 2,
      fillColor: '#38bdf8',
      fillOpacity: 1,
    }).addTo(userLayer);
  };

  const drawRef = useRef(drawMarkers);
  drawRef.current = drawMarkers;
  const publishRef = useRef(publishBounds);
  publishRef.current = publishBounds;

  const flyToPoint = (latitude: number, longitude: number, zoomLevel: number) => {
    const map = mapRef.current;
    if (!map) return;
    const size = map.getSize();
    const opticalY = opticalRef.current ?? size.y / 2;
    const center = centerForOptical(map, [latitude, longitude], zoomLevel, opticalY, size.y);
    map.flyTo(center, zoomLevel, { duration: 0.55 });
  };

  bootRef.current = () => {
    if (!aliveRef.current || mapRef.current || bootingRef.current) return;
    const host = hostElement(hostRef.current);
    if (!host || host.clientWidth === 0 || host.clientHeight === 0) return;
    ensureMapCss();
    bootingRef.current = true;

    const state = useDiscoveryStore.getState();
    const map = L.map(host, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 20,
    });
    L.tileLayer(FREE_DARK_TILE_URL, {
      attribution: FREE_MAP_ATTRIBUTION,
      maxZoom: 20,
    }).addTo(map);
    L.tileLayer(FREE_DARK_LABEL_URL, { maxZoom: 20, attribution: '' }).addTo(map);

    const size = map.getSize();
    const opticalY = opticalCenter({
      canvasWidth: size.x,
      canvasHeight: size.y,
      headerHeight: state.headerHeight,
      drawerHeight: state.drawerHeight,
      navHeight: NAV_HEIGHT,
    }).y;
    opticalRef.current = opticalY;
    map.setView(
      centerForOptical(
        map,
        [state.selfCoordinates.latitude, state.selfCoordinates.longitude],
        DISCOVERY_MAP_ZOOM,
        opticalY,
        size.y,
      ),
      DISCOVERY_MAP_ZOOM,
    );
    markerLayerRef.current = L.layerGroup().addTo(map);
    userLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    drawRef.current(map);
    publishRef.current(map);
    map.on('moveend', () => {
      if (!mapRef.current) return;
      publishRef.current(map);
    });
    map.on('zoomend', () => {
      if (!mapRef.current) return;
      drawRef.current(map);
      publishRef.current(map);
    });
    setReady(true);
  };

  useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    const tick = () => {
      if (cancelled || mapRef.current) return;
      bootRef.current();
      if (!mapRef.current && attempts < 40) {
        attempts += 1;
        frame = requestAnimationFrame(tick);
      }
    };
    tick();
    return () => {
      cancelled = true;
      aliveRef.current = false;
      bootingRef.current = false;
      cancelAnimationFrame(frame);
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      userLayerRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    drawMarkers(map);
  }, [nodes, selectedNodeId, selfCoordinates, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || focusToken === 0) return;
    const state = useDiscoveryStore.getState();
    const node = state.selectedNodeId ? state.nodes[state.selectedNodeId] : undefined;
    if (!node) return;
    flyToPoint(node.latitude, node.longitude, Math.max(map.getZoom(), 16));
  }, [focusToken, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (drawerDragging) map.dragging.disable();
    else map.dragging.enable();
  }, [drawerDragging, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const host = hostElement(hostRef.current);
    if (!map || !host || !ready) return;
    const size = map.getSize();
    const next = opticalCenter({
      canvasWidth: size.x || host.clientWidth,
      canvasHeight: size.y || host.clientHeight,
      headerHeight,
      drawerHeight,
      navHeight: NAV_HEIGHT,
    }).y;
    const previous = opticalRef.current;
    opticalRef.current = next;
    const attribution = host.querySelector('.leaflet-bottom') as HTMLElement | null;
    if (attribution) attribution.style.bottom = `${drawerHeight + NAV_HEIGHT + 6}px`;
    if (previous == null || Math.abs(next - previous) < 0.5) return;
    map.panBy([0, -(next - previous)], { animate: false });
  }, [drawerHeight, headerHeight, ready]);

  const handleRecenter = () => {
    const state = useDiscoveryStore.getState();
    flyToPoint(state.selfCoordinates.latitude, state.selfCoordinates.longitude, DISCOVERY_MAP_ZOOM);
  };

  const wide = declutterScaleForZoom(zoom) < 1.45;

  return (
    <View style={styles.frame} pointerEvents="box-none">
      <View
        ref={hostRef}
        style={styles.map}
        onLayout={() => {
          const map = mapRef.current;
          if (map) {
            map.invalidateSize();
            return;
          }
          bootRef.current();
        }}
      />
      <DiscoveryMapChrome zoomText={`${wide ? 'WIDE' : 'CLOSE'} · z${Math.round(zoom)}`} onRecenter={handleRecenter} />
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b1220',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b1220',
  },
});
