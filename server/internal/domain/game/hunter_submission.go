package game

import (
	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// ErrInvalidSubmittedAtSeconds is returned when submitted_at_seconds is invalid.
var ErrInvalidSubmittedAtSeconds = errors.New(
	"invalid submitted_at_seconds: must be between 0 and 60",
)

// HunterSubmission represents a hunter's photo submission.
type HunterSubmission struct {
	UserID             uuid.UUID `json:"userId"`
	ImageID            string    `json:"imageId"`
	SubmittedAtSeconds int       `json:"submittedAtSeconds"`
}

// NewHunterSubmission creates a new HunterSubmission.
func NewHunterSubmission(
	userID uuid.UUID,
	imageID string,
	submittedAtSeconds int,
) (*HunterSubmission, error) {
	if submittedAtSeconds < 0 || submittedAtSeconds > 60 {
		return nil, ErrInvalidSubmittedAtSeconds
	}

	if imageID == "" {
		return nil, errors.New("image ID is required")
	}

	return &HunterSubmission{
		UserID:             userID,
		ImageID:            imageID,
		SubmittedAtSeconds: submittedAtSeconds,
	}, nil
}
