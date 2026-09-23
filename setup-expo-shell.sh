#!/usr/bin/env bash
set -e
APP_DIR="proxipoint-mobile"
echo "=== 1. Scaffolding Expo App Shell ==="
if [ ! -d "$APP_DIR" ]; then
  npx create-expo-app@latest "$APP_DIR" --template tabs
  cd "$APP_DIR"
else
  cd "$APP_DIR"
  echo "Directory $APP_DIR already exists. Skipping create-expo-app."
fi
echo "=== 2. Installing Native & Geospatial Dependencies ==="
npx expo install expo-location expo-constants
echo "=== 3. Setting up Environment Variables ==="
if [ ! -f ".env" ]; then
  cat << 'EOF' > .env
# WebSocket Ingestion Endpoint
# For Web/Simulator: ws://127.0.0.1:8080/ws/telemetry
# For Android Emulator: ws://10.0.2.2:8080/ws/telemetry
# For Physical Device: ws://<YOUR_LAN_IP>:8080/ws/telemetry
EXPO_PUBLIC_WS_ENDPOINT=ws://127.0.0.1:8080/ws/telemetry
EOF
  echo "Created .env with default loopback endpoint."
fi
echo "=== 4. Updating app.json with Permissions ==="
node -e "
const fs = require('fs');
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
appJson.expo.ios = appJson.expo.ios || {};
appJson.expo.ios.infoPlist = appJson.expo.ios.infoPlist || {};
appJson.expo.ios.infoPlist.NSLocationWhenInUseUsageDescription = 'ProxiPoint needs location access to alert you to nearby events and peers.';
appJson.expo.android = appJson.expo.android || {};
appJson.expo.android.permissions = appJson.expo.android.permissions || [];
if (!appJson.expo.android.permissions.includes('ACCESS_FINE_LOCATION')) {
  appJson.expo.android.permissions.push('ACCESS_FINE_LOCATION');
}
if (!appJson.expo.android.permissions.includes('ACCESS_COARSE_LOCATION')) {
  appJson.expo.android.permissions.push('ACCESS_COARSE_LOCATION');
}
fs.writeFileSync('app.json', JSON.stringify(appJson, null, 2));
"
echo "=== 5. Running TypeScript Verification ==="
npx tsc --noEmit
echo ""
echo "=== Ready to Test! ==="
echo "1. In overwatchcore terminal: make run (or go run ./cmd/ingest)"
echo "2. In $APP_DIR terminal:      npx expo start --web"
echo "3. Click 'Send Mock Ping' (Erie: 40.0503, -105.0497) to verify server ingestion."
