#!/usr/bin/env bash
# Point the Expo client at this workstation so a phone on the same LAN can open the ingest socket.
# macOS: ipconfig getifaddr en0
# Linux: hostname -I, then the address of the default route.
set -euo pipefail
cd "$(dirname "$0")/.."

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [ -z "$LAN_IP" ]; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [ -z "$LAN_IP" ]; then
  LAN_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i=="src") { print $(i+1); exit }}')"
fi
if [ -z "$LAN_IP" ]; then
  echo "Could not detect LAN IP automatically. Check network interfaces."
  exit 1
fi

echo "Detected LAN IP: $LAN_IP"
cat << EOF > .env
# WebSocket Ingestion Endpoint
# For Web/Simulator: ws://127.0.0.1:8080/ws/telemetry
# For Android Emulator: ws://10.0.2.2:8080/ws/telemetry
# For Physical Device: ws://<YOUR_LAN_IP>:8080/ws/telemetry
EXPO_PUBLIC_WS_ENDPOINT=ws://$LAN_IP:8080/ws/telemetry
EOF
echo "Updated .env -> ws://$LAN_IP:8080/ws/telemetry"
