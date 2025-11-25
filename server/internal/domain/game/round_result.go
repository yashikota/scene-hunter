package game

import (
	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

var (
	// ErrInvalidRank is returned when a rank is invalid.
	ErrInvalidRank = errors.New("invalid rank: must be between 1 and 20")
)

// Point values for each rank
const (
	FirstPlacePoints  = 5
	SecondPlacePoints = 3
	ThirdPlacePoints  = 1
	DefaultPoints     = 0
)

// RoundResult represents the result of a single round for a player.
type RoundResult struct {
	UserID uuid.UUID `json:"userId"`
	Rank   int       `json:"rank"`   // Rank assigned by game master (1st, 2nd, 3rd, etc.)
	Points int       `json:"points"` // Points awarded based on rank
}

// NewRoundResult creates a new RoundResult.
func NewRoundResult(userID uuid.UUID, rank int) (*RoundResult, error) {
	if rank < 1 || rank > 20 {
		return nil, ErrInvalidRank
	}

	points := calculatePoints(rank)

	return &RoundResult{
		UserID: userID,
		Rank:   rank,
		Points: points,
	}, nil
}

// calculatePoints calculates points based on rank.
func calculatePoints(rank int) int {
	switch rank {
	case 1:
		return FirstPlacePoints
	case 2:
		return SecondPlacePoints
	case 3:
		return ThirdPlacePoints
	default:
		return DefaultPoints
	}
}
