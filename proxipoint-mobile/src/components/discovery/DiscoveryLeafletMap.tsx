import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { useTheme } from '../../theme/ThemeContext';
import {
  MAP_BACKGROUND,
  buildDiscoveryMapDocument,
  MAP_PICK_MESSAGE,
  PRIVACY_MOVE_MESSAGE,
  MAP_CENTER_MESSAGE,
} from '../../lib/discoveryMapDocument';
import type { LatLon, RegionGeometry } from '../../services/regionLookup';

/** What the location-privacy preview draws: the shaded region, its public pin, and the host's spot. */
export interface PrivacyMapPreview {
  name: string;
  center: LatLon;
  geometry?: RegionGeometry;
  radiusMeters?: number;
  /** Host's exact spot. Only ever passed in the host's own preview. */
  exact?: LatLon;
  /** Let the host drag a circle area around (needs `exact` and no `geometry`). */
  editable?: boolean;
}

/** Plays the "Point landing" animation. Change `key` to play it again. */
export interface DropAnimation {
  key: number;
  latitude: number;
  longitude: number;
  beaconRadiusMeters?: number;
  privacy?: { latitude: number; longitude: number; radiusMeters: number };
  reducedMotion?: boolean;
}

interface MapWindow {
  setPreviewGeofence?: (latitude: number, longitude: number, radiusMeters: number) => void;
  clearPreviewGeofence?: () => void;
  setPrivacyPreview?: (preview: PrivacyMapPreview) => void;
  clearPrivacyPreview?: () => void;
  playDropAnimation?: (animation: DropAnimation) => void;
}

interface PreviewFrame {
  contentWindow: MapWindow | null;
}

interface DiscoveryLeafletMapProps {
  onMapPick?: (latitude: number, longitude: number) => void;
  /** Draw a location-privacy region (used by the drop sheet's mini preview). */
  privacyPreview?: PrivacyMapPreview | null;
  /** Draw the broadcast perimeter from the store. Default true. */
  showGeofence?: boolean;
  /** Allow panning, zooming and taps. Default true. */
  interactive?: boolean;
  /** Called with the area's new center after the host drags it. */
  onPrivacyMove?: (latitude: number, longitude: number) => void;
  /** When set, plays the drop animation (once per key). */
  dropAnimation?: DropAnimation | null;
  /** Called after each pan / zoom with the point under the middle of the map. */
  onCenterChange?: (latitude: number, longitude: number) => void;
  /** Move the map so this spot is in the middle (once per key). */
  focus?: { key: number; latitude: number; longitude: number; zoom?: number } | null;
  /** + / − buttons: zoom by `delta` levels, once per key. */
  zoomRequest?: { key: number; delta: number } | null;
  /** Where the map opens. Defaults to your own location. */
  center?: LatLon | null;
}

interface MapPickPayload {
  type?: string;
  latitude?: number;
  longitude?: number;
}

function readPoint(
  data: MapPickPayload | null | undefined,
  type: string,
): { latitude: number; longitude: number } | null {
  if (!data || data.type !== type) return null;
  const { latitude, longitude } = data;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export const DiscoveryLeafletMap: React.FC<DiscoveryLeafletMapProps> = ({
  onMapPick,
  privacyPreview = null,
  showGeofence = true,
  interactive = true,
  onPrivacyMove,
  dropAnimation = null,
  onCenterChange,
  focus = null,
  zoomRequest = null,
  center = null,
}) => {
  const storePreview = useDiscoveryStore((state) => state.previewGeofence);
  const preview = showGeofence ? storePreview : null;
  const selfCoordinates = useDiscoveryStore((state) => state.selfCoordinates);
  const startLatitude = center?.latitude ?? selfCoordinates.latitude;
  const startLongitude = center?.longitude ?? selfCoordinates.longitude;
  // Day/night map style; switching themes reloads the map page.
  const { mode } = useTheme();
  const background = MAP_BACKGROUND[mode];
  const html = useMemo(
    () =>
      buildDiscoveryMapDocument(
        {
          latitude: startLatitude,
          longitude: startLongitude,
        },
        { theme: mode },
      ),
    [startLatitude, startLongitude, mode],
  );
  const frameRef = useRef<PreviewFrame | null>(null);
  const webViewRef = useRef<WebView | null>(null);
  const [ready, setReady] = useState(false);

  // Stable key so effects only re-run when the privacy preview actually changes.
  const privacyKey = privacyPreview ? JSON.stringify(privacyPreview) : '';

  // Rebuilding the document reloads the map, so wait for the new load before pushing overlays.
  useEffect(() => {
    setReady(false);
  }, [html]);

  // Web: call into the iframe's window directly (retrying until Leaflet has set up).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    const push = () => {
      const mapWindow = frameRef.current?.contentWindow;
      if (!mapWindow?.setPreviewGeofence || !mapWindow.setPrivacyPreview) return false;
      if (preview) mapWindow.setPreviewGeofence(preview.latitude, preview.longitude, preview.radiusMeters);
      else mapWindow.clearPreviewGeofence?.();
      if (privacyPreview) mapWindow.setPrivacyPreview(privacyPreview);
      else mapWindow.clearPrivacyPreview?.();
      return true;
    };
    if (push()) return;
    const timer = setInterval(() => {
      if (!cancelled && push()) clearInterval(timer);
    }, 100);
    const stop = setTimeout(() => clearInterval(timer), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, privacyKey, ready]);

  // Native: run the same calls inside the WebView once the page has loaded.
  useEffect(() => {
    if (Platform.OS === 'web' || !ready) return;
    const geofenceJs = preview
      ? `window.setPreviewGeofence && window.setPreviewGeofence(${preview.latitude}, ${preview.longitude}, ${preview.radiusMeters});`
      : 'window.clearPreviewGeofence && window.clearPreviewGeofence();';
    const privacyJs = privacyPreview
      ? `window.setPrivacyPreview && window.setPrivacyPreview(${JSON.stringify(privacyPreview)});`
      : 'window.clearPrivacyPreview && window.clearPrivacyPreview();';
    webViewRef.current?.injectJavaScript(`${geofenceJs} ${privacyJs} true;`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, privacyKey, ready]);

  // Focus: move the map to a spot once per key.
  const focusKey = focus?.key ?? 0;
  useEffect(() => {
    if (!focus || !ready) return;
    const call = `window.focusSpot && window.focusSpot(${focus.latitude}, ${focus.longitude}, ${focus.zoom ?? 'undefined'}); true;`;
    if (Platform.OS === 'web') {
      (frameRef.current?.contentWindow as { focusSpot?: (a: number, b: number, z?: number) => void } | undefined)?.focusSpot?.(
        focus.latitude,
        focus.longitude,
        focus.zoom,
      );
    } else {
      webViewRef.current?.injectJavaScript(call);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, ready]);

  // Zoom: once per key.
  const zoomKey = zoomRequest?.key ?? 0;
  useEffect(() => {
    if (!zoomRequest || !ready) return;
    if (Platform.OS === 'web') {
      (frameRef.current?.contentWindow as { zoomMap?: (d: number) => void } | undefined)?.zoomMap?.(zoomRequest.delta);
    } else {
      webViewRef.current?.injectJavaScript(`window.zoomMap && window.zoomMap(${zoomRequest.delta}); true;`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomKey, ready]);

  // Drop animation: play once per key, after the map has loaded. Cleared when it goes away.
  const dropKey = dropAnimation?.key ?? 0;
  useEffect(() => {
    if (!ready) return;
    if (!dropAnimation) {
      if (Platform.OS === 'web') {
        (frameRef.current?.contentWindow as { clearDropAnimation?: () => void } | undefined)?.clearDropAnimation?.();
      } else {
        webViewRef.current?.injectJavaScript('window.clearDropAnimation && window.clearDropAnimation(); true;');
      }
      return;
    }
    if (Platform.OS === 'web') {
      let cancelled = false;
      const play = () => {
        const mapWindow = frameRef.current?.contentWindow;
        if (!mapWindow?.playDropAnimation) return false;
        mapWindow.playDropAnimation(dropAnimation);
        return true;
      };
      if (play()) return;
      const timer = setInterval(() => {
        if (!cancelled && play()) clearInterval(timer);
      }, 50);
      const stop = setTimeout(() => clearInterval(timer), 2000);
      return () => {
        cancelled = true;
        clearInterval(timer);
        clearTimeout(stop);
      };
    }
    webViewRef.current?.injectJavaScript(
      `window.playDropAnimation && window.playDropAnimation(${JSON.stringify(dropAnimation)}); true;`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropKey, ready]);

  // Web: map taps arrive as window messages from the iframe.
  useEffect(() => {
    if (Platform.OS !== 'web' || (!onMapPick && !onPrivacyMove && !onCenterChange)) return;
    const handleMessage = (event: MessageEvent) => {
      // Only listen to this map's own iframe (several maps can be on screen).
      if (frameRef.current && event.source !== (frameRef.current.contentWindow as unknown)) return;
      const data = event.data as MapPickPayload | null;
      const pick = readPoint(data, MAP_PICK_MESSAGE);
      if (pick && onMapPick) onMapPick(pick.latitude, pick.longitude);
      const moved = readPoint(data, PRIVACY_MOVE_MESSAGE);
      if (moved && onPrivacyMove) onPrivacyMove(moved.latitude, moved.longitude);
      const middle = readPoint(data, MAP_CENTER_MESSAGE);
      if (middle && onCenterChange) onCenterChange(middle.latitude, middle.longitude);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMapPick, onPrivacyMove, onCenterChange]);

  if (Platform.OS !== 'web') {
    const handleNativeMessage = (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as MapPickPayload;
        const pick = readPoint(data, MAP_PICK_MESSAGE);
        if (pick && onMapPick) onMapPick(pick.latitude, pick.longitude);
        const moved = readPoint(data, PRIVACY_MOVE_MESSAGE);
        if (moved && onPrivacyMove) onPrivacyMove(moved.latitude, moved.longitude);
        const middle = readPoint(data, MAP_CENTER_MESSAGE);
        if (middle && onCenterChange) onCenterChange(middle.latitude, middle.longitude);
      } catch {
        // Not one of our messages.
      }
    };

    return (
      <View style={[styles.nativeCanvas, { backgroundColor: background }]} pointerEvents={interactive ? 'auto' : 'none'}>
        <WebView
          ref={webViewRef}
          source={{ html }}
          originWhitelist={['*']}
          // Lets the page load tiles from the local http:// tile server during development.
          mixedContentMode="always"
          onLoadEnd={() => setReady(true)}
          onMessage={handleNativeMessage}
          style={[styles.webView, { backgroundColor: background }]}
          containerStyle={[styles.webView, { backgroundColor: background }]}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setSupportMultipleWindows={false}
          testID="discovery-leaflet-webview"
        />
      </View>
    );
  }

  return React.createElement('iframe', {
    ref: (node: PreviewFrame | null) => {
      frameRef.current = node;
    },
    title: 'Discovery boundary map',
    srcDoc: html,
    onLoad: () => setReady(true),
    style: {
      border: '0',
      width: '100%',
      height: '100%',
      background,
      pointerEvents: interactive ? 'auto' : 'none',
    },
  });
};

const styles = StyleSheet.create({
  nativeCanvas: {
    flex: 1,
    backgroundColor: '#0a1120',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0a1120',
  },
});
