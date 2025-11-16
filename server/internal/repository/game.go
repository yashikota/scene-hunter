package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/domain/game"
)

// GameRepository defines the interface for game persistence.
type GameRepository interface {
	Create(ctx context.Context, gameSession *game.Game) error
	Get(ctx context.Context, roomID uuid.UUID) (*game.Game, error)
	Update(ctx context.Context, gameSession *game.Game) error
	Delete(ctx context.Context, roomID uuid.UUID) error
	Exists(ctx context.Context, roomID uuid.UUID) (bool, error)
}
