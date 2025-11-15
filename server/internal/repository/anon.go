// Package repository defines repository interfaces for the application.
package repository

import (
	"context"

	"github.com/yashikota/scene-hunter/server/internal/domain/auth"
)

// AnonRepository defines the interface for anonymous token storage.
type AnonRepository interface {
	// SaveRefreshToken stores a refresh token with TTL.
	SaveRefreshToken(ctx context.Context, token *auth.RefreshToken) error

	// GetRefreshToken retrieves a refresh token by ID.
	GetRefreshToken(ctx context.Context, tokenID string) (*auth.RefreshToken, error)

	// MarkRefreshTokenAsUsed marks a refresh token as used (atomic operation).
	MarkRefreshTokenAsUsed(ctx context.Context, tokenID string) error

	// RevokeRefreshToken deletes a refresh token.
	RevokeRefreshToken(ctx context.Context, tokenID string) error

	// RevokeAllAnonTokens revokes all refresh tokens for an anon_id.
	RevokeAllAnonTokens(ctx context.Context, anonID string) error
}
