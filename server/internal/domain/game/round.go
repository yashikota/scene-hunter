package game

import (
	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// TurnStatus represents the current status of a turn.
type TurnStatus int

const (
	// TurnStatusGameMaster represents game master's turn.
	TurnStatusGameMaster TurnStatus = iota + 1
	// TurnStatusHunters represents hunters' turn.
	TurnStatusHunters
)

var (
	// ErrInvalidRoundNumber is returned when a round number is invalid.
	ErrInvalidRoundNumber = errors.New("invalid round number")
	// ErrGameMasterImageNotSet is returned when game master image is not set.
	ErrGameMasterImageNotSet = errors.New("game master image not set")
)

// Round represents a single round in the game.
type Round struct {
	RoundNumber         int            `json:"roundNumber"`
	GameMasterUserID    uuid.UUID      `json:"gameMasterUserId"`
	GameMasterImageID   string         `json:"gameMasterImageId"`
	Hints               []*Hint        `json:"hints"`
	Results             []*RoundResult `json:"results"`
	TurnStatus          TurnStatus     `json:"turnStatus"`
	TurnElapsedSeconds  int            `json:"turnElapsedSeconds"`
}

// NewRound creates a new Round.
func NewRound(roundNumber int, gameMasterUserID uuid.UUID) (*Round, error) {
	if roundNumber < 1 {
		return nil, ErrInvalidRoundNumber
	}

	return &Round{
		RoundNumber:        roundNumber,
		GameMasterUserID:   gameMasterUserID,
		Hints:              make([]*Hint, 0),
		Results:            make([]*RoundResult, 0),
		TurnStatus:         TurnStatusGameMaster,
		TurnElapsedSeconds: 0,
	}, nil
}

// SetGameMasterImage sets the game master's image ID.
func (r *Round) SetGameMasterImage(imageID string) {
	r.GameMasterImageID = imageID
}

// AddHint adds a hint to the round.
func (r *Round) AddHint(hint *Hint) {
	r.Hints = append(r.Hints, hint)
}

// SetHints sets all hints at once.
func (r *Round) SetHints(hints []*Hint) {
	r.Hints = hints
}

// StartHuntersTurn starts the hunters' turn.
func (r *Round) StartHuntersTurn() error {
	if r.GameMasterImageID == "" {
		return ErrGameMasterImageNotSet
	}

	r.TurnStatus = TurnStatusHunters
	r.TurnElapsedSeconds = 0

	return nil
}

// AddResult adds a result to the round.
func (r *Round) AddResult(result *RoundResult) {
	r.Results = append(r.Results, result)
}

// UpdateTurnElapsedSeconds updates the elapsed seconds in the current turn.
func (r *Round) UpdateTurnElapsedSeconds(seconds int) {
	r.TurnElapsedSeconds = seconds
}

// GetHintsUpToTime returns hints that should be visible at the given elapsed time.
// First hint is visible at 0 seconds, then one more every 10 seconds.
func (r *Round) GetHintsUpToTime(elapsedSeconds int) []*Hint {
	// First hint at 0s, second at 10s, third at 20s, fourth at 30s, fifth at 40s
	numHints := (elapsedSeconds / 10) + 1
	if numHints > len(r.Hints) {
		numHints = len(r.Hints)
	}

	return r.Hints[:numHints]
}
