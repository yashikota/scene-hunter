// Package room represents a game room domain.
package room

import (
	"time"

	"github.com/google/uuid"
)

const expirationHours = 24

// Room represents a game room.
type Room struct {
	ID        uuid.UUID
	Code      string
	ExpiredAt time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}

// NewRoom creates a new Room with the given code.
func NewRoom(code string) *Room {
	roomID, err := uuid.NewV7()
	if err != nil {
		panic(err)
	}

	now := time.Now()
	expiredAt := now.Add(expirationHours * time.Hour)

	return &Room{
		ID:        roomID,
		Code:      code,
		ExpiredAt: expiredAt,
		CreatedAt: now,
		UpdatedAt: now,
	}
}
