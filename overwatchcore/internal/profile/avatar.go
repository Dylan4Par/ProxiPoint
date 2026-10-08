package profile

import (
	"bytes"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	"mime"
	"strings"
)

const maxAvatarBytes = 1536 * 1024

var errAvatarType = errors.New("profile picture must be an image")

func validateAvatar(contentType string, raw []byte) error {
	media, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return errAvatarType
	}
	switch strings.ToLower(media) {
	case "image/jpeg", "image/png", "image/gif":
	default:
		return errAvatarType
	}
	if len(raw) == 0 || len(raw) > maxAvatarBytes {
		return errAvatarType
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || config.Width < 1 || config.Height < 1 {
		return errAvatarType
	}
	return nil
}
