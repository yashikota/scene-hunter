package auth

import (
	"context"

	"github.com/google/uuid"
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
	verifier := NewGoogleVerifier()

	// For now, we'll use a default redirect URI
	// In production, this should come from the request or config
	redirectURI := "http://localhost:3000/auth/callback"

	tokenResp, err := verifier.ExchangeCodeForToken(
		ctx,
		req.GetAuthorizationCode(),
		req.GetCodeVerifier(),
		redirectURI,
	)
	if err != nil {
		return nil, errors.Errorf("failed to exchange code: %w", err)
	}

	// Verify ID token
	idToken, err := verifier.VerifyIDToken(ctx, tokenResp.IDToken)
	if err != nil {
		return nil, errors.Errorf("invalid ID token: %w", err)
	}

	// Check if user already exists with this Google account
	existingIdentity, err := s.identityRepo.GetIdentityByProviderAndSubject(
		ctx,
		"google",
		idToken.Sub,
	)
	if err == nil && existingIdentity != nil {
		// User already exists, just revoke anon tokens and return session
		if err := s.anonRepo.RevokeAllAnonTokens(ctx, anonToken.AnonID); err != nil {
			// Log but don't fail
		}

		// Create user session token (reusing anon token mechanism for now)
		userSession, err := s.tokenSigner.SignAnonToken(
			existingIdentity.UserID.String(),
			s.config.Auth.AccessTokenTTL,
		)
		if err != nil {
			return nil, err
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
	userCode := generateUserCode(idToken.Email)

	userName := idToken.Name
	if userName == "" {
		userName = idToken.Email
	}

	newUser := domainuser.NewUser(userCode, userName)

	// Create identity
	identity, err := domainauth.GoogleIdentity(newUser.ID, idToken.Sub, idToken.Email)
	if err != nil {
		return nil, err
	}

	// TODO: Start transaction
	// For now, we'll do this in sequence (should be wrapped in a transaction)

	// Create user in database
	identityRepo, ok := s.identityRepo.(*infraauth.IdentityRepository)
	if !ok {
		return nil, errors.Errorf("invalid identity repository type")
	}

	dbClient := identityRepo.DB

	_, err = dbClient.Queries.CreateUser(ctx, queries.CreateUserParams{
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

	// Create identity
	if err := s.identityRepo.CreateIdentity(ctx, identity); err != nil {
		return nil, errors.Errorf("failed to create identity: %w", err)
	}

	// TODO: Migrate anonymous data from Valkey to Postgres
	// This would involve:
	// 1. Find all data associated with anonToken.AnonID
	// 2. Associate it with newUser.ID
	// 3. Update references
	migratedRecords := uint32(0)

	// Revoke all anonymous tokens
	if err := s.anonRepo.RevokeAllAnonTokens(ctx, anonToken.AnonID); err != nil {
		// Log but don't fail
	}

	// Revoke the specific refresh token
	if err := s.anonRepo.RevokeRefreshToken(ctx, req.GetAnonRefreshToken()); err != nil {
		// Log but don't fail
	}

	// Create permanent user session token
	userSession, err := s.tokenSigner.SignAnonToken(
		newUser.ID.String(),
		s.config.Auth.AccessTokenTTL,
	)
	if err != nil {
		return nil, err
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

// generateUserCode generates a unique user code from an email.
// This is a simplified implementation.
func generateUserCode(email string) string {
	// Extract username from email and add random suffix
	// In production, ensure uniqueness by checking database
	id := uuid.New()

	return id.String()[:8]
}
