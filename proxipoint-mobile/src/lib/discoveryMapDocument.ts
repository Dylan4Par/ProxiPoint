import { zoomForRadius } from './boundaryTiers';

export const ESRI_STREET_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

export const LEAFLET_STYLESHEET = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
export const LEAFLET_SCRIPT = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

export interface MapDocumentCenter {
  latitude: number;
  longitude: number;
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
  `;
}

export function buildDiscoveryMapDocument(center: MapDocumentCenter): string {
  const latitude = Number.isFinite(center.latitude) ? center.latitude : 0;
  const longitude = Number.isFinite(center.longitude) ? center.longitude : 0;
  const script = buildPreviewGeofenceScript();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${LEAFLET_STYLESHEET}" />
  <style>
    html, body, #map { margin: 0; height: 100%; background: #0a1120; }
    .geofence-glow {
      animation: geofencePulse 2.4s ease-in-out infinite;
      filter: drop-shadow(0 0 6px #06b6d4);
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
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([${latitude}, ${longitude}], 14);
    L.tileLayer('${ESRI_STREET_TILE_URL}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19
    }).addTo(map);
    window.map = map;
    window.addEventListener('resize', function() { map.invalidateSize(); });
    setTimeout(function() { map.invalidateSize(); }, 200);
    ${script}
  </script>
</body>
</html>`;
}

export { zoomForRadius };
