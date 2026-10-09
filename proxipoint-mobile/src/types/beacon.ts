export interface BeaconHost {
  hostId?: string;
  hostCallsign: string;
  hostUpvotes?: number;
  hostDrops?: number;
  isVerifiedCoordinator?: boolean;
}

export interface BeaconRecord extends BeaconHost {
  id: string;
  upvoteCount: number;
}
