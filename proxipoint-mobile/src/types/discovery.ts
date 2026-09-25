export interface EventNode {
  id: string;
  tag: string;
  title: string;
  venue: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  status: 'LIVE NOW' | string;
  statusColor?: string;
  eta: string;
  etaMode: 'walk' | 'drive';
  attendeeCount: number;
  isRsvpd: boolean;
  radii: number[]; // e.g. [250, 500]
}
