package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/domain/room"
)

// RoomRepository defines the interface for room persistence.
type RoomRepository interface {
	Create(ctx context.Context, room *room.Room) error
	Get(ctx context.Context, id uuid.UUID) (*room.Room, error)
	Update(ctx context.Context, room *room.Room) error
	Delete(ctx context.Context, id uuid.UUID) error
	Exists(ctx context.Context, id uuid.UUID) (bool, error)
}
