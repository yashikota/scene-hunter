package game

import "github.com/yashikota/scene-hunter/server/internal/util/errors"

var (
	// ErrInvalidHintNumber is returned when a hint number is invalid.
	ErrInvalidHintNumber = errors.New("invalid hint number: must be between 1 and 5")
)

// Hint represents a single hint for hunters.
type Hint struct {
	HintNumber int    `json:"hintNumber"`
	Text       string `json:"text"`
}

// NewHint creates a new Hint.
func NewHint(hintNumber int, text string) (*Hint, error) {
	if hintNumber < 1 || hintNumber > 5 {
		return nil, ErrInvalidHintNumber
	}

	return &Hint{
		HintNumber: hintNumber,
		Text:       text,
	}, nil
}
