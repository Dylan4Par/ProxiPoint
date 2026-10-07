import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { buildDiscoveryMapDocument } from '../../lib/discoveryMapDocument';
import {
  DISCOVERY_MAP_ZOOM,
  buildMarkerPayload,
  declutterScaleForZoom,
  scriptJson,
} from '../../lib/freeBasemap';
import { NAV_HEIGHT } from '../../lib/mapViewport';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { DiscoveryMapChrome } from './DiscoveryMapChrome';

const DOCUMENT = buildDiscoveryMapDocument();

interface MapMessage {
  type?: string;
  id?: string;
  south?: number;
  north?: number;
  west?: number;
  east?: number;
  zoom?: number;
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

  const webRef = useRef<WebView>(null);
  const viewReady = useRef(false);
  const [zoom, setZoom] = useState(DISCOVERY_MAP_ZOOM);
  const [pageReady, setPageReady] = useState(false);

  const run = (script: string) => {
    webRef.current?.injectJavaScript(`${script};true;`);
  };

  useEffect(() => {
    if (!pageReady || viewReady.current) return;
    viewReady.current = true;
    const state = useDiscoveryStore.getState();
    run(
      `window.__pp.init(${state.selfCoordinates.latitude}, ${state.selfCoordinates.longitude}, ${DISCOVERY_MAP_ZOOM}, ${state.headerHeight}, ${state.drawerHeight})`,
    );
  }, [pageReady]);

  useEffect(() => {
    if (!pageReady) return;
    const markers = buildMarkerPayload(Object.values(nodes), selfCoordinates, zoom, selectedNodeId);
    const payload = {
      markers,
      self: selfCoordinates,
      dragging: drawerDragging,
      attributionBottom: drawerHeight + NAV_HEIGHT + 6,
    };
    run(`window.__pp.sync(${scriptJson(payload)})`);
  }, [nodes, selectedNodeId, selfCoordinates, zoom, drawerDragging, drawerHeight, pageReady]);

  useEffect(() => {
    if (!pageReady || focusToken === 0) return;
    const state = useDiscoveryStore.getState();
    const node = state.selectedNodeId ? state.nodes[state.selectedNodeId] : undefined;
    if (!node) return;
    run(`window.__pp.focus(${node.latitude}, ${node.longitude}, Math.max(${zoom}, 16))`);
  }, [focusToken, pageReady]);

  useEffect(() => {
    if (!pageReady) return;
    run(`window.__pp.setOptical(${headerHeight}, ${drawerHeight})`);
  }, [headerHeight, drawerHeight, pageReady]);

  const handleMessage = (event: WebViewMessageEvent) => {
    let message: MapMessage;
    try {
      message = JSON.parse(event.nativeEvent.data) as MapMessage;
    } catch {
      return;
    }
    if (message.type === 'ready') {
      setPageReady(true);
      return;
    }
    if (message.type === 'select' && message.id) {
      selectNodeFromPin(message.id);
      return;
    }
    if (
      message.type === 'bounds' &&
      message.south != null &&
      message.north != null &&
      message.west != null &&
      message.east != null &&
      message.zoom != null
    ) {
      setZoom(message.zoom);
      setViewportBounds({
        minX: 0,
        maxX: 1400,
        minY: 0,
        maxY: 1400,
        south: message.south,
        north: message.north,
        west: message.west,
        east: message.east,
      });
    }
  };

  const handleRecenter = () => {
    const state = useDiscoveryStore.getState();
    run(
      `window.__pp.focus(${state.selfCoordinates.latitude}, ${state.selfCoordinates.longitude}, ${DISCOVERY_MAP_ZOOM})`,
    );
  };

  const wide = declutterScaleForZoom(zoom) < 1.45;

  return (
    <View style={styles.frame} pointerEvents="box-none">
      <WebView
        ref={webRef}
        style={styles.map}
        originWhitelist={['*']}
        source={{ html: DOCUMENT, baseUrl: 'https://server.arcgisonline.com' }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        onLayout={() => run('window.__pp && window.__pp.invalidate()')}
      />
      <DiscoveryMapChrome zoomText={`${wide ? 'WIDE' : 'CLOSE'} · z${zoom}`} onRecenter={handleRecenter} />
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
