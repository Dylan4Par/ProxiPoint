import { zoomForRadius } from './boundaryTiers';
import { MAP_TILE_MAX_ZOOM, MAP_TILE_URLS } from './mapTileUrls';

export const LEAFLET_STYLESHEET = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
export const LEAFLET_SCRIPT = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
export const PROTOMAPS_LEAFLET_SCRIPT = 'https://unpkg.com/protomaps-leaflet@5.0.0/dist/protomaps-leaflet.js';
export const MAP_PICK_MESSAGE = 'proxipoint-map-pick';
export const PRIVACY_MOVE_MESSAGE = 'proxipoint-privacy-move';
/** Sent whenever the map stops moving: the point under the middle of the map. */
export const MAP_CENTER_MESSAGE = 'proxipoint-map-center';

/**
 * Local vector tiles from `pmtiles serve` (Protomaps), from EXPO_PUBLIC_OFFLINE_TILES_URL.
 * No longer used by default: the Leaflet maps use the same Esri tiles as Explore Map so every map
 * looks the same. Pass it as `offlineTileUrl` to a map document to opt back in.
 */
export const OFFLINE_TILE_URL: string = process.env.EXPO_PUBLIC_OFFLINE_TILES_URL ?? '';

export interface MapDocumentCenter {
  latitude: number;
  longitude: number;
}

export interface MapDocumentOptions {
  /** z/x/y .mvt URL for offline vector tiles. Left out = the app's shared Esri tiles. */
  offlineTileUrl?: string;
  /** Day or night map style. Default dark. */
  theme?: 'dark' | 'light';
}

/** Page background behind the tiles, per theme (matches the app's map color). */
export const MAP_BACKGROUND = { dark: '#0a1120', light: '#e9eef5' } as const;

/** Leaflet code for the app's shared basemap (same tiles as Explore Map) in this theme. */
function hostedTilesScript(theme: 'dark' | 'light', variable: string): string {
  const urls = MAP_TILE_URLS[theme];
  const opts = `{ attribution: 'Tiles &copy; Esri', maxNativeZoom: ${MAP_TILE_MAX_ZOOM}, maxZoom: 19 }`;
  return `
    ${variable} = L.layerGroup([
      L.tileLayer('${urls.base}', ${opts}),
      L.tileLayer('${urls.labels}', ${opts})
    ]).addTo(map);`;
}

function buildBasemapScript(offlineTileUrl: string, theme: 'dark' | 'light'): string {
  if (offlineTileUrl) {
    // Local vector tiles, with an automatic fallback to the shared hosted tiles when they can't
    // be reached (e.g. a real phone can't see the emulator-only 10.0.2.2 address, iOS blocks
    // plain http, or the tile server isn't running). Without this the map stays blank.
    return `
    var hostedFallback = null;
    function useHostedTiles() {
      if (hostedFallback) return;
      ${hostedTilesScript(theme, 'hostedFallback')}
    }
    var vectorLoaded = false;
    var vectorErrors = 0;
    try {
      var vectorLayer = protomapsL.leafletLayer({
        url: ${JSON.stringify(offlineTileUrl)},
        flavor: ${JSON.stringify(theme)},
        lang: 'en',
        maxDataZoom: 15,
        attribution: '&copy; OpenStreetMap contributors, Protomaps'
      });
      vectorLayer.on('tileload', function () { vectorLoaded = true; });
      vectorLayer.on('tileerror', function () {
        vectorErrors += 1;
        if (vectorErrors >= 2 && !vectorLoaded) useHostedTiles();
      });
      vectorLayer.addTo(map);
    } catch (e) {
      useHostedTiles();
    }
    // Nothing from the tile server after a few seconds: show the hosted map underneath.
    setTimeout(function () { if (!vectorLoaded) useHostedTiles(); }, 3500);`;
  }
  return `
    var hostedTiles = null;${hostedTilesScript(theme, 'hostedTiles')}`;
}

/**
 * Leaflet runtime installed inside the map document.
 * Draws a glowing cyan ST_DWithin ring and flies the camera to the anchor.
 */
export function buildPreviewGeofenceScript(): string {
  return `
    var previewCircle = null;
    window.setPreviewGeofence = function(lat, lon, radiusMeters) {
      if (!map) return;
      if (previewCircle) {
        map.removeLayer(previewCircle);
      }
      var halo = L.circle([lat, lon], {
        radius: radiusMeters,
        color: '#06b6d4',
        weight: 1.5,
        opacity: 0.85,
        fillColor: '#06b6d4',
        fillOpacity: 0.12,
        dashArray: '4, 6',
        className: 'geofence-glow'
      });
      var core = L.circle([lat, lon], {
        radius: Math.max(40, radiusMeters * 0.42),
        color: '#22d3ee',
        weight: 0,
        fillColor: '#06b6d4',
        fillOpacity: 0.22,
        className: 'geofence-core'
      });
      previewCircle = L.layerGroup([halo, core]).addTo(map);
      map.invalidateSize();
      var zoom = radiusMeters > 3000 ? 12 : (radiusMeters > 1000 ? 14 : 16);
      map.flyTo([lat, lon], zoom, { animate: true, duration: 0.6 });
    };
    window.clearPreviewGeofence = function() {
      if (previewCircle && map) {
        map.removeLayer(previewCircle);
        previewCircle = null;
      }
    };

    /*
     * Location privacy preview. preview = {
     *   name, center: {latitude, longitude}, geometry?: GeoJSON, radiusMeters?: number,
     *   exact?: {latitude, longitude},   // host's real spot, drawn small, never shown to others
     *   editable?: boolean               // circle areas only: drag the pin to move the area
     * }
     * While editable, the area can't be dragged so far that the exact spot falls outside it
     * (max 85% of the radius), or so close that its middle gives the spot away (min 25%).
     */
    var privacyLayer = null;
    var PRIVACY_MOVE = '${PRIVACY_MOVE_MESSAGE}';

    function postToApp(payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }
    }

    function clampAround(exact, point, minMeters, maxMeters) {
      var metersPerLat = 110540;
      var metersPerLon = 111320 * Math.cos(exact.lat * Math.PI / 180);
      var dx = (point.lng - exact.lng) * metersPerLon;
      var dy = (point.lat - exact.lat) * metersPerLat;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.001) { dx = minMeters; dy = 0; d = minMeters; }
      var target = Math.max(minMeters, Math.min(maxMeters, d));
      var k = target / d;
      return L.latLng(exact.lat + (dy * k) / metersPerLat, exact.lng + (dx * k) / metersPerLon);
    }

    window.setPrivacyPreview = function(preview) {
      if (!map) return;
      if (privacyLayer) {
        map.removeLayer(privacyLayer);
        privacyLayer = null;
      }
      if (!preview || !preview.center) return;
      var center = L.latLng(preview.center.latitude, preview.center.longitude);
      var violet = '#a78bfa';
      var layers = [];
      var area = null;
      var discs = [];
      var r = preview.radiusMeters || 750;
      var editable = !!preview.editable && !preview.geometry && !!preview.exact;

      if (preview.geometry) {
        area = L.geoJSON(preview.geometry, {
          style: { color: violet, weight: 1.5, opacity: 0.85, dashArray: '3, 5', fillColor: violet, fillOpacity: 0.2 }
        });
        layers.push(area);
      } else {
        discs.push(L.circle(center, { radius: r, stroke: false, fillColor: violet, fillOpacity: 0.08 }));
        discs.push(L.circle(center, { radius: r * 0.78, stroke: false, fillColor: violet, fillOpacity: 0.09 }));
        discs.push(L.circle(center, { radius: r * 0.55, stroke: false, fillColor: violet, fillOpacity: 0.1 }));
        area = L.circle(center, { radius: r, color: violet, weight: editable ? 2 : 1.2, opacity: 0.85, dashArray: '3, 5', fill: false });
        discs.push(area);
        layers = layers.concat(discs);
      }

      var pin;
      if (editable) {
        pin = L.marker(center, {
          draggable: true,
          autoPan: true,
          icon: L.divIcon({ className: 'privacy-handle', iconSize: [22, 22], iconAnchor: [11, 11] })
        });
      } else {
        pin = L.circleMarker(center, { radius: 6, color: violet, weight: 2, fillColor: '#2e1065', fillOpacity: 1 });
      }
      pin.bindTooltip(preview.name || 'Hidden area', { permanent: true, direction: 'top', offset: [0, editable ? -12 : -8], className: 'privacy-label' });
      layers.push(pin);

      if (preview.exact) {
        layers.push(L.circleMarker([preview.exact.latitude, preview.exact.longitude], {
          radius: 4, color: '#e0f2fe', weight: 1.5, fillColor: '#06b6d4', fillOpacity: 1, interactive: false
        }));
      }

      if (editable) {
        var exact = L.latLng(preview.exact.latitude, preview.exact.longitude);
        var minOffset = r * 0.25;
        var maxOffset = r * 0.85;
        var place = function(latlng) {
          var clamped = clampAround(exact, latlng, minOffset, maxOffset);
          pin.setLatLng(clamped);
          for (var i = 0; i < discs.length; i++) discs[i].setLatLng(clamped);
          return clamped;
        };
        pin.on('drag', function(event) { place(event.target.getLatLng()); });
        pin.on('dragend', function(event) {
          var finalPoint = place(event.target.getLatLng());
          postToApp({ type: PRIVACY_MOVE, latitude: finalPoint.lat, longitude: finalPoint.lng });
        });
      }

      privacyLayer = L.layerGroup(layers).addTo(map);
      map.invalidateSize();
      var bounds = area.getBounds();
      if (preview.exact) bounds.extend([preview.exact.latitude, preview.exact.longitude]);
      if (editable) bounds = bounds.pad(0.6);
      map.fitBounds(bounds, { padding: [18, 18], animate: false });
    };
    /*
     * Drop animation, played right after a Point is created. opts = {
     *   latitude, longitude,                 // the exact spot (host's own view)
     *   beaconRadiusMeters?,                 // grows a cyan beacon ring after landing
     *   privacy?: { latitude, longitude, radiusMeters },  // grows the violet area others see
     *   reducedMotion?                       // just show the end state
     * }
     */
    var dropLayer = null;
    var dropFrame = null;
    function growCircle(circle, target, delayMs, durationMs) {
      var start = null;
      function step(ts) {
        if (start === null) start = ts;
        var t = Math.min(1, Math.max(0, (ts - start - delayMs) / durationMs));
        var eased = 1 - Math.pow(1 - t, 3);
        circle.setRadius(Math.max(1, target * eased));
        if (t < 1) dropFrame = requestAnimationFrame(step);
      }
      dropFrame = requestAnimationFrame(step);
    }
    // Remove the dropped pin (e.g. when "Select on map" closes).
    window.clearDropAnimation = function() {
      if (dropLayer) { map.removeLayer(dropLayer); dropLayer = null; }
    };
    window.playDropAnimation = function(opts) {
      if (!map || !opts) return;
      if (dropFrame) cancelAnimationFrame(dropFrame);
      if (dropLayer) { map.removeLayer(dropLayer); dropLayer = null; }
      if (window.clearPreviewGeofence) window.clearPreviewGeofence();
      if (window.clearPrivacyPreview) window.clearPrivacyPreview();

      var spot = L.latLng(opts.latitude, opts.longitude);
      var reduced = !!opts.reducedMotion;
      var layers = [];

      var frame = L.latLngBounds(spot, spot);
      if (opts.beaconRadiusMeters) frame.extend(spot.toBounds(opts.beaconRadiusMeters * 2.3));
      if (opts.privacy) {
        frame.extend(L.latLng(opts.privacy.latitude, opts.privacy.longitude).toBounds(opts.privacy.radiusMeters * 2.3));
      }
      if (frame.getNorthEast().equals(frame.getSouthWest())) map.setView(spot, 16, { animate: false });
      else map.fitBounds(frame, { padding: [30, 30], maxZoom: 17, animate: false });

      if (opts.privacy) {
        var area = L.circle([opts.privacy.latitude, opts.privacy.longitude], {
          radius: reduced ? opts.privacy.radiusMeters : 1,
          color: '#a78bfa', weight: 1.5, opacity: 0.8, dashArray: '3, 5',
          fillColor: '#a78bfa', fillOpacity: 0.16
        });
        layers.push(area);
        if (!reduced) growCircle(area, opts.privacy.radiusMeters, 560, 750);
      }
      if (opts.beaconRadiusMeters) {
        var ring = L.circle(spot, {
          radius: reduced ? opts.beaconRadiusMeters : 1,
          color: '#22d3ee', weight: 1.5, opacity: 0.9, dashArray: '4, 6',
          fillColor: '#06b6d4', fillOpacity: 0.1, className: 'geofence-glow'
        });
        layers.push(ring);
        if (!reduced) growCircle(ring, opts.beaconRadiusMeters, 520, 700);
      }

      if (!reduced) {
        layers.push(L.marker(spot, {
          interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'drop-ripple-icon', iconSize: [0, 0],
            html: '<div class="drop-ripple"></div><div class="drop-ripple drop-ripple-late"></div>' })
        }));
      }
      layers.push(L.marker(spot, {
        interactive: false, keyboard: false, zIndexOffset: 1000,
        icon: L.divIcon({
          className: 'drop-marker-icon', iconSize: [30, 44], iconAnchor: [15, 42],
          html: '<div class="drop-marker' + (reduced ? ' drop-still' : '') + '">' +
                '<div class="drop-shadow"></div>' +
                '<div class="drop-pin"><div class="drop-pin-head"><div class="drop-pin-dot"></div></div><div class="drop-pin-tip"></div></div>' +
                '</div>'
        })
      }));
      dropLayer = L.layerGroup(layers).addTo(map);
    };
    window.clearDropAnimation = function() {
      if (dropFrame) cancelAnimationFrame(dropFrame);
      if (dropLayer && map) { map.removeLayer(dropLayer); dropLayer = null; }
    };

    window.clearPrivacyPreview = function() {
      if (privacyLayer && map) {
        map.removeLayer(privacyLayer);
        privacyLayer = null;
      }
    };
    // Report the middle of the map after every pan / zoom (for the fixed center pin).
    function postToApp(payload) {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      else if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
    }
    map.on('moveend', function() {
      var middle = map.getCenter();
      postToApp({ type: '${MAP_CENTER_MESSAGE}', latitude: middle.lat, longitude: middle.lng });
    });
    // Move the map so this spot is in the middle.
    // + / − buttons outside the map (one Leaflet level each, keeping the middle where it is).
    window.zoomMap = function(delta) {
      if (!map) return;
      if (delta > 0) map.zoomIn(delta); else map.zoomOut(-delta);
    };
    window.focusSpot = function(lat, lon, zoom) {
      if (!map) return;
      map.setView([lat, lon], zoom || Math.max(map.getZoom(), 16), { animate: true });
    };
    map.on('click', function(event) {
      var payload = {
        type: '${MAP_PICK_MESSAGE}',
        latitude: event.latlng.lat,
        longitude: event.latlng.lng
      };
      if (window.ReactNativeWebView) {
        // Inside the Android/iOS WebView.
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      } else if (window.parent && window.parent !== window) {
        // Inside the web iframe.
        window.parent.postMessage(payload, '*');
      }
    });
  `;
}

export function buildDiscoveryMapDocument(
  center: MapDocumentCenter,
  options: MapDocumentOptions = {},
): string {
  const latitude = Number.isFinite(center.latitude) ? center.latitude : 0;
  const longitude = Number.isFinite(center.longitude) ? center.longitude : 0;
  // Same tiles as Explore Map unless offline vector tiles are asked for explicitly.
  const offlineTileUrl = options.offlineTileUrl ?? '';
  const script = buildPreviewGeofenceScript();
  const theme = options.theme ?? 'dark';
  const basemap = buildBasemapScript(offlineTileUrl, theme);
  const protomapsScript = offlineTileUrl ? `<script src="${PROTOMAPS_LEAFLET_SCRIPT}"></script>` : '';
  // (If that script can't load, the basemap code above throws and falls back to hosted tiles.)
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${LEAFLET_STYLESHEET}" />
  <style>
    html, body, #map { margin: 0; height: 100%; background: ${MAP_BACKGROUND[theme]}; }
    .geofence-glow {
      animation: geofencePulse 2.4s ease-in-out infinite;
      filter: drop-shadow(0 0 6px #06b6d4);
    }
    .leaflet-tooltip.privacy-label {
      background: #2e1065;
      color: #ddd6fe;
      border: 1px solid #a78bfa;
      border-radius: 10px;
      box-shadow: none;
      font: 600 11px system-ui, sans-serif;
      padding: 2px 8px;
    }
    .leaflet-tooltip.privacy-label:before { display: none; }
    .privacy-handle {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #2e1065;
      border: 3px solid #a78bfa;
      box-shadow: 0 0 0 7px rgba(167, 139, 250, 0.28);
      box-sizing: border-box;
    }
    .drop-marker-icon, .drop-ripple-icon { background: none; border: none; }
    .drop-marker { position: relative; width: 30px; height: 44px; }
    .drop-pin {
      position: absolute; left: 4px; bottom: 2px; width: 22px;
      display: flex; flex-direction: column; align-items: center;
      transform-origin: 50% 100%;
      animation: pinDrop 0.95s both;
    }
    .drop-pin-head {
      width: 22px; height: 22px; border-radius: 50%; box-sizing: border-box;
      background: #06b6d4; border: 2px solid #e0f2fe;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 10px rgba(34, 211, 238, 0.8);
    }
    .drop-pin-dot { width: 6px; height: 6px; border-radius: 50%; background: #fff; }
    .drop-pin-tip {
      width: 0; height: 0; margin-top: -1px;
      border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 7px solid #06b6d4;
    }
    .drop-shadow {
      position: absolute; left: 8px; bottom: 0; width: 14px; height: 5px; border-radius: 50%;
      background: rgba(0, 0, 0, 0.55);
      animation: shadowGrow 0.95s both;
    }
    .drop-still .drop-pin, .drop-still .drop-shadow { animation: none; }
    .drop-ripple {
      position: absolute; left: -14px; top: -14px; width: 28px; height: 28px; border-radius: 50%;
      border: 2px solid #22d3ee; opacity: 0;
      animation: dropRipple 0.85s ease-out 0.52s forwards;
    }
    .drop-ripple-late { animation-delay: 0.7s; }
    @keyframes pinDrop {
      0%   { transform: translateY(-170px); opacity: 0; animation-timing-function: cubic-bezier(.55, 0, 1, .45); }
      12%  { opacity: 1; }
      55%  { transform: translateY(0) scale(1, 1); animation-timing-function: ease-out; }
      64%  { transform: translateY(0) scale(1.25, 0.72); }
      78%  { transform: translateY(-12px) scale(0.94, 1.06); animation-timing-function: ease-in; }
      90%  { transform: translateY(0) scale(1.06, 0.94); }
      100% { transform: translateY(0) scale(1, 1); }
    }
    @keyframes shadowGrow {
      0%   { transform: scale(0.2); opacity: 0; }
      55%  { transform: scale(1.2); opacity: 0.7; }
      100% { transform: scale(1); opacity: 0.5; }
    }
    @keyframes dropRipple {
      0%   { transform: scale(0.3); opacity: 0.95; }
      100% { transform: scale(5); opacity: 0; }
    }
    @keyframes geofencePulse {
      0%, 100% { stroke-opacity: 0.45; }
      50% { stroke-opacity: 1; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="${LEAFLET_SCRIPT}"></script>
  ${protomapsScript}
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: true, maxZoom: 18 }).setView([${latitude}, ${longitude}], 14);
    ${basemap}
    window.map = map;
    window.addEventListener('resize', function() { map.invalidateSize(); });
    setTimeout(function() { map.invalidateSize(); }, 200);
    ${script}
  </script>
</body>
</html>`;
}

export { zoomForRadius };
