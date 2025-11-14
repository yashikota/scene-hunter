package auth

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	domainauth "github.com/yashikota/scene-hunter/server/internal/domain/auth"
	domainuser "github.com/yashikota/scene-hunter/server/internal/domain/user"
	infraauth "github.com/yashikota/scene-hunter/server/internal/infra/auth"
	"github.com/yashikota/scene-hunter/server/internal/infra/db/queries"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// UpgradeAnonWithGoogle upgrades an anonymous user to a permanent user with Google OAuth.
func (s *Service) UpgradeAnonWithGoogle(
	ctx context.Context,
	req *scene_hunterv1.UpgradeAnonWithGoogleRequest,
) (*scene_hunterv1.UpgradeAnonWithGoogleResponse, error) {
	// Verify anon access token
	anonToken, err := s.tokenSigner.VerifyAnonToken(req.GetAnonAccessToken())
	if err != nil {
		return nil, errors.Errorf("invalid anon access token")
	}

	// Verify Google OAuth code and get ID token
	// Get redirect URI from config
	redirectURI := s.config.Auth.GoogleRedirectURI

	tokenResp, err := s.googleVerifier.ExchangeCodeForToken(
		ctx,
		req.GetAuthorizationCode(),
		req.GetCodeVerifier(),
		redirectURI,
	)
	if err != nil {
		return nil, errors.Errorf("failed to exchange code: %w", err)
	}

	// Verify ID token
	idToken, err := s.googleVerifier.VerifyIDToken(ctx, tokenResp.IDToken)
	if err != nil {
		return nil, errors.Errorf("invalid ID token: %w", err)
	}

	// Check if user already exists with this Google account
	existingIdentity, err := s.identityRepo.GetIdentityByProviderAndSubject(
		ctx,
		"google",
		idToken.Sub,
	)
	
	// Handle database errors properly
	if err != nil {
		// Check if it's a "not found" error
		if !errors.Is(err, pgx.ErrNoRows) {
			// If it's not "not found", it's a real database error
			return nil, errors.Errorf("failed to check existing identity: %w", err)
		}
		// If it's "not found", continue to create new user
		existingIdentity = nil
	}
	
	if existingIdentity != nil {
		// User already exists, just revoke anon tokens and return session
		//nolint:staticcheck,noinlineerr // Intentionally ignoring errors to not fail upgrade on token revocation
		if err := s.anonRepo.RevokeAllAnonTokens(ctx, anonToken.AnonID); err != nil {
			// Log but don't fail
		}

		// Create user session token (reusing anon token mechanism for now)
		userSession, err := s.tokenSigner.SignAnonToken(
			existingIdentity.UserID.String(),
			s.config.Auth.AccessTokenTTL,
		)
		if err != nil {
			return nil, errors.Errorf("failed to sign user session token: %w", err)
		}

		res := &scene_hunterv1.UpgradeAnonWithGoogleResponse{
			UserSession: &scene_hunterv1.Token{
				Token:         userSession.Token,
				ExpiresAtUnix: userSession.ExpiresAt.Unix(),
			},
			MigratedRecords: 0,
			UserId:          existingIdentity.UserID.String(),
		}

		return res, nil
	}

	// Create new permanent user
	// Generate a unique user code (simplified - in production, ensure uniqueness)
	userCode := generateUserCode()

	userName := idToken.Name
	if userName == "" {
		userName = idToken.Email
	}

	newUser := domainuser.NewUser(userCode, userName)

	// Create identity
	identity, err := domainauth.GoogleIdentity(newUser.ID, idToken.Sub, idToken.Email)
	if err != nil {
		return nil, errors.Errorf("failed to create Google identity: %w", err)
	}

	// Get database client for transaction
	identityRepo, ok := s.identityRepo.(*infraauth.IdentityRepository)
	if !ok {
		return nil, errors.Errorf("invalid identity repository type")
	}

	dbClient := identityRepo.DB

	// Start transaction
	dbTx, err := dbClient.Begin(ctx)
	if err != nil {
		return nil, errors.Errorf("failed to start transaction: %w", err)
	}

	// Track whether transaction has been committed
	committed := false
	
	// Ensure rollback on error
	defer func() {
		if !committed && err != nil {
			_ = dbTx.Rollback(ctx)
		}
	}()

	// Create user in database (within transaction)
	qtx := dbClient.Queries.WithTx(dbTx)
	_, err = qtx.CreateUser(ctx, queries.CreateUserParams{
		ID:        newUser.ID,
		Code:      newUser.Code,
		Name:      newUser.Name,
		CreatedAt: newUser.CreatedAt,
		UpdatedAt: newUser.UpdatedAt,
		DeletedAt: newUser.DeletedAt,
	})
	if err != nil {
		return nil, errors.Errorf("failed to create user: %w", err)
	}

	// Create identity (within transaction)
	_, err = qtx.CreateUserIdentity(ctx, queries.CreateUserIdentityParams{
		ID:       identity.ID,
		UserID:   identity.UserID,
		Provider: identity.Provider,
		Subject:  identity.Subject,
		Email: pgtype.Text{
			String: identity.Email,
			Valid:  identity.Email != "",
		},
		CreatedAt: identity.CreatedAt,
	})
	if err != nil {
		return nil, errors.Errorf("failed to create identity: %w", err)
	}

	// Commit transaction
	//nolint:noinlineerr // Inline error handling is clearer here
	if err = dbTx.Commit(ctx); err != nil {
		return nil, errors.Errorf("failed to commit transaction: %w", err)
	}
	committed = true

	//nolint:godox // TODO: Migrate anonymous data from Valkey to Postgres
	// This would involve:
	// 1. Find all data associated with anonToken.AnonID
	// 2. Associate it with newUser.ID
	// 3. Update references
	migratedRecords := uint32(0)

	// Revoke all anonymous tokens
	//nolint:staticcheck,noinlineerr // Intentionally ignoring errors to not fail upgrade on token revocation
	if err := s.anonRepo.RevokeAllAnonTokens(ctx, anonToken.AnonID); err != nil {
		// Log but don't fail
	}

	// Parse and revoke the specific refresh token
	rawRefreshToken := req.GetAnonRefreshToken()
	if rawRefreshToken != "" {
		parts := strings.Split(rawRefreshToken, ":")
		if len(parts) == 2 {
			tokenID := parts[0]
			//nolint:staticcheck // Intentionally ignoring errors to not fail upgrade on token revocation
			if err := s.anonRepo.RevokeRefreshToken(ctx, tokenID); err != nil {
				// Log but don't fail
			}
		}
	}

	// Create permanent user session token
	userSession, err := s.tokenSigner.SignAnonToken(
		newUser.ID.String(),
		s.config.Auth.AccessTokenTTL,
	)
	if err != nil {
		return nil, errors.Errorf("failed to sign user session token: %w", err)
	}

	res := &scene_hunterv1.UpgradeAnonWithGoogleResponse{
		UserSession: &scene_hunterv1.Token{
			Token:         userSession.Token,
			ExpiresAtUnix: userSession.ExpiresAt.Unix(),
		},
		MigratedRecords: migratedRecords,
		UserId:          newUser.ID.String(),
	}

	return res, nil
}

// generateUserCode generates a unique user code.
// This is a simplified implementation.
func generateUserCode() string {
	// Generate a random user code
	//nolint:godox // TODO: Ensure uniqueness by checking database and retrying on collision
	// Current implementation: Use first 8 characters of UUID (collision risk exists)
	// Recommended: Implement retry logic with database uniqueness check
	userID := uuid.New()

	return userID.String()[:8]
}
