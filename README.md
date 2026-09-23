# ProxiPoint

Proximity radar client and ingest service.

## proxipoint-mobile

Expo app with a radar HUD:

- Radius presets `50m`, `100m`, `250m`, and `500m` are sent as `radiusMeters` on each `location_ping`.
- The blue geofence matches the selected radius. Leaflet `fitBounds` (and the MapLibre helper) keep active pins in frame.
- Location updates are emitted after a 3 meter move or a 10 second heartbeat.
- Background updates use `expo-task-manager` and post to `POST /api/v1/telemetry/ping` when the WebSocket is unavailable.

```bash
cd proxipoint-mobile
npm install
npm test
EXPO_PUBLIC_API_URL=http://127.0.0.1:8080/api/v1/telemetry/ping npm run web
```

## overwatchcore

Go ingest service. WebSocket `/api/v1/telemetry/ws` and `POST /api/v1/telemetry/ping` both accept a `LocationPing` and return proximity alerts.

With `DATABASE_URL` set, nearby entities come from PostGIS `ST_DWithin` using the ping radius in meters. Without it, the process serves an in-memory demo index.

```bash
cd overwatchcore
go test ./...
go run ./cmd/ingest
```
