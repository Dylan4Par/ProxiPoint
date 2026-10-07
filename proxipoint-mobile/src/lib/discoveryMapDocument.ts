import { LEAFLET_CSS } from './leafletCss';
import {
  FREE_DARK_TILE_ATTRIBUTION,
  FREE_DARK_TILE_SUBDOMAINS,
  FREE_DARK_TILE_URL,
  scriptJson,
} from './freeBasemap';

const PIN_CSS = `
.leaflet-container { background:#0b1220; height:100%; width:100%; }
.pp-pin { background: transparent !important; border: none !important; }
.pp-tip { background: rgba(8,15,29,0.92); color: #e0f2fe; border: 1px solid rgba(34,211,238,0.45); border-radius: 8px; box-shadow: none; font-weight: 700; font-size: 10px; letter-spacing: 0.3px; padding: 2px 6px; }
.pp-tip.pp-tip-selected { color: #fff; border-color: #67e8f9; }
.pp-head { width: 18px; height: 18px; border-radius: 9px; background: #06b6d4; border: 2px solid #e0f2fe; box-shadow: 0 0 0 4px rgba(6,182,212,0.25); }
.pp-head.pp-selected { background: #38bdf8; border-color: #fff; transform: scale(1.15); }
.pp-tip-dot { width: 0; height: 0; margin: 0 auto; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 7px solid #06b6d4; }
.pp-tip-dot.pp-selected { border-top-color: #38bdf8; }
`;

// A self-contained Leaflet page for the native WebView. Tiles stay on the
// keyless CARTO dark basemap. The app pushes marker and camera commands in.
export function buildDiscoveryMapDocument(): string {
  const css = scriptJson(`${LEAFLET_CSS}\n${PIN_CSS}`);
  const tileUrl = scriptJson(FREE_DARK_TILE_URL);
  const attribution = scriptJson(FREE_DARK_TILE_ATTRIBUTION);
  const subdomains = scriptJson(FREE_DARK_TILE_SUBDOMAINS);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{height:100%;margin:0;background:#0b1220;} .leaflet-bottom{transition:bottom 160ms ease;}</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: ${css} }));
var NAV = 72;
var map = null;
var markers = null;
var userLayer = null;
var opticalY = null;
var viewReady = false;

function post(message) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
}

function opticalCenterY(header, drawer) {
  var height = map.getSize().y;
  var top = Math.max(0, Math.min(header, height));
  var bottomInset = Math.max(0, Math.min(drawer + NAV, height));
  var visible = Math.max(0, height - top - bottomInset);
  return top + visible / 2;
}

function centerForOptical(latlng, zoom, optical) {
  var size = map.getSize();
  var projected = map.project(latlng, zoom);
  return map.unproject(projected.add([0, size.y / 2 - optical]), zoom);
}

function publish() {
  if (!map) return;
  var bounds = map.getBounds();
  post({
    type: 'bounds',
    south: bounds.getSouth(),
    north: bounds.getNorth(),
    west: bounds.getWest(),
    east: bounds.getEast(),
    zoom: map.getZoom()
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (char) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
  });
}

map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: 3, maxZoom: 20 });
L.tileLayer(${tileUrl}, {
  attribution: ${attribution},
  subdomains: ${subdomains},
  maxZoom: 20
}).addTo(map);
markers = L.layerGroup().addTo(map);
userLayer = L.layerGroup().addTo(map);
map.on('moveend', publish);
map.on('zoomend', publish);

window.__pp = {
  init: function (latitude, longitude, zoom, header, drawer) {
    opticalY = opticalCenterY(header, drawer);
    var center = centerForOptical([latitude, longitude], zoom, opticalY);
    map.setView(center, zoom);
    viewReady = true;
    var attributionNode = document.querySelector('.leaflet-bottom');
    if (attributionNode) attributionNode.style.bottom = (drawer + NAV + 6) + 'px';
    publish();
  },
  sync: function (payload) {
    markers.clearLayers();
    userLayer.clearLayers();
    (payload.markers || []).forEach(function (pin) {
      var icon = L.divIcon({
        className: 'pp-pin',
        html: '<div class="pp-head' + (pin.selected ? ' pp-selected' : '') + '"></div><div class="pp-tip-dot' + (pin.selected ? ' pp-selected' : '') + '"></div>',
        iconSize: [22, 28],
        iconAnchor: [11, 26]
      });
      var marker = L.marker([pin.latitude, pin.longitude], { icon: icon, title: pin.title, zIndexOffset: pin.selected ? 800 : 0 });
      marker.bindTooltip(escapeHtml(pin.label), {
        permanent: true,
        direction: pin.labelAnchor || 'top',
        className: pin.selected ? 'pp-tip pp-tip-selected' : 'pp-tip',
        offset: [0, -4]
      });
      marker.on('click', function (event) {
        L.DomEvent.stopPropagation(event);
        post({ type: 'select', id: pin.id });
      });
      marker.addTo(markers);
      if (pin.selected) {
        L.circle([pin.trueLatitude, pin.trueLongitude], {
          radius: 120,
          color: '#22d3ee',
          weight: 1.5,
          dashArray: '4 6',
          fillColor: '#22d3ee',
          fillOpacity: 0.08
        }).addTo(markers);
      }
    });
    if (payload.self) {
      L.circleMarker([payload.self.latitude, payload.self.longitude], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#38bdf8',
        fillOpacity: 1
      }).addTo(userLayer);
    }
    if (payload.dragging) map.dragging.disable();
    else map.dragging.enable();
    var attributionNode = document.querySelector('.leaflet-bottom');
    if (attributionNode && payload.attributionBottom != null) {
      attributionNode.style.bottom = payload.attributionBottom + 'px';
    }
  },
  focus: function (latitude, longitude, zoom) {
    if (!viewReady) return;
    var optical = opticalY == null ? map.getSize().y / 2 : opticalY;
    map.flyTo(centerForOptical([latitude, longitude], zoom, optical), zoom, { duration: 0.55 });
  },
  setOptical: function (header, drawer) {
    if (!viewReady) return;
    var next = opticalCenterY(header, drawer);
    var previous = opticalY;
    opticalY = next;
    var attributionNode = document.querySelector('.leaflet-bottom');
    if (attributionNode) attributionNode.style.bottom = (drawer + NAV + 6) + 'px';
    if (previous == null || Math.abs(next - previous) < 0.5) return;
    map.panBy([0, -(next - previous)], { animate: false });
  },
  invalidate: function () {
    map.invalidateSize();
  }
};

post({ type: 'ready' });
</script>
</body>
</html>`;
}
