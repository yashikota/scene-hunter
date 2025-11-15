package auth

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	domainauth "github.com/yashikota/scene-hunter/server/internal/domain/auth"
	domainuser "github.com/yashikota/scene-hunter/server/internal/domain/user"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// PrepareGoogleUpgrade prepares the upgrade by validating tokens and checking for existing users.
func (s *Service) PrepareGoogleUpgrade(
	ctx context.Context,
	req *scene_hunterv1.UpgradeAnonWithGoogleRequest,
) (*PreparedUpgradeData, error) {
	// Verify anon access token
	anonToken, err := s.tokenSigner.VerifyAnonToken(req.GetAnonAccessToken())
	if err != nil {
		return nil, errors.Errorf("invalid anon access token")
	}

	// Verify Google OAuth code and get ID token
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

	preparedData := &PreparedUpgradeData{
		AnonToken:        anonToken,
		IDToken:          idToken,
		ExistingIdentity: existingIdentity,
	}

	// If user doesn't exist, prepare new user and identity
	if existingIdentity == nil {
		// Create new permanent user
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

		preparedData.NewUser = newUser
		preparedData.Identity = identity
	}

	return preparedData, nil
}

// CompleteExistingUserUpgrade completes the upgrade for an existing user.
func (s *Service) CompleteExistingUserUpgrade(
	ctx context.Context,
	data *PreparedUpgradeData,
) (*scene_hunterv1.UpgradeAnonWithGoogleResponse, error) {
	// User already exists, just revoke anon tokens and return session
	if err := s.anonRepo.RevokeAllAnonTokens(ctx, data.AnonToken.AnonID); err != nil {
		// Log but don't fail
	}

	// Create user session token
	userSession, err := s.tokenSigner.SignAnonToken(
		data.ExistingIdentity.UserID.String(),
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
		UserId:          data.ExistingIdentity.UserID.String(),
	}

	return res, nil
}

// CompleteNewUserUpgrade completes the upgrade for a new user (after transaction commit).
func (s *Service) CompleteNewUserUpgrade(
	ctx context.Context,
	data *PreparedUpgradeData,
	req *scene_hunterv1.UpgradeAnonWithGoogleRequest,
) (*scene_hunterv1.UpgradeAnonWithGoogleResponse, error) {
	// This would involve:
	// 1. Find all data associated with anonToken.AnonID
	// 2. Associate it with newUser.ID
	// 3. Update references
	migratedRecords := uint32(0)

	// Revoke all anonymous tokens
	if err := s.anonRepo.RevokeAllAnonTokens(ctx, data.AnonToken.AnonID); err != nil {
		// Log but don't fail
	}

	// Parse and revoke the specific refresh token
	rawRefreshToken := req.GetAnonRefreshToken()
	if rawRefreshToken != "" {
		parts := strings.Split(rawRefreshToken, ":")
		if len(parts) == 2 {
			tokenID := parts[0]
			if err := s.anonRepo.RevokeRefreshToken(ctx, tokenID); err != nil {
				// Log but don't fail
			}
		}
	}

	// Create permanent user session token
	userSession, err := s.tokenSigner.SignAnonToken(
		data.NewUser.ID.String(),
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
		UserId:          data.NewUser.ID.String(),
	}

	return res, nil
}

// generateUserCode generates a unique user code.
// This is a simplified implementation.
func generateUserCode() string {
	// Generate a random user code
	// Current implementation: Use first 8 characters of UUID (collision risk exists)
	// Recommended: Implement retry logic with database uniqueness check
	userID := uuid.New()

	return userID.String()[:8]
}
