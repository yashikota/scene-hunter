// Package room represents a game room domain.
package room

import (
	"time"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

const expirationHours = 24

var (
	// ErrRoomAlreadyExists is returned when a room already exists.
	ErrRoomAlreadyExists = errors.New("room already exists")
	// ErrRoomNotFound is returned when a room is not found.
	ErrRoomNotFound = errors.New("room not found")
	// ErrRoomExpired is returned when a room has expired.
	ErrRoomExpired = errors.New("room already expired")
	// ErrRoomRequired is returned when a room is required but not provided.
	ErrRoomRequired = errors.New("room is required")
)

// Room represents a game room.
type Room struct {
	ID        uuid.UUID `json:"id"`
	Code      string    `json:"code"`
	ExpiredAt time.Time `json:"expiredAt"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
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
