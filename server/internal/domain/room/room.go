package room

import (
	"time"

	"github.com/google/uuid"
)

type Room struct {
	ID        uuid.UUID
	Code      string
	ExpiredAt time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}

func NewRoom(code string) *Room {
	id, err := uuid.NewV7()
	if err != nil {
		panic(err)
	}

	now := time.Now()
	expiredAt := now.Add(24 * time.Hour)

	return &Room{
		ID:        id,
		Code:      code,
		ExpiredAt: expiredAt,
		CreatedAt: now,
		UpdatedAt: now,
	}
}
