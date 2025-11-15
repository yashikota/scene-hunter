package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/yashikota/scene-hunter/server/internal/domain/auth"
)

// IdentityRepository defines the interface for user identity storage.
type IdentityRepository interface {
	// CreateIdentity creates a new user identity.
	CreateIdentity(ctx context.Context, identity *auth.Identity) error

	// GetIdentityByProviderAndSubject retrieves an identity by provider and subject.
	GetIdentityByProviderAndSubject(
		ctx context.Context,
		provider, subject string,
	) (*auth.Identity, error)

	// GetIdentitiesByUserID retrieves all identities for a user.
	GetIdentitiesByUserID(ctx context.Context, userID uuid.UUID) ([]*auth.Identity, error)

	// DeleteIdentity deletes an identity.
	DeleteIdentity(ctx context.Context, identityID uuid.UUID) error
}
