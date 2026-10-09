package profile

import (
	"bytes"
	"embed"
	"image"
	"image/color"
	"image/png"
	"time"
)

//go:embed schema.sql
var schemaFS embed.FS

func schemaSQL() (string, error) {
	raw, err := schemaFS.ReadFile("schema.sql")
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

// AllowedEmoji is the only reaction a photo accepts. Text comments are not stored.
var AllowedEmoji = []string{"🔥", "👏", "😂", "🎉", "✨", "👀"}

func EmojiAllowed(emoji string) bool {
	for _, allowed := range AllowedEmoji {
		if emoji == allowed {
			return true
		}
	}
	return false
}

type Reaction struct {
	Actor string `json:"actor"`
	Emoji string `json:"emoji"`
}

type Photo struct {
	ID          string     `json:"id"`
	EventTitle  string     `json:"eventTitle"`
	EventPlace  string     `json:"eventPlace"`
	Territory   string     `json:"territory"`
	EventAt     time.Time  `json:"eventAt"`
	ContentType string     `json:"contentType"`
	Image       []byte     `json:"-"`
	ImageBase64 string     `json:"imageBase64,omitempty"`
	Reactions   []Reaction `json:"reactions"`
}

type HostProfile struct {
	Handle       string  `json:"handle"`
	DisplayName  string  `json:"displayName"`
	Following    int     `json:"following"`
	Followers    int     `json:"followers"`
	Activities   int     `json:"activities"`
	Avatar       []byte  `json:"-"`
	AvatarType   string  `json:"avatarType,omitempty"`
	AvatarBase64 string  `json:"avatarBase64,omitempty"`
	Photos       []Photo `json:"photos"`
}

const demoHandle = "Ranger-F0A5ACCF"

func demoProfile() HostProfile {
	return HostProfile{
		Handle:      demoHandle,
		DisplayName: demoHandle,
		Following:   6,
		Followers:   14,
		Activities:  2,
		Photos: []Photo{
			{
				ID:          "photo-owls",
				EventTitle:  "The Midnight Owls • Live at The Rusty Anchor",
				EventPlace:  "The Rusty Anchor",
				Territory:   "Downtown Boulder",
				EventAt:     time.Date(2026, 10, 7, 20, 0, 0, 0, time.UTC),
				ContentType: "image/png",
				Image:       scenePNG(nightStage),
				Reactions: []Reaction{
					{Actor: "anna_vibe", Emoji: "🔥"},
					{Actor: "sam_travels", Emoji: "🎉"},
				},
			},
			{
				ID:          "photo-tacos",
				EventTitle:  "Taco Tuesday Truck Rally • Central Park Plaza",
				EventPlace:  "Central Park Plaza",
				Territory:   "Downtown Boulder",
				EventAt:     time.Date(2026, 10, 6, 17, 30, 0, 0, time.UTC),
				ContentType: "image/png",
				Image:       scenePNG(dayMarket),
				Reactions: []Reaction{
					{Actor: "jordan_ellis", Emoji: "👏"},
				},
			},
		},
	}
}

type sceneKind int

const (
	nightStage sceneKind = iota
	dayMarket
)

func scenePNG(kind sceneKind) []byte {
	const width, height = 320, 180
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	switch kind {
	case nightStage:
		fill(img, color.RGBA{15, 23, 42, 255})
		rect(img, 0, 120, width, height, color.RGBA{30, 41, 59, 255})
		rect(img, 70, 78, 250, 130, color.RGBA{249, 115, 22, 255})
		rect(img, 110, 48, 130, 78, color.RGBA{56, 189, 248, 255})
		rect(img, 190, 48, 210, 78, color.RGBA{250, 204, 21, 255})
	default:
		fill(img, color.RGBA{224, 242, 254, 255})
		rect(img, 0, 110, width, height, color.RGBA{134, 239, 172, 255})
		rect(img, 24, 70, 110, 130, color.RGBA{249, 115, 22, 255})
		rect(img, 120, 58, 210, 130, color.RGBA{250, 204, 21, 255})
		rect(img, 220, 78, 300, 130, color.RGBA{14, 165, 233, 255})
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

func fill(img *image.RGBA, c color.RGBA) {
	rect(img, 0, 0, img.Bounds().Dx(), img.Bounds().Dy(), c)
}

func rect(img *image.RGBA, x0, y0, x1, y1 int, c color.RGBA) {
	bounds := img.Bounds()
	for y := y0; y < y1; y++ {
		for x := x0; x < x1; x++ {
			if image.Pt(x, y).In(bounds) {
				img.SetRGBA(x, y, c)
			}
		}
	}
}

func applyReaction(reactions []Reaction, actor, emoji string) ([]Reaction, error) {
	if !EmojiAllowed(emoji) {
		return reactions, errEmojiOnly
	}
	next := make([]Reaction, 0, len(reactions)+1)
	for _, reaction := range reactions {
		if reaction.Actor == actor {
			if reaction.Emoji == emoji {
				continue
			}
			continue
		}
		next = append(next, reaction)
	}
	replaced := false
	for _, reaction := range reactions {
		if reaction.Actor == actor && reaction.Emoji == emoji {
			replaced = true
			break
		}
	}
	if !replaced {
		next = append(next, Reaction{Actor: actor, Emoji: emoji})
	}
	return next, nil
}
