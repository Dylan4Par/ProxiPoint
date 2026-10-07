import {
  FREE_DARK_LABEL_URL,
  FREE_DARK_TILE_URL,
  FREE_MAP_ATTRIBUTION,
  LEAFLET_CSS_URL,
  LEAFLET_JS_URL,
  scriptJson,
} from './freeBasemap';

export const DISCOVERY_PIN_CSS = `
.leaflet-container { position: absolute !important; top: 0; right: 0; bottom: 0; left: 0; width: 100% !important; height: 100% !important; background: #0b1220; }
.pp-pin { background: transparent !important; border: none !important; }
.pp-head { width: 18px; height: 18px; border-radius: 9px; background: #06b6d4; border: 2px solid #e0f2fe; box-shadow: 0 0 0 4px rgba(6,182,212,0.25); }
.pp-head.pp-selected { background: #38bdf8; border-color: #fff; transform: scale(1.12); }
.pp-tip-dot { width: 0; height: 0; margin: 0 auto; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 7px solid #06b6d4; }
.pp-tip-dot.pp-selected { border-top-color: #38bdf8; }
.pp-tip { background: rgba(8,15,29,0.92); color: #e0f2fe; border: 1px solid rgba(34,211,238,0.45); border-radius: 8px; box-shadow: none; font-weight: 700; font-size: 10px; letter-spacing: 0.3px; padding: 2px 6px; }
.pp-tip.pp-tip-selected { color: #fff; border-color: #67e8f9; }
.leaflet-bottom { transition: bottom 160ms ease; }
.leaflet-bottom.leaflet-right { right: 62px !important; }
.leaflet-control-attribution { background: rgba(8,15,29,0.82); color: #94a3b8; }
.leaflet-control-attribution a { color: #7dd3fc; }
`;

// A self-contained Leaflet page for the native WebView. Tiles are Esri's
// keyless dark canvas, drawn as images so the map does not need WebGL.
export function buildDiscoveryMapDocument(): string {
  const css = scriptJson(DISCOVERY_PIN_CSS);
  const tileUrl = scriptJson(FREE_DARK_TILE_URL);
  const labelUrl = scriptJson(FREE_DARK_LABEL_URL);
  const attribution = scriptJson(FREE_MAP_ATTRIBUTION);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${LEAFLET_CSS_URL}" />
<style>html,body,#map{height:100%;margin:0;background:#0b1220;}</style>
</head>
<body>
<div id="map"></div>
<script src="${LEAFLET_JS_URL}"></script>
<script>
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: ${css} }));
var NAV = 72;
var map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: 3, maxZoom: 20 });
L.tileLayer(${tileUrl}, { attribution: ${attribution}, maxZoom: 20 }).addTo(map);
L.tileLayer(${labelUrl}, { maxZoom: 20, attribution: '' }).addTo(map);
var markers = L.layerGroup().addTo(map);
var userLayer = L.layerGroup().addTo(map);
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

function liftAttribution(drawer) {
  var node = document.querySelector('.leaflet-bottom');
  if (node) node.style.bottom = (drawer + NAV + 6) + 'px';
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (char) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
  });
}

window.__pp = {
  init: function (latitude, longitude, zoom, header, drawer) {
    opticalY = opticalCenterY(header, drawer);
    map.setView(centerForOptical([latitude, longitude], zoom, opticalY), zoom);
    viewReady = true;
    liftAttribution(drawer);
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
      marker.bindTooltip(escapeHtml(pin.label || ''), {
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
    if (payload.attributionBottom != null) {
      var node = document.querySelector('.leaflet-bottom');
      if (node) node.style.bottom = payload.attributionBottom + 'px';
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
    liftAttribution(drawer);
    if (previous == null || Math.abs(next - previous) < 0.5) return;
    map.panBy([0, -(next - previous)], { animate: false });
  },
  invalidate: function () {
    map.invalidateSize();
  }
};

map.on('moveend', publish);
post({ type: 'ready' });
</script>
</body>
</html>`;
}
