package trust

import "testing"

func TestCoordinatorQualification(t *testing.T) {
	if QualifiesAsVerifiedCoordinator(4, 4) {
		t.Fatal("four perfect drops are not enough")
	}
	if QualifiesAsVerifiedCoordinator(5, 4) {
		t.Fatal("80 percent of five drops is under 85")
	}
	if QualifiesAsVerifiedCoordinator(100, 84) {
		t.Fatal("84 percent is under the bar")
	}
	if !QualifiesAsVerifiedCoordinator(5, 5) || !QualifiesAsVerifiedCoordinator(100, 85) {
		t.Fatal("five perfect drops and an exact 85 percent score both qualify")
	}
}

func TestViperReputationRoundsTo94(t *testing.T) {
	if got := PositivePercent(48, 45); got != 94 {
		t.Fatalf("percent = %d, want 94", got)
	}
	if !QualifiesAsVerifiedCoordinator(48, 45) {
		t.Fatal("Viper-2 should be a verified coordinator")
	}
}

func TestEmptyHistoryCannotQualify(t *testing.T) {
	if PositiveRatio(0, 9) != 0 || PositiveRatio(-1, -3) != 0 {
		t.Fatal("empty or negative history should score zero")
	}
	if QualifiesAsVerifiedCoordinator(0, 0) {
		t.Fatal("no drops is not a coordinator")
	}
}
