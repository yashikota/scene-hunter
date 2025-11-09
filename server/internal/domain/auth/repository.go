package auth

import (
	"context"

	"github.com/google/uuid"
)

// AnonRepository defines the interface for anonymous token storage.
type AnonRepository interface {
	// SaveRefreshToken stores a refresh token with TTL.
	SaveRefreshToken(ctx context.Context, token *RefreshToken) error

	// GetRefreshToken retrieves a refresh token by ID.
	GetRefreshToken(ctx context.Context, tokenID string) (*RefreshToken, error)

	// MarkRefreshTokenAsUsed marks a refresh token as used (atomic operation).
	MarkRefreshTokenAsUsed(ctx context.Context, tokenID string) error

	// RevokeRefreshToken deletes a refresh token.
	RevokeRefreshToken(ctx context.Context, tokenID string) error

	// RevokeAllAnonTokens revokes all refresh tokens for an anon_id.
	RevokeAllAnonTokens(ctx context.Context, anonID string) error
}

// IdentityRepository defines the interface for user identity storage.
type IdentityRepository interface {
	// CreateIdentity creates a new user identity.
	CreateIdentity(ctx context.Context, identity *Identity) error

	// GetIdentityByProviderAndSubject retrieves an identity by provider and subject.
	GetIdentityByProviderAndSubject(
		ctx context.Context,
		provider, subject string,
	) (*Identity, error)

	// GetIdentitiesByUserID retrieves all identities for a user.
	GetIdentitiesByUserID(ctx context.Context, userID uuid.UUID) ([]*Identity, error)

	// DeleteIdentity deletes an identity.
	DeleteIdentity(ctx context.Context, identityID uuid.UUID) error
}
