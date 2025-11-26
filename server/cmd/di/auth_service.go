package di

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	infradb "github.com/yashikota/scene-hunter/server/internal/infra/db"
	"github.com/yashikota/scene-hunter/server/internal/infra/db/queries"
	authsvc "github.com/yashikota/scene-hunter/server/internal/service/auth"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// authServiceHandler implements Connect RPC AuthService interface with transaction support.
type authServiceHandler struct {
	service  *authsvc.Service
	dbClient *infradb.Client
}

// newAuthServiceHandler creates a new auth service handler.
func newAuthServiceHandler(service *authsvc.Service, dbClient *infradb.Client) *authServiceHandler {
	return &authServiceHandler{
		service:  service,
		dbClient: dbClient,
	}
}

// IssueAnon issues new anonymous tokens.
func (s *authServiceHandler) IssueAnon(
	ctx context.Context,
	req *scene_hunterv1.IssueAnonRequest,
) (*scene_hunterv1.IssueAnonResponse, error) {
	//nolint:wrapcheck // wrapper delegates to service, error wrapping done in service layer
	return s.service.IssueAnon(ctx, req)
}

// RefreshAnon refreshes anonymous tokens.
func (s *authServiceHandler) RefreshAnon(
	ctx context.Context,
	req *scene_hunterv1.RefreshAnonRequest,
) (*scene_hunterv1.RefreshAnonResponse, error) {
	//nolint:wrapcheck // wrapper delegates to service, error wrapping done in service layer
	return s.service.RefreshAnon(ctx, req)
}

// RevokeAnon revokes anonymous tokens.
func (s *authServiceHandler) RevokeAnon(
	ctx context.Context,
	req *scene_hunterv1.RevokeAnonRequest,
) (*scene_hunterv1.RevokeAnonResponse, error) {
	//nolint:wrapcheck // wrapper delegates to service, error wrapping done in service layer
	return s.service.RevokeAnon(ctx, req)
}

// UpgradeAnonWithGoogle upgrades anonymous user with Google OAuth.
func (s *authServiceHandler) UpgradeAnonWithGoogle(
	ctx context.Context,
	req *scene_hunterv1.UpgradeAnonWithGoogleRequest,
) (*scene_hunterv1.UpgradeAnonWithGoogleResponse, error) {
	// Prepare the upgrade (validate tokens, check existing users, etc.)
	preparedData, err := s.service.PrepareGoogleUpgrade(ctx, req)
	if err != nil {
		//nolint:wrapcheck // wrapper delegates to service, error wrapping done in service layer
		return nil, err
	}

	// If user already exists, return the session without transaction
	if preparedData.ExistingIdentity != nil {
		//nolint:wrapcheck // wrapper delegates to service
		return s.service.CompleteExistingUserUpgrade(ctx, preparedData)
	}

	// Execute transaction for new user creation
	return s.executeUpgradeTransaction(ctx, preparedData, req)
}

// LoginWithGoogle handles direct Google login without anonymous token.
func (s *authServiceHandler) LoginWithGoogle(
	ctx context.Context,
	req *scene_hunterv1.LoginWithGoogleRequest,
) (*scene_hunterv1.LoginWithGoogleResponse, error) {
	// Prepare the login (validate tokens, check existing users, etc.)
	preparedData, err := s.service.PrepareGoogleLogin(ctx, req)
	if err != nil {
		//nolint:wrapcheck // wrapper delegates to service, error wrapping done in service layer
		return nil, err
	}

	// If user already exists, return the session without transaction
	if preparedData.ExistingIdentity != nil {
		//nolint:wrapcheck // wrapper delegates to service
		return s.service.CompleteExistingUserLogin(ctx, preparedData)
	}

	// Execute transaction for new user creation
	return s.executeLoginTransaction(ctx, preparedData)
}

// executeUpgradeTransaction handles the database transaction for upgrade.
func (s *authServiceHandler) executeUpgradeTransaction(
	ctx context.Context,
	preparedData *authsvc.PreparedUpgradeData,
	req *scene_hunterv1.UpgradeAnonWithGoogleRequest,
) (*scene_hunterv1.UpgradeAnonWithGoogleResponse, error) {
	dbTx, err := s.dbClient.Begin(ctx)
	if err != nil {
		return nil, errors.Errorf("failed to start transaction: %w", err)
	}

	committed := false

	var txErr error

	defer func() {
		if !committed && txErr != nil {
			_ = dbTx.Rollback(ctx)
		}
	}()

	qtx := s.dbClient.Queries.WithTx(dbTx)

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

	if txErr = dbTx.Commit(ctx); txErr != nil {
		return nil, errors.Errorf("failed to commit transaction: %w", txErr)
	}

	committed = true

	//nolint:wrapcheck // wrapper delegates to service
	return s.service.CompleteNewUserUpgrade(ctx, preparedData, req)
}

// executeLoginTransaction handles the database transaction for login.
func (s *authServiceHandler) executeLoginTransaction(
	ctx context.Context,
	preparedData *authsvc.PreparedLoginData,
) (*scene_hunterv1.LoginWithGoogleResponse, error) {
	dbTx, err := s.dbClient.Begin(ctx)
	if err != nil {
		return nil, errors.Errorf("failed to start transaction: %w", err)
	}

	committed := false

	var txErr error

	defer func() {
		if !committed && txErr != nil {
			_ = dbTx.Rollback(ctx)
		}
	}()

	qtx := s.dbClient.Queries.WithTx(dbTx)

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

	if txErr = dbTx.Commit(ctx); txErr != nil {
		return nil, errors.Errorf("failed to commit transaction: %w", txErr)
	}

	committed = true

	//nolint:wrapcheck // wrapper delegates to service
	return s.service.CompleteNewUserLogin(ctx, preparedData)
}
