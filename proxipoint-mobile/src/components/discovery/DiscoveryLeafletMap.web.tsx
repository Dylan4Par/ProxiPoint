import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { DISCOVERY_PIN_CSS } from '../../lib/discoveryMapDocument';
import {
  DISCOVERY_MAP_ZOOM,
  FREE_DARK_STYLE_URL,
  MAPLIBRE_CSS_URL,
  MAPLIBRE_JS_URL,
  buildMarkerPayload,
  circlePolygon,
  declutterScaleForZoom,
} from '../../lib/freeBasemap';
import { NAV_HEIGHT } from '../../lib/mapViewport';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { DiscoveryMapChrome } from './DiscoveryMapChrome';

interface Padding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface GeoBounds {
  getSouth(): number;
  getNorth(): number;
  getWest(): number;
  getEast(): number;
}

interface GeoSource {
  setData(data: unknown): void;
}

interface StreetMap {
  remove(): void;
  resize(): void;
  getZoom(): number;
  getBounds(): GeoBounds | null;
  getContainer(): HTMLElement;
  flyTo(options: { center: [number, number]; zoom: number; duration: number }): void;
  jumpTo(options: { center: [number, number]; zoom: number; padding: Padding }): void;
  easeTo(options: { padding: Padding; duration: number }): void;
  dragPan: { enable(): void; disable(): void };
  on(type: string, handler: () => void): void;
  getSource(id: string): GeoSource | undefined;
  addSource(id: string, source: unknown): void;
  addLayer(layer: unknown): void;
}

interface MapLibreMarker {
  remove(): void;
}

interface MapLibreGL {
  Map: new (options: Record<string, unknown>) => StreetMap;
  Marker: new (options: { element: HTMLElement; anchor: string }) => {
    setLngLat(lngLat: [number, number]): { addTo(map: StreetMap): MapLibreMarker };
  };
}

const EMPTY = { type: 'FeatureCollection', features: [] };

function hostElement(node: View | null): HTMLElement | null {
  if (!node) return null;
  const candidate = node as unknown as HTMLElement;
  return typeof candidate.clientWidth === 'number' ? candidate : null;
}

function chromePadding(header: number, drawer: number): Padding {
  return { top: header, bottom: drawer + NAV_HEIGHT, left: 0, right: 0 };
}

function ensurePinCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('proxipoint-pin-css')) return;
  const style = document.createElement('style');
  style.id = 'proxipoint-pin-css';
  style.textContent = DISCOVERY_PIN_CSS;
  document.head.appendChild(style);
}

let mapLibrePromise: Promise<MapLibreGL> | null = null;

function loadMapLibre(): Promise<MapLibreGL> {
  if (typeof document === 'undefined') return Promise.reject(new Error('MapLibre needs a browser'));
  const existing = (window as Window & { maplibregl?: MapLibreGL }).maplibregl;
  if (existing) return Promise.resolve(existing);
  if (mapLibrePromise) return mapLibrePromise;
  mapLibrePromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-proxipoint-maplibre]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = MAPLIBRE_CSS_URL;
      link.dataset.proxipointMaplibre = '1';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = MAPLIBRE_JS_URL;
    script.async = true;
    script.onload = () => {
      const loaded = (window as Window & { maplibregl?: MapLibreGL }).maplibregl;
      if (loaded) resolve(loaded);
      else reject(new Error('MapLibre did not load'));
    };
    script.onerror = () => reject(new Error('MapLibre script failed'));
    document.head.appendChild(script);
  });
  return mapLibrePromise;
}

function ringFeature(latitude: number, longitude: number) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: circlePolygon({ latitude, longitude }, 120).map((point) => [point.longitude, point.latitude]),
    },
  };
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
  const mapRef = useRef<StreetMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const selectRef = useRef(selectNodeFromPin);
  selectRef.current = selectNodeFromPin;
  const bootRef = useRef<() => void>(() => {});
  const bootingRef = useRef(false);
  const aliveRef = useRef(true);
  const [zoom, setZoom] = useState(DISCOVERY_MAP_ZOOM);
  const [ready, setReady] = useState(false);

  const publishBounds = (map: StreetMap) => {
    const bounds = map.getBounds();
    if (!bounds) return;
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

  const drawMarkers = (map: StreetMap) => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    const state = useDiscoveryStore.getState();
    const maplibre = (window as Window & { maplibregl?: MapLibreGL }).maplibregl;
    if (!maplibre) return;
    const markers = buildMarkerPayload(
      Object.values(state.nodes),
      state.selfCoordinates,
      map.getZoom(),
      state.selectedNodeId,
    );
    markers.forEach((pin) => {
      const element = document.createElement('div');
      element.className = `pp-marker${pin.selected ? ' pp-selected' : ''}`;
      const head = document.createElement('div');
      head.className = 'pp-head';
      const stem = document.createElement('div');
      stem.className = 'pp-tip-dot';
      const tip = document.createElement('div');
      tip.className = `pp-tip pp-tip-${pin.labelAnchor}`;
      tip.textContent = pin.label;
      element.append(head, stem, tip);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        selectRef.current(pin.id);
      });
      const marker = new maplibre.Marker({ element, anchor: 'bottom' })
        .setLngLat([pin.longitude, pin.latitude])
        .addTo(map);
      markersRef.current.push(marker);
    });

    const selected = markers.find((pin) => pin.selected);
    map.getSource('ring')?.setData(selected ? ringFeature(selected.trueLatitude, selected.trueLongitude) : EMPTY);
    map.getSource('self')?.setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Point',
        coordinates: [state.selfCoordinates.longitude, state.selfCoordinates.latitude],
      },
    });
  };

  const drawRef = useRef(drawMarkers);
  drawRef.current = drawMarkers;
  const publishRef = useRef(publishBounds);
  publishRef.current = publishBounds;

  const flyToPoint = (latitude: number, longitude: number, zoomLevel: number) => {
    mapRef.current?.flyTo({ center: [longitude, latitude], zoom: zoomLevel, duration: 550 });
  };

  bootRef.current = () => {
    if (!aliveRef.current || mapRef.current || bootingRef.current) return;
    const host = hostElement(hostRef.current);
    if (!host || host.clientWidth === 0 || host.clientHeight === 0) return;
    ensurePinCss();
    bootingRef.current = true;
    const state = useDiscoveryStore.getState();
    loadMapLibre()
      .then((maplibre) => {
        if (!aliveRef.current || mapRef.current) {
          bootingRef.current = false;
          return;
        }
        const currentHost = hostElement(hostRef.current);
        if (!currentHost) {
          bootingRef.current = false;
          return;
        }
        const map = new maplibre.Map({
          container: currentHost,
          style: FREE_DARK_STYLE_URL,
          center: [state.selfCoordinates.longitude, state.selfCoordinates.latitude],
          zoom: DISCOVERY_MAP_ZOOM,
          attributionControl: true,
          fadeDuration: 0,
        });
        mapRef.current = map;
        map.on('load', () => {
          map.resize();
          map.addSource('ring', { type: 'geojson', data: EMPTY });
          map.addLayer({
            id: 'ring',
            type: 'line',
            source: 'ring',
            paint: { 'line-color': '#22d3ee', 'line-width': 1.5, 'line-dasharray': [1.5, 1.5] },
          });
          map.addSource('self', { type: 'geojson', data: EMPTY });
          map.addLayer({
            id: 'self-dot',
            type: 'circle',
            source: 'self',
            paint: {
              'circle-radius': 7,
              'circle-color': '#38bdf8',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            },
          });
          const latest = useDiscoveryStore.getState();
          map.jumpTo({
            center: [latest.selfCoordinates.longitude, latest.selfCoordinates.latitude],
            zoom: DISCOVERY_MAP_ZOOM,
            padding: chromePadding(latest.headerHeight, latest.drawerHeight),
          });
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
        });
      })
      .catch(() => {
        bootingRef.current = false;
        mapRef.current = null;
      });
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
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
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
    if (drawerDragging) map.dragPan.disable();
    else map.dragPan.enable();
  }, [drawerDragging, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.easeTo({ padding: chromePadding(headerHeight, drawerHeight), duration: 0 });
    const bottom = `${drawerHeight + NAV_HEIGHT + 6}px`;
    map.getContainer().querySelectorAll('.maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left').forEach((node) => {
      (node as HTMLElement).style.bottom = bottom;
    });
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
            map.resize();
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
