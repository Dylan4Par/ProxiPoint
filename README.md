# ProxiPoint

Proximity radar client and ingest service.

## proxipoint-mobile

Expo app with a radar HUD:

- Radius presets `50m`, `100m`, `250m`, and `500m` are shared by the radar and the Alerts tab. Pings request the widest preset so contacts outside the selected geofence stay available, and the client splits them into in-range and out-of-range.
- The blue geofence matches the selected radius. Leaflet `fitBounds` (and the MapLibre helper) keep active pins in frame until the operator drags or zooms.
- Choosing an alert centers the camera once. Dragging or zooming clears `focusId`, `focusLat`, and `focusLon` so later position pings do not pull the camera back.
- Location updates are emitted after a 3 meter move or a 10 second heartbeat.
- Background updates use `expo-task-manager`. The task follows the Broadcast Telemetry switch, including after the app is woken from a cold start, and buffers pings it cannot post. iOS background mode includes `location`, and Android requests `ACCESS_BACKGROUND_LOCATION`.
- The Alerts tab lists contacts inside the shared radius under Active Contacts in Range, and the rest in a muted Out of Range section. Choosing one returns to the radar and centers the camera on that target.
- A generated callsign is stored on device and sent as `userId`. Settings can rename it, pause telemetry, and clear alert history.
- New contacts raise a local notification, with a 60 second cooldown per target. Notifications are skipped on web.

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
