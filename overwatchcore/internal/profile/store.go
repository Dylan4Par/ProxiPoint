package profile

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"strings"
	"sync"
)

var errEmojiOnly = errors.New("reactions are emoji only")
var errNotFound = errors.New("profile not found")

type Store interface {
	Profile(ctx context.Context, handle string) (HostProfile, error)
	React(ctx context.Context, handle, photoID, actor, emoji string) (Photo, error)
	SetAvatar(ctx context.Context, handle, contentType string, image []byte) (HostProfile, error)
}

type MemoryStore struct {
	mu       sync.Mutex
	profiles map[string]HostProfile
}

func NewMemoryStore() *MemoryStore {
	seed := demoProfile()
	return &MemoryStore{profiles: map[string]HostProfile{strings.ToLower(seed.Handle): cloneProfile(seed)}}
}

func (s *MemoryStore) Profile(_ context.Context, handle string) (HostProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	profile, ok := s.profiles[strings.ToLower(strings.TrimSpace(handle))]
	if !ok {
		return HostProfile{}, errNotFound
	}
	return publicProfile(profile), nil
}

func (s *MemoryStore) React(_ context.Context, handle, photoID, actor, emoji string) (Photo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := strings.ToLower(strings.TrimSpace(handle))
	profile, ok := s.profiles[key]
	if !ok {
		return Photo{}, errNotFound
	}
	for i := range profile.Photos {
		if profile.Photos[i].ID != photoID {
			continue
		}
		next, err := applyReaction(profile.Photos[i].Reactions, strings.TrimSpace(actor), emoji)
		if err != nil {
			return Photo{}, err
		}
		profile.Photos[i].Reactions = next
		s.profiles[key] = profile
		return publicPhoto(profile.Photos[i]), nil
	}
	return Photo{}, errNotFound
}

func (s *MemoryStore) SetAvatar(_ context.Context, handle, contentType string, image []byte) (HostProfile, error) {
	if err := validateAvatar(contentType, image); err != nil {
		return HostProfile{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	key := strings.ToLower(strings.TrimSpace(handle))
	profile, ok := s.profiles[key]
	if !ok {
		return HostProfile{}, errNotFound
	}
	profile.Avatar = append([]byte(nil), image...)
	profile.AvatarType = contentType
	s.profiles[key] = profile
	return publicProfile(profile), nil
}

func publicProfile(profile HostProfile) HostProfile {
	out := profile
	out.Photos = make([]Photo, len(profile.Photos))
	for i, photo := range profile.Photos {
		out.Photos[i] = publicPhoto(photo)
	}
	if len(profile.Avatar) > 0 {
		out.AvatarBase64 = base64.StdEncoding.EncodeToString(profile.Avatar)
		out.AvatarType = profile.AvatarType
	}
	out.Avatar = nil
	return out
}

func publicPhoto(photo Photo) Photo {
	photo.ImageBase64 = base64.StdEncoding.EncodeToString(photo.Image)
	photo.Image = nil
	if photo.Reactions == nil {
		photo.Reactions = []Reaction{}
	}
	return photo
}

func cloneProfile(profile HostProfile) HostProfile {
	out := profile
	out.Photos = make([]Photo, len(profile.Photos))
	for i, photo := range profile.Photos {
		out.Photos[i] = photo
		out.Photos[i].Image = append([]byte(nil), photo.Image...)
		out.Photos[i].Reactions = append([]Reaction(nil), photo.Reactions...)
	}
	out.Avatar = append([]byte(nil), profile.Avatar...)
	return out
}

type PostGISStore struct {
	db *sql.DB
}

func NewPostGISStore(db *sql.DB) *PostGISStore {
	return &PostGISStore{db: db}
}

func EnsureSchema(ctx context.Context, db *sql.DB) error {
	sqlText, err := schemaSQL()
	if err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, sqlText); err != nil {
		return err
	}
	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM profiles`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	return seedDatabase(ctx, db, demoProfile())
}

func seedDatabase(ctx context.Context, db *sql.DB, profile HostProfile) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO profiles (handle, display_name, following_count, follower_count, activity_count)
		VALUES ($1, $2, $3, $4, $5)`,
		profile.Handle, profile.DisplayName, profile.Following, profile.Followers, profile.Activities,
	); err != nil {
		return err
	}
	for _, photo := range profile.Photos {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO profile_photos (id, host_handle, event_title, event_place, territory, event_at, content_type, image)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			photo.ID, profile.Handle, photo.EventTitle, photo.EventPlace, photo.Territory, photo.EventAt, photo.ContentType, photo.Image,
		); err != nil {
			return err
		}
		for _, reaction := range photo.Reactions {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO photo_reactions (photo_id, actor_handle, emoji) VALUES ($1, $2, $3)`,
				photo.ID, reaction.Actor, reaction.Emoji,
			); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (s *PostGISStore) Profile(ctx context.Context, handle string) (HostProfile, error) {
	var profile HostProfile
	err := s.db.QueryRowContext(ctx, `
		SELECT handle, display_name, following_count, follower_count, activity_count, avatar, avatar_type
		FROM profiles WHERE lower(handle) = lower($1)`, strings.TrimSpace(handle),
	).Scan(&profile.Handle, &profile.DisplayName, &profile.Following, &profile.Followers, &profile.Activities, &profile.Avatar, &profile.AvatarType)
	if errors.Is(err, sql.ErrNoRows) {
		return HostProfile{}, errNotFound
	}
	if err != nil {
		return HostProfile{}, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, event_title, event_place, territory, event_at, content_type, image
		FROM profile_photos WHERE host_handle = $1 ORDER BY event_at DESC`, profile.Handle)
	if err != nil {
		return HostProfile{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var photo Photo
		if err := rows.Scan(&photo.ID, &photo.EventTitle, &photo.EventPlace, &photo.Territory, &photo.EventAt, &photo.ContentType, &photo.Image); err != nil {
			return HostProfile{}, err
		}
		photo.Reactions, err = s.reactions(ctx, photo.ID)
		if err != nil {
			return HostProfile{}, err
		}
		profile.Photos = append(profile.Photos, photo)
	}
	if err := rows.Err(); err != nil {
		return HostProfile{}, err
	}
	return publicProfile(profile), nil
}

func (s *PostGISStore) reactions(ctx context.Context, photoID string) ([]Reaction, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT actor_handle, emoji FROM photo_reactions WHERE photo_id = $1 ORDER BY created_at`, photoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var reactions []Reaction
	for rows.Next() {
		var reaction Reaction
		if err := rows.Scan(&reaction.Actor, &reaction.Emoji); err != nil {
			return nil, err
		}
		reactions = append(reactions, reaction)
	}
	return reactions, rows.Err()
}

func (s *PostGISStore) React(ctx context.Context, handle, photoID, actor, emoji string) (Photo, error) {
	if !EmojiAllowed(emoji) {
		return Photo{}, errEmojiOnly
	}
	actor = strings.TrimSpace(actor)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Photo{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var existing string
	err = tx.QueryRowContext(ctx, `
		SELECT emoji FROM photo_reactions WHERE photo_id = $1 AND actor_handle = $2`, photoID, actor).Scan(&existing)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Photo{}, err
	}
	if errors.Is(err, sql.ErrNoRows) {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO photo_reactions (photo_id, actor_handle, emoji) VALUES ($1, $2, $3)`, photoID, actor, emoji); err != nil {
			return Photo{}, err
		}
	} else if existing == emoji {
		if _, err := tx.ExecContext(ctx, `
			DELETE FROM photo_reactions WHERE photo_id = $1 AND actor_handle = $2`, photoID, actor); err != nil {
			return Photo{}, err
		}
	} else {
		if _, err := tx.ExecContext(ctx, `
			UPDATE photo_reactions SET emoji = $3 WHERE photo_id = $1 AND actor_handle = $2`, photoID, actor, emoji); err != nil {
			return Photo{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Photo{}, err
	}
	profile, err := s.Profile(ctx, handle)
	if err != nil {
		return Photo{}, err
	}
	for _, photo := range profile.Photos {
		if photo.ID == photoID {
			return photo, nil
		}
	}
	return Photo{}, errNotFound
}

func (s *PostGISStore) SetAvatar(ctx context.Context, handle, contentType string, image []byte) (HostProfile, error) {
	if err := validateAvatar(contentType, image); err != nil {
		return HostProfile{}, err
	}
	result, err := s.db.ExecContext(ctx, `
		UPDATE profiles SET avatar = $2, avatar_type = $3 WHERE lower(handle) = lower($1)`,
		strings.TrimSpace(handle), image, contentType)
	if err != nil {
		return HostProfile{}, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return HostProfile{}, err
	}
	if updated == 0 {
		return HostProfile{}, errNotFound
	}
	return s.Profile(ctx, handle)
}
