import type { LocationPingPayload, ProximityAlert, ProximityAlertPacket } from '../types/telemetry';
import { telemetrySocketUrl } from './telemetryApi';

type AlertHandler = (alerts: ProximityAlert[]) => void;

export class TelemetrySocket {
  private socket: WebSocket | null = null;
  private onAlerts: AlertHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldRun = false;

  start(handler: AlertHandler) {
    this.onAlerts = handler;
    this.shouldRun = true;
    this.open();
  }

  stop() {
    this.shouldRun = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  sendPing(payload: LocationPingPayload) {
    if (!this.isConnected() || !this.socket) {
      throw new Error('WebSocket is not connected');
    }
    const packet = { type: 'location_ping', payload };
    this.socket.send(JSON.stringify(packet));
  }

  private open() {
    if (!this.shouldRun || this.isConnected()) return;
    const socket = new WebSocket(telemetrySocketUrl());
    this.socket = socket;

    socket.onmessage = (event) => {
      const packet = parseAlertPacket(event.data);
      if (packet && this.onAlerts) this.onAlerts(packet.alerts);
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      socket.close();
    };
  }

  private scheduleReconnect() {
    if (!this.shouldRun || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, 2000);
  }
}

function parseAlertPacket(data: unknown): ProximityAlertPacket | null {
  if (typeof data !== 'string') return null;
  try {
    const packet = JSON.parse(data) as Partial<ProximityAlertPacket>;
    if (packet.type !== 'proximity_alerts' || !Array.isArray(packet.alerts)) return null;
    return packet as ProximityAlertPacket;
  } catch {
    return null;
  }
}
