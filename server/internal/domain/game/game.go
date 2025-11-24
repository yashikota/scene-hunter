// Package game represents game domain.
package game

import (
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// GameStatus represents the current status of the game.
type GameStatus int

const (
	// GameStatusWaiting represents waiting for players to join.
	GameStatusWaiting GameStatus = iota + 1
	// GameStatusInProgress represents game is currently in progress.
	GameStatusInProgress
	// GameStatusFinished represents game has ended.
	GameStatusFinished
)

const (
	// MinPlayers is the minimum number of players required.
	MinPlayers = 3
	// MaxPlayers is the maximum number of players allowed.
	MaxPlayers = 20
	// MinRounds is the minimum number of rounds.
	MinRounds = 1
	// MaxRounds is the maximum number of rounds.
	MaxRounds = 5
)

var (
	// ErrInvalidTotalRounds is returned when total rounds is invalid.
	ErrInvalidTotalRounds = errors.New("invalid total rounds: must be between 1 and 5")
	// ErrNotEnoughPlayers is returned when there are not enough players.
	ErrNotEnoughPlayers = errors.New("not enough players: minimum 3 players required")
	// ErrTooManyPlayers is returned when there are too many players.
	ErrTooManyPlayers = errors.New("too many players: maximum 20 players allowed")
	// ErrGameAlreadyStarted is returned when game has already started.
	ErrGameAlreadyStarted = errors.New("game has already started")
	// ErrGameNotInProgress is returned when game is not in progress.
	ErrGameNotInProgress = errors.New("game is not in progress")
	// ErrGameAlreadyFinished is returned when game has already finished.
	ErrGameAlreadyFinished = errors.New("game has already finished")
	// ErrPlayerAlreadyExists is returned when a player already exists.
	ErrPlayerAlreadyExists = errors.New("player already exists")
	// ErrNoCurrentRound is returned when there is no current round.
	ErrNoCurrentRound = errors.New("no current round")
	// ErrAllRoundsCompleted is returned when all rounds are completed.
	ErrAllRoundsCompleted = errors.New("all rounds completed")
)

// Game represents a game session.
type Game struct {
	RoomID       uuid.UUID  `json:"roomId"`
	Status       GameStatus `json:"status"`
	TotalRounds  int        `json:"totalRounds"`
	CurrentRound int        `json:"currentRound"`
	Players      []*Player  `json:"players"`
	Rounds       []*Round   `json:"rounds"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

// NewGame creates a new Game.
func NewGame(roomID uuid.UUID, totalRounds int, gameMasterUserID uuid.UUID) (*Game, error) {
	if totalRounds < MinRounds || totalRounds > MaxRounds {
		return nil, ErrInvalidTotalRounds
	}

	now := time.Now()

	return &Game{
		RoomID:       roomID,
		Status:       GameStatusWaiting,
		TotalRounds:  totalRounds,
		CurrentRound: 0,
		Players:      make([]*Player, 0),
		Rounds:       make([]*Round, 0),
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
}

// AddPlayer adds a player to the game.
func (g *Game) AddPlayer(player *Player) error {
	if g.Status != GameStatusWaiting {
		return ErrGameAlreadyStarted
	}

	if len(g.Players) >= MaxPlayers {
		return ErrTooManyPlayers
	}

	// Check if player already exists
	for _, p := range g.Players {
		if p.UserID == player.UserID {
			return ErrPlayerAlreadyExists
		}
	}

	g.Players = append(g.Players, player)
	g.UpdatedAt = time.Now()

	return nil
}

// GetPlayer returns a player by user ID.
func (g *Game) GetPlayer(userID uuid.UUID) (*Player, error) {
	for _, p := range g.Players {
		if p.UserID == userID {
			return p, nil
		}
	}

	return nil, ErrPlayerNotFound
}

// Start starts the game.
func (g *Game) Start() error {
	if g.Status != GameStatusWaiting {
		return ErrGameAlreadyStarted
	}

	if len(g.Players) < MinPlayers {
		return ErrNotEnoughPlayers
	}

	g.Status = GameStatusInProgress
	g.UpdatedAt = time.Now()

	return nil
}

// StartRound starts a new round.
func (g *Game) StartRound(gameMasterUserID uuid.UUID) error {
	if g.Status != GameStatusInProgress {
		return ErrGameNotInProgress
	}

	if g.CurrentRound >= g.TotalRounds {
		return ErrAllRoundsCompleted
	}

	g.CurrentRound++

	round, err := NewRound(g.CurrentRound, gameMasterUserID)
	if err != nil {
		return err
	}

	g.Rounds = append(g.Rounds, round)
	g.UpdatedAt = time.Now()

	return nil
}

// GetCurrentRound returns the current round.
func (g *Game) GetCurrentRound() (*Round, error) {
	if g.CurrentRound == 0 || g.CurrentRound > len(g.Rounds) {
		return nil, ErrNoCurrentRound
	}

	return g.Rounds[g.CurrentRound-1], nil
}

// Finish finishes the game.
func (g *Game) Finish() error {
	if g.Status == GameStatusFinished {
		return ErrGameAlreadyFinished
	}

	g.Status = GameStatusFinished
	g.UpdatedAt = time.Now()

	return nil
}

// IsFinished returns true if all rounds are completed.
func (g *Game) IsFinished() bool {
	return g.CurrentRound >= g.TotalRounds
}

// GetFinalRankings returns players sorted by total points (descending).
func (g *Game) GetFinalRankings() []*Player {
	// Create a copy of players slice
	rankings := make([]*Player, len(g.Players))
	copy(rankings, g.Players)

	// Sort by total points (descending) using sort.Slice for better performance
	// This is more efficient than bubble sort, especially for up to 20 players
	sort.Slice(rankings, func(i, j int) bool {
		return rankings[i].TotalPoints > rankings[j].TotalPoints
	})

	return rankings
}

// UpdatePlayerPoints updates a player's points after a round.
func (g *Game) UpdatePlayerPoints(userID uuid.UUID, points int) error {
	player, err := g.GetPlayer(userID)
	if err != nil {
		return err
	}

	player.AddPoints(points)

	g.UpdatedAt = time.Now()

	return nil
}
