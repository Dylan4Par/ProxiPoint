export const VERIFIED_MIN_DROPS = 5;
export const VERIFIED_MIN_RATIO = 0.85;

export interface HostReputation {
  totalDrops: number;
  upvoteCount: number;
  positiveRatio: number;
  positivePercent: number;
  isVerifiedCoordinator: boolean;
}

export interface FeedbackGate {
  wasRsvpd: boolean;
  stillInside: boolean;
  beaconExpired: boolean;
  alreadyPrompted: boolean;
}

export function hostReputation(totalDrops: number, upvoteCount: number): HostReputation {
  const drops = normalizeCount(totalDrops);
  const upvotes = normalizeCount(upvoteCount);
  const positiveRatio = drops === 0 ? 0 : upvotes / drops;
  return {
    totalDrops: drops,
    upvoteCount: upvotes,
    positiveRatio,
    positivePercent: drops === 0 ? 0 : Math.round(positiveRatio * 100),
    isVerifiedCoordinator: qualifiesAsVerifiedCoordinator(drops, upvotes),
  };
}

export function qualifiesAsVerifiedCoordinator(totalDrops: number, upvoteCount: number): boolean {
  const drops = normalizeCount(totalDrops);
  const upvotes = normalizeCount(upvoteCount);
  if (drops < VERIFIED_MIN_DROPS) return false;
  return upvotes / drops >= VERIFIED_MIN_RATIO;
}

export function coordinatorBadgeLabel(totalDrops: number, upvoteCount: number): string {
  const reputation = hostReputation(totalDrops, upvoteCount);
  if (!reputation.isVerifiedCoordinator) return '';
  if (reputation.totalDrops === 0) return '⭐ Verified Coordinator';
  return `⭐ Verified Coordinator (${reputation.positivePercent}% • ${reputation.totalDrops} drops)`;
}

export interface ProxiEvent {
  id: string;
  tag: string;
  title: string;
  venue: string;
  hostCallsign: string;
  hostDrops: number;
  hostUpvotes: number;
  attendeeCount: number;
  status: string;
  startsAt: string | null;
  distanceMeters: number;
  isRsvpd: boolean;
  selected?: boolean;
}

export interface TrustBadge {
  show: boolean;
  label: string;
}

export function getTrustBadge(drops: number, upvotes: number): TrustBadge {
  const label = coordinatorBadgeLabel(drops, upvotes);
  return { show: label.length > 0, label };
}

// A post-event prompt is due when an RSVP'd attendee leaves the geofence
// or the beacon expires, and this device has not already answered.
export function shouldRequestHostFeedback(gate: FeedbackGate): boolean {
  if (!gate.wasRsvpd || gate.alreadyPrompted) return false;
  return gate.beaconExpired || !gate.stillInside;
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}
