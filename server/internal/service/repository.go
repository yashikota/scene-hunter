// Package service provides business logic implementations.
package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/domain/auth"
	"github.com/yashikota/scene-hunter/server/internal/domain/game"
	"github.com/yashikota/scene-hunter/server/internal/domain/room"
)

// GameRepository defines the interface for game persistence.
type GameRepository interface {
	Create(ctx context.Context, gameSession *game.Game) error
	Get(ctx context.Context, roomID uuid.UUID) (*game.Game, error)
	Update(ctx context.Context, gameSession *game.Game) error
	Delete(ctx context.Context, roomID uuid.UUID) error
	Exists(ctx context.Context, roomID uuid.UUID) (bool, error)
}

// RoomRepository defines the interface for room persistence.
type RoomRepository interface {
	Create(ctx context.Context, room *room.Room) error
	Get(ctx context.Context, id uuid.UUID) (*room.Room, error)
	Update(ctx context.Context, room *room.Room) error
	Delete(ctx context.Context, id uuid.UUID) error
	Exists(ctx context.Context, id uuid.UUID) (bool, error)
}

// AnonRepository defines the interface for anonymous token storage.
type AnonRepository interface {
	SaveRefreshToken(ctx context.Context, token *auth.RefreshToken) error
	GetRefreshToken(ctx context.Context, tokenID string) (*auth.RefreshToken, error)
	MarkRefreshTokenAsUsed(ctx context.Context, tokenID string) error
	RevokeRefreshToken(ctx context.Context, tokenID string) error
	RevokeAllAnonTokens(ctx context.Context, anonID string) error
}

// IdentityRepository defines the interface for user identity storage.
type IdentityRepository interface {
	CreateIdentity(ctx context.Context, identity *auth.Identity) error
	GetIdentityByProviderAndSubject(
		ctx context.Context,
		provider, subject string,
	) (*auth.Identity, error)
	GetIdentitiesByUserID(ctx context.Context, userID uuid.UUID) ([]*auth.Identity, error)
	DeleteIdentity(ctx context.Context, identityID uuid.UUID) error
}
