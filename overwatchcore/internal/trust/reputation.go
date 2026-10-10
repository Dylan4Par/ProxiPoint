package trust

const (
	// VerifiedMinDrops is the smallest drop history that can earn a coordinator badge.
	VerifiedMinDrops = 5
	// VerifiedMinRatio is the minimum upvote-to-drop score for that badge.
	VerifiedMinRatio = 0.85
)

// PositiveRatio is upvoteCount / totalDrops. Empty histories score zero.
func PositiveRatio(totalDrops, upvoteCount int) float64 {
	drops := normalize(totalDrops)
	upvotes := normalize(upvoteCount)
	if drops == 0 {
		return 0
	}
	return float64(upvotes) / float64(drops)
}

// PositivePercent rounds the ratio to a whole percent. 45/48 is 94.
func PositivePercent(totalDrops, upvoteCount int) int {
	return int(PositiveRatio(totalDrops, upvoteCount)*100 + 0.5)
}

// QualifiesAsVerifiedCoordinator is true at 5+ drops and an 85%+ score.
func QualifiesAsVerifiedCoordinator(totalDrops, upvoteCount int) bool {
	drops := normalize(totalDrops)
	if drops < VerifiedMinDrops {
		return false
	}
	return PositiveRatio(drops, upvoteCount) >= VerifiedMinRatio
}

func normalize(value int) int {
	if value < 0 {
		return 0
	}
	return value
}
