package tags

import "testing"

func TestNormalizeSlug(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{in: "#Food-Trucks!", want: "food-trucks"},
		{in: "Food Trucks", want: "food-trucks"},
		{in: "  LIVE MUSIC  ", want: "live-music"},
		{in: "food--truck", want: "food-truck"},
		{in: "###", want: ""},
		{in: "  ", want: ""},
		{in: "dogs!", want: "dogs"},
		{in: "Craft   Beer", want: "craft-beer"},
		{in: "board_games", want: "boardgames"},
	}
	for _, tc := range cases {
		if got := NormalizeSlug(tc.in); got != tc.want {
			t.Errorf("NormalizeSlug(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestFormatTitleCase(t *testing.T) {
	if got := formatTitleCase("open-mic"); got != "Open Mic" {
		t.Fatalf("formatTitleCase = %q", got)
	}
}
