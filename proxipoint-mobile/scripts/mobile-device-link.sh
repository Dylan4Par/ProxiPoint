#!/usr/bin/env bash
# Attach a physical Android device to the local ingest server and Metro bundler.
# USB: adb reverse so the phone can open ws://127.0.0.1:8080/ws/telemetry.
# LAN: if no device is plugged in, print the workstation binding from set-lan-ip.sh.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Android Device Bridge Configuration ==="
if command -v adb >/dev/null 2>&1; then
  DEVICES="$(adb devices | awk 'NR>1 && $2 == "device" { print $1 }' | tr -d '\r')"
  if [ -n "$DEVICES" ]; then
    echo "Found connected Android device(s): $DEVICES"
    echo "Forwarding port 8080 (Go Ingestion) and 8081 (Metro Bundler)..."
    adb reverse tcp:8080 tcp:8080
    adb reverse tcp:8081 tcp:8081
    echo "Port reverse complete: your device can now use ws://127.0.0.1:8080/ws/telemetry over USB!"
  else
    echo "No physical Android device detected via adb. Ensure USB debugging is enabled."
    echo "LAN alternative: ./scripts/set-lan-ip.sh writes EXPO_PUBLIC_WS_ENDPOINT=ws://<LAN_IP>:8080/ws/telemetry"
  fi
else
  echo "adb command not found. Ensure Android SDK platform-tools are in your PATH."
  echo "LAN alternative: ./scripts/set-lan-ip.sh writes EXPO_PUBLIC_WS_ENDPOINT=ws://<LAN_IP>:8080/ws/telemetry"
fi
