package game

import (
	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

var (
	// ErrInvalidScore is returned when a score is invalid.
	ErrInvalidScore = errors.New("invalid score: must be between 0 and 100")
	// ErrInvalidRemainingSeconds is returned when remaining seconds is invalid.
	ErrInvalidRemainingSeconds = errors.New("invalid remaining seconds: must be between 0 and 60")
)

// RoundResult represents the result of a single round for a player.
type RoundResult struct {
	UserID           uuid.UUID `json:"userId"`
	Score            int       `json:"score"`
	RemainingSeconds int       `json:"remainingSeconds"`
	Points           int       `json:"points"`
}

// NewRoundResult creates a new RoundResult.
func NewRoundResult(userID uuid.UUID, score, remainingSeconds int) (*RoundResult, error) {
	if score < 0 || score > 100 {
		return nil, ErrInvalidScore
	}

	if remainingSeconds < 0 || remainingSeconds > 60 {
		return nil, ErrInvalidRemainingSeconds
	}

	points := score + remainingSeconds

	return &RoundResult{
		UserID:           userID,
		Score:            score,
		RemainingSeconds: remainingSeconds,
		Points:           points,
	}, nil
}
