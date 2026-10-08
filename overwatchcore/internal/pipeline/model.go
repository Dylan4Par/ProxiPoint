package pipeline

import "time"

// Beacon is a dropped point plus the disk and hashtags it broadcasts.
type Beacon struct {
	ID           string    `json:"id"`
	HostID       string    `json:"host_id"`
	Label        string    `json:"label"`
	Channels     []string  `json:"channels"`
	Latitude     float64   `json:"latitude"`
	Longitude    float64   `json:"longitude"`
	RadiusMeters float64   `json:"radius_meters"`
	SourceTier   string    `json:"source_tier"`
	IsLive       bool      `json:"is_live"`
	StartsAt     time.Time `json:"starts_at"`
	ExpiresAt    time.Time `json:"expires_at"`
}

// AlertConfig is who a person follows and how far they will listen.
type AlertConfig struct {
	UserID                 string   `json:"user_id"`
	TrackedTags            []string `json:"tracked_tags"`
	MaxReceiveRadiusMeters float64  `json:"max_receive_radius_meters"`
	PushToken              string   `json:"push_token"`
	Latitude               float64  `json:"latitude"`
	Longitude              float64  `json:"longitude"`
	HasLocation            bool     `json:"-"`
}

// AlertMatch is one person inside a live beacon who shares a tag.
type AlertMatch struct {
	UserID         string   `json:"user_id"`
	PushToken      string   `json:"push_token"`
	BeaconID       string   `json:"beacon_id"`
	BeaconLabel    string   `json:"beacon_label"`
	MatchedTags    []string `json:"matched_tags"`
	DistanceMeters float64  `json:"distance_meters"`
}

// PushPayload is the notification handed to APNs or FCM.
type PushPayload struct {
	Title string            `json:"title"`
	Body  string            `json:"body"`
	Data  map[string]string `json:"data"`
}

// Delivery is the dispatch result for one match.
type Delivery struct {
	Match     AlertMatch  `json:"match"`
	Payload   PushPayload `json:"payload"`
	Delivered bool        `json:"delivered"`
	Reason    string      `json:"reason"`
}
