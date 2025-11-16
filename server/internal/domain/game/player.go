// Package game represents game domain.
package game

import (
	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

var (
	// ErrInvalidPlayerName is returned when a player name is invalid.
	ErrInvalidPlayerName = errors.New("invalid player name")
	// ErrPlayerNotFound is returned when a player is not found.
	ErrPlayerNotFound = errors.New("player not found")
)

// Player represents a player in the game.
type Player struct {
	UserID       uuid.UUID `json:"userId"`
	Name         string    `json:"name"`
	IsGameMaster bool      `json:"isGameMaster"`
	IsAdmin      bool      `json:"isAdmin"`
	TotalPoints  int       `json:"totalPoints"`
	IsConnected  bool      `json:"isConnected"`
}

// NewPlayer creates a new Player.
func NewPlayer(userID uuid.UUID, name string, isGameMaster, isAdmin bool) (*Player, error) {
	if name == "" || len(name) > 20 {
		return nil, ErrInvalidPlayerName
	}

	return &Player{
		UserID:       userID,
		Name:         name,
		IsGameMaster: isGameMaster,
		IsAdmin:      isAdmin,
		TotalPoints:  0,
		IsConnected:  true,
	}, nil
}

// AddPoints adds points to the player's total.
func (p *Player) AddPoints(points int) {
	p.TotalPoints += points
}

// Disconnect marks the player as disconnected.
func (p *Player) Disconnect() {
	p.IsConnected = false
}

// Reconnect marks the player as reconnected.
func (p *Player) Reconnect() {
	p.IsConnected = true
}
