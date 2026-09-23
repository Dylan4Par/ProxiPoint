export function shouldPublishTelemetry(userId: string, telemetryEnabled: boolean): boolean {
  return telemetryEnabled && userId.trim().length > 0;
}
