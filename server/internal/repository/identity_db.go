package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/yashikota/scene-hunter/server/internal/domain/auth"
	"github.com/yashikota/scene-hunter/server/internal/infra/db"
	"github.com/yashikota/scene-hunter/server/internal/infra/db/queries"
	"github.com/yashikota/scene-hunter/server/internal/service"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// IdentityRepositoryDB implements IdentityRepository interface using Postgres.
type IdentityRepositoryDB struct {
	DB *db.Client
}

// NewIdentityRepository creates a new IdentityRepository.
func NewIdentityRepository(dbClient *db.Client) service.IdentityRepository {
	return &IdentityRepositoryDB{
		DB: dbClient,
	}
}

// CreateIdentity creates a new user identity.
func (r *IdentityRepositoryDB) CreateIdentity(
	ctx context.Context,
	identity *auth.Identity,
) error {
	var email pgtype.Text
	if identity.Email != "" {
		email.String = identity.Email
		email.Valid = true
	}

	_, err := r.DB.Queries.CreateUserIdentity(ctx, queries.CreateUserIdentityParams{
		ID:        identity.ID,
		UserID:    identity.UserID,
		Provider:  identity.Provider,
		Subject:   identity.Subject,
		Email:     email,
		CreatedAt: identity.CreatedAt,
	})
	if err != nil {
		return errors.Errorf("failed to create identity: %w", err)
	}

	return nil
}

// GetIdentityByProviderAndSubject retrieves an identity by provider and subject.
func (r *IdentityRepositoryDB) GetIdentityByProviderAndSubject(
	ctx context.Context,
	provider, subject string,
) (*auth.Identity, error) {
	row, err := r.DB.Queries.GetUserIdentityByProviderAndSubject(
		ctx,
		queries.GetUserIdentityByProviderAndSubjectParams{
			Provider: provider,
			Subject:  subject,
		},
	)
	if err != nil {
		return nil, errors.Errorf("failed to get identity: %w", err)
	}

	return &auth.Identity{
		ID:        row.ID,
		UserID:    row.UserID,
		Provider:  row.Provider,
		Subject:   row.Subject,
		Email:     row.Email.String,
		CreatedAt: row.CreatedAt,
	}, nil
}

// GetIdentitiesByUserID retrieves all identities for a user.
func (r *IdentityRepositoryDB) GetIdentitiesByUserID(
	ctx context.Context,
	userID uuid.UUID,
) ([]*auth.Identity, error) {
	rows, err := r.DB.Queries.GetUserIdentitiesByUserID(ctx, userID)
	if err != nil {
		return nil, errors.Errorf("failed to get identities: %w", err)
	}

	identities := make([]*auth.Identity, len(rows))
	for i, row := range rows {
		identities[i] = &auth.Identity{
			ID:        row.ID,
			UserID:    row.UserID,
			Provider:  row.Provider,
			Subject:   row.Subject,
			Email:     row.Email.String,
			CreatedAt: row.CreatedAt,
		}
	}

	return identities, nil
}

// DeleteIdentity deletes an identity.
func (r *IdentityRepositoryDB) DeleteIdentity(ctx context.Context, identityID uuid.UUID) error {
	err := r.DB.Queries.DeleteUserIdentity(ctx, identityID)
	if err != nil {
		return errors.Errorf("failed to delete identity: %w", err)
	}

	return nil
}
