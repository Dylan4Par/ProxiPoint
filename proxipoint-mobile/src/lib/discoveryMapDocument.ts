import {
  FREE_DARK_STYLE_URL,
  MAPLIBRE_CSS_URL,
  MAPLIBRE_JS_URL,
  scriptJson,
} from './freeBasemap';

export const DISCOVERY_PIN_CSS = `
.pp-marker { position: relative; width: 22px; height: 28px; cursor: pointer; }
.pp-head { width: 18px; height: 18px; margin: 0 auto; border-radius: 9px; background: #06b6d4; border: 2px solid #e0f2fe; box-shadow: 0 0 0 4px rgba(6,182,212,0.25); }
.pp-marker.pp-selected .pp-head { background: #38bdf8; border-color: #fff; transform: scale(1.12); }
.pp-tip-dot { width: 0; height: 0; margin: -1px auto 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 7px solid #06b6d4; }
.pp-marker.pp-selected .pp-tip-dot { border-top-color: #38bdf8; }
.pp-tip { position: absolute; white-space: nowrap; background: rgba(8,15,29,0.92); color: #e0f2fe; border: 1px solid rgba(34,211,238,0.45); border-radius: 8px; font-weight: 700; font-size: 10px; letter-spacing: 0.3px; padding: 2px 6px; }
.pp-marker.pp-selected .pp-tip { color: #fff; border-color: #67e8f9; }
.pp-tip-top { bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 4px; }
.pp-tip-bottom { top: 100%; left: 50%; transform: translateX(-50%); margin-top: 4px; }
.pp-tip-left { right: 100%; top: 0; margin-right: 6px; }
.pp-tip-right { left: 100%; top: 0; margin-left: 6px; }
.maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left { transition: bottom 160ms ease; }
.maplibregl-ctrl-attrib { background: rgba(8,15,29,0.82); }
.maplibregl-ctrl-attrib a { color: #7dd3fc; }
`;

// A self-contained MapLibre page for the native WebView. The style is
// OpenFreeMap dark, which needs no API key. The app pushes markers and camera
// commands in after the style loads.
export function buildDiscoveryMapDocument(): string {
  const css = scriptJson(DISCOVERY_PIN_CSS);
  const styleUrl = scriptJson(FREE_DARK_STYLE_URL);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${MAPLIBRE_CSS_URL}" />
<style>html,body,#map{height:100%;margin:0;background:#0b1220;}</style>
</head>
<body>
<div id="map"></div>
<script src="${MAPLIBRE_JS_URL}"></script>
<script>
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: ${css} }));
var NAV = 72;
var STYLE_URL = ${styleUrl};
var map = new maplibregl.Map({
  container: 'map',
  style: STYLE_URL,
  center: [-105.2778, 40.0149],
  zoom: 15,
  attributionControl: true,
  fadeDuration: 0
});
var markerObjs = [];
var viewReady = false;
var EMPTY = { type: 'FeatureCollection', features: [] };

function post(message) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
}

function paddingFor(header, drawer) {
  return { top: header, bottom: drawer + NAV, left: 0, right: 0 };
}

function liftAttribution(drawer) {
  var nodes = document.querySelectorAll('.maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left');
  for (var i = 0; i < nodes.length; i += 1) nodes[i].style.bottom = (drawer + NAV + 6) + 'px';
}

function publish() {
  var bounds = map.getBounds();
  if (!bounds) return;
  post({
    type: 'bounds',
    south: bounds.getSouth(),
    north: bounds.getNorth(),
    west: bounds.getWest(),
    east: bounds.getEast(),
    zoom: map.getZoom()
  });
}

function ringFeature(latitude, longitude) {
  var steps = 64;
  var coords = [];
  var cos = Math.cos(latitude * Math.PI / 180) || 1e-6;
  for (var i = 0; i <= steps; i += 1) {
    var angle = 2 * Math.PI * i / steps;
    coords.push([
      longitude + Math.cos(angle) * 120 / (111320 * cos),
      latitude + Math.sin(angle) * 120 / 110540
    ]);
  }
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} };
}

function clearMarkers() {
  markerObjs.forEach(function (marker) { marker.remove(); });
  markerObjs = [];
}

window.__pp = {
  init: function (latitude, longitude, zoom, header, drawer) {
    map.jumpTo({ center: [longitude, latitude], zoom: zoom, padding: paddingFor(header, drawer) });
    viewReady = true;
    liftAttribution(drawer);
    publish();
  },
  sync: function (payload) {
    clearMarkers();
    (payload.markers || []).forEach(function (pin) {
      var el = document.createElement('div');
      el.className = 'pp-marker' + (pin.selected ? ' pp-selected' : '');
      var head = document.createElement('div');
      head.className = 'pp-head';
      var stem = document.createElement('div');
      stem.className = 'pp-tip-dot';
      var tip = document.createElement('div');
      tip.className = 'pp-tip pp-tip-' + (pin.labelAnchor || 'top');
      tip.textContent = pin.label || '';
      el.appendChild(head);
      el.appendChild(stem);
      el.appendChild(tip);
      el.addEventListener('click', function (event) {
        event.stopPropagation();
        post({ type: 'select', id: pin.id });
      });
      markerObjs.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([pin.longitude, pin.latitude]).addTo(map));
    });
    var selected = (payload.markers || []).find(function (pin) { return pin.selected; });
    var ring = map.getSource('ring');
    if (ring) ring.setData(selected ? ringFeature(selected.trueLatitude, selected.trueLongitude) : EMPTY);
    var selfSource = map.getSource('self');
    if (selfSource && payload.self) {
      selfSource.setData({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [payload.self.longitude, payload.self.latitude] },
        properties: {}
      });
    }
    if (payload.dragging) map.dragPan.disable();
    else map.dragPan.enable();
    if (payload.attributionBottom != null) {
      var nodes = document.querySelectorAll('.maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left');
      for (var i = 0; i < nodes.length; i += 1) nodes[i].style.bottom = payload.attributionBottom + 'px';
    }
  },
  focus: function (latitude, longitude, zoom) {
    if (!viewReady) return;
    map.flyTo({ center: [longitude, latitude], zoom: zoom, duration: 550 });
  },
  setOptical: function (header, drawer) {
    if (!viewReady) return;
    map.easeTo({ padding: paddingFor(header, drawer), duration: 0 });
    liftAttribution(drawer);
  },
  invalidate: function () {
    map.resize();
  }
};

map.on('load', function () {
  map.addSource('ring', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'ring',
    type: 'line',
    source: 'ring',
    paint: { 'line-color': '#22d3ee', 'line-width': 1.5, 'line-dasharray': [1.5, 1.5] }
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
      'circle-stroke-color': '#ffffff'
    }
  });
  map.on('moveend', publish);
  post({ type: 'ready' });
});
</script>
</body>
</html>`;
}
