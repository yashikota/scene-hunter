package auth

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	"github.com/yashikota/scene-hunter/server/internal/infra/db"
	"github.com/yashikota/scene-hunter/server/internal/infra/db/queries"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// UpgradeAnonWithGoogle implements the Connect RPC method by delegating to handler logic.
func (s *Service) UpgradeAnonWithGoogle(
	ctx context.Context,
	req *scene_hunterv1.UpgradeAnonWithGoogleRequest,
) (*scene_hunterv1.UpgradeAnonWithGoogleResponse, error) {
	// This method needs dbClient for transaction, so it must be provided
	// For now, return an error if dbClient is not available
	return nil, errors.Errorf("upgrade requires database client - use UpgradeAnonWithGoogleWithDB")
}

// UpgradeAnonWithGoogleWithDB handles the upgrade with database transactions.
// This should be called from handler layer with dbClient.
func (s *Service) UpgradeAnonWithGoogleWithDB(
	ctx context.Context,
	req *scene_hunterv1.UpgradeAnonWithGoogleRequest,
	dbClient *db.Client,
) (*scene_hunterv1.UpgradeAnonWithGoogleResponse, error) {
	// Prepare the upgrade (validate tokens, check existing users, etc.)
	preparedData, err := s.PrepareGoogleUpgrade(ctx, req)
	if err != nil {
		return nil, err
	}

	// If user already exists, return the session without transaction
	if preparedData.ExistingIdentity != nil {
		return s.CompleteExistingUserUpgrade(ctx, preparedData)
	}

	// Start transaction for new user creation
	dbTx, err := dbClient.Begin(ctx)
	if err != nil {
		return nil, errors.Errorf("failed to start transaction: %w", err)
	}

	// Track whether transaction has been committed
	committed := false

	var txErr error

	// Ensure rollback on error
	defer func() {
		if !committed && txErr != nil {
			_ = dbTx.Rollback(ctx)
		}
	}()

	// Create user and identity within transaction
	qtx := dbClient.Queries.WithTx(dbTx)

	_, txErr = qtx.CreateUser(ctx, queries.CreateUserParams{
		ID:        preparedData.NewUser.ID,
		Code:      preparedData.NewUser.Code,
		Name:      preparedData.NewUser.Name,
		CreatedAt: preparedData.NewUser.CreatedAt,
		UpdatedAt: preparedData.NewUser.UpdatedAt,
		DeletedAt: preparedData.NewUser.DeletedAt,
	})
	if txErr != nil {
		return nil, errors.Errorf("failed to create user: %w", txErr)
	}

	_, txErr = qtx.CreateUserIdentity(ctx, queries.CreateUserIdentityParams{
		ID:       preparedData.Identity.ID,
		UserID:   preparedData.Identity.UserID,
		Provider: preparedData.Identity.Provider,
		Subject:  preparedData.Identity.Subject,
		Email: pgtype.Text{
			String: preparedData.Identity.Email,
			Valid:  preparedData.Identity.Email != "",
		},
		CreatedAt: preparedData.Identity.CreatedAt,
	})
	if txErr != nil {
		return nil, errors.Errorf("failed to create identity: %w", txErr)
	}

	// Commit transaction
	if txErr = dbTx.Commit(ctx); txErr != nil {
		return nil, errors.Errorf("failed to commit transaction: %w", txErr)
	}

	committed = true

	// Complete the upgrade process (revoke tokens, create session, etc.)
	return s.CompleteNewUserUpgrade(ctx, preparedData, req)
}
