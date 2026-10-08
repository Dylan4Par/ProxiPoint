package profile

import (
	"context"
	"strings"
	"testing"
)

func TestPhotosAreStoredAsImagesAndReactionsAreEmojiOnly(t *testing.T) {
	store := NewMemoryStore()
	profile, err := store.Profile(context.Background(), "Ranger-F0A5ACCF")
	if err != nil {
		t.Fatal(err)
	}
	if len(profile.Photos) != 2 {
		t.Fatalf("photos = %d", len(profile.Photos))
	}
	latest := profile.Photos[0]
	if latest.ContentType != "image/png" || len(latest.ImageBase64) < 100 {
		t.Fatalf("latest image was not stored, type %s len %d", latest.ContentType, len(latest.ImageBase64))
	}
	if !strings.Contains(latest.EventTitle, "Midnight Owls") {
		t.Fatalf("latest event = %s", latest.EventTitle)
	}

	photo, err := store.React(context.Background(), profile.Handle, latest.ID, "ranger", "🔥")
	if err != nil {
		t.Fatal(err)
	}
	if !hasReaction(photo.Reactions, "ranger", "🔥") {
		t.Fatalf("missing fire reaction: %+v", photo.Reactions)
	}

	photo, err = store.React(context.Background(), profile.Handle, latest.ID, "ranger", "🔥")
	if err != nil {
		t.Fatal(err)
	}
	if hasReaction(photo.Reactions, "ranger", "🔥") {
		t.Fatal("tapping the same emoji should remove it")
	}

	if _, err := store.React(context.Background(), profile.Handle, latest.ID, "ranger", "nice show"); err == nil {
		t.Fatal("text reactions must be rejected")
	}
}

func TestSchemaStoresImageBytes(t *testing.T) {
	sqlText, err := schemaSQL()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sqlText, "image BYTEA NOT NULL") {
		t.Fatal("profile photos must store the image bytes")
	}
	if strings.Contains(sqlText, "comment") {
		t.Fatal("photo reactions must not store comment text")
	}
	if !strings.Contains(sqlText, "avatar BYTEA") {
		t.Fatal("profiles must store an uploaded avatar")
	}
}

func TestAvatarUploadStoresImageBytes(t *testing.T) {
	store := NewMemoryStore()
	png := scenePNG(nightStage)
	updated, err := store.SetAvatar(context.Background(), "Ranger-F0A5ACCF", "image/png", png)
	if err != nil {
		t.Fatal(err)
	}
	if updated.AvatarType != "image/png" || len(updated.AvatarBase64) < 100 || len(updated.Avatar) != 0 {
		t.Fatalf("avatar was not stored as image bytes, type %s b64 %d raw %d", updated.AvatarType, len(updated.AvatarBase64), len(updated.Avatar))
	}

	if _, err := store.SetAvatar(context.Background(), "Ranger-F0A5ACCF", "text/plain", png); err == nil {
		t.Fatal("non-image uploads must be rejected")
	}
	if _, err := store.SetAvatar(context.Background(), "Ranger-F0A5ACCF", "image/png", []byte("not-a-png")); err == nil {
		t.Fatal("invalid image bytes must be rejected")
	}
	huge := make([]byte, maxAvatarBytes+1)
	if _, err := store.SetAvatar(context.Background(), "Ranger-F0A5ACCF", "image/png", huge); err == nil {
		t.Fatal("oversized uploads must be rejected")
	}
}

func hasReaction(reactions []Reaction, actor, emoji string) bool {
	for _, reaction := range reactions {
		if reaction.Actor == actor && reaction.Emoji == emoji {
			return true
		}
	}
	return false
}
