const EVENTS_API_URL = process.env.EXPO_PUBLIC_EVENTS_API_URL || process.env.EXPO_PUBLIC_API_URL || '';

export async function postBeaconUpvote(beaconId: string, voterId: string): Promise<void> {
  if (!EVENTS_API_URL || !beaconId || !voterId) return;
  const base = EVENTS_API_URL.replace(/\/$/, '');
  const response = await fetch(`${base}/api/v1/beacons/${encodeURIComponent(beaconId)}/upvote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voterId }),
  });
  if (!response.ok) {
    throw new Error(`upvote failed: ${response.status}`);
  }
}
