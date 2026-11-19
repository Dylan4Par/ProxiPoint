#!/bin/bash
cd ~/ProxiPoint
echo "🔌 Bridging ports to the Android emulator..."
adb.exe reverse tcp:8090 tcp:8090
echo "🚀 Starting Overwatch Core (Events API)..."
cd overwatchcore
go run ./cmd/events-api &
GO_PID=$!
echo "📱 Starting Expo Bundler for Android..."
cd ../proxipoint-mobile
EXPO_PUBLIC_API_URL=http://127.0.0.1:8090 npx expo start -c --go --android
trap "echo '🛑 Shutting down Overwatch Core...'; kill $GO_PID" EXIT
