CREATE TABLE IF NOT EXISTS profiles (
    handle TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    following_count INT NOT NULL DEFAULT 0,
    follower_count INT NOT NULL DEFAULT 0,
    activity_count INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS profile_photos (
    id TEXT PRIMARY KEY,
    host_handle TEXT NOT NULL REFERENCES profiles(handle) ON DELETE CASCADE,
    event_title TEXT NOT NULL,
    event_place TEXT NOT NULL,
    territory TEXT NOT NULL,
    event_at TIMESTAMPTZ NOT NULL,
    content_type TEXT NOT NULL,
    image BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_photos_host ON profile_photos (host_handle, event_at DESC);

CREATE TABLE IF NOT EXISTS photo_reactions (
    photo_id TEXT NOT NULL REFERENCES profile_photos(id) ON DELETE CASCADE,
    actor_handle TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (photo_id, actor_handle)
);
