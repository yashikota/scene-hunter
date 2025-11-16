// Package auth provides authentication services.
package auth

import (
	"context"
	"os"
	"strings"

	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	"github.com/yashikota/scene-hunter/server/internal/config"
	domainauth "github.com/yashikota/scene-hunter/server/internal/domain/auth"
	"github.com/yashikota/scene-hunter/server/internal/repository"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

// Service implements the AuthService.
type Service struct {
	anonRepo       repository.AnonRepository
	identityRepo   repository.IdentityRepository
	tokenSigner    *domainauth.TokenSigner
	googleVerifier *GoogleVerifier
	config         *config.AppConfig
}

// NewService creates a new auth Service.
func NewService(
	anonRepo repository.AnonRepository,
	identityRepo repository.IdentityRepository,
	cfg *config.AppConfig,
) *Service {
	// Get HMAC secret from environment
	hmacSecret := os.Getenv("AUTH_HMAC_SECRET")
	if hmacSecret == "" {
		panic("AUTH_HMAC_SECRET environment variable is required")
	}

	// Initialize Google verifier
	googleVerifier := NewGoogleVerifier()

	return &Service{
		anonRepo:       anonRepo,
		identityRepo:   identityRepo,
		tokenSigner:    domainauth.NewTokenSigner([]byte(hmacSecret)),
		googleVerifier: googleVerifier,
		config:         cfg,
	}
}

// IssueAnon issues new anonymous tokens.
func (s *Service) IssueAnon(
	ctx context.Context,
	req *scene_hunterv1.IssueAnonRequest,
) (*scene_hunterv1.IssueAnonResponse, error) {
	// Generate new anon_id
	anonID, err := domainauth.GenerateAnonID()
	if err != nil {
		return nil, errors.Errorf("failed to generate anon ID: %w", err)
	}

	// Create access token
	accessToken, err := s.tokenSigner.SignAnonToken(anonID, s.config.Auth.AccessTokenTTL)
	if err != nil {
		return nil, errors.Errorf("failed to sign access token: %w", err)
	}

	// Create refresh token
	userAgent := ""
	if req.GetClient() != nil {
		userAgent = req.GetClient().GetUserAgent()
	}

	refreshToken, rawRefreshToken, err := domainauth.NewRefreshToken(
		anonID,
		userAgent,
		s.config.Auth.RefreshTokenTTL,
	)
	if err != nil {
		return nil, errors.Errorf("failed to create refresh token: %w", err)
	}

	// Save refresh token
	if err := s.anonRepo.SaveRefreshToken(ctx, refreshToken); err != nil {
		return nil, errors.Errorf("failed to save refresh token: %w", err)
	}

	res := &scene_hunterv1.IssueAnonResponse{
		AccessToken: &scene_hunterv1.Token{
			Token:         accessToken.Token,
			ExpiresAtUnix: accessToken.ExpiresAt.Unix(),
		},
		RefreshToken: &scene_hunterv1.Token{
			Token:         rawRefreshToken,
			ExpiresAtUnix: refreshToken.ExpiresAt.Unix(),
		},
	}

	return res, nil
}

// RefreshAnon refreshes anonymous tokens.
func (s *Service) RefreshAnon(
	ctx context.Context,
	req *scene_hunterv1.RefreshAnonRequest,
) (*scene_hunterv1.RefreshAnonResponse, error) {
	rawToken := req.GetRefreshToken()

	// Parse token: ID:secret
	parts := strings.Split(rawToken, ":")
	if len(parts) != 2 {
		return nil, errors.Errorf("invalid refresh token format")
	}

	tokenID := parts[0]
	tokenSecret := parts[1]

	// Get refresh token
	storedToken, err := s.anonRepo.GetRefreshToken(ctx, tokenID)
	if err != nil {
		return nil, errors.Errorf("invalid refresh token")
	}

	// Verify token secret
	secretHash := domainauth.HashToken(tokenSecret)
	if storedToken.TokenHash != secretHash {
		return nil, errors.Errorf("invalid refresh token")
	}

	// Validate token
	if !storedToken.IsValid() {
		return nil, errors.Errorf("refresh token expired or used")
	}

	// Mark old token as used
	if err := s.anonRepo.MarkRefreshTokenAsUsed(ctx, tokenID); err != nil {
		return nil, errors.Errorf("failed to mark refresh token as used: %w", err)
	}

	// Create new access token
	accessToken, err := s.tokenSigner.SignAnonToken(
		storedToken.AnonID,
		s.config.Auth.AccessTokenTTL,
	)
	if err != nil {
		return nil, errors.Errorf("failed to sign new access token: %w", err)
	}

	// Create new refresh token
	userAgent := ""
	if req.GetClient() != nil {
		userAgent = req.GetClient().GetUserAgent()
	}

	newRefreshToken, rawNewRefreshToken, err := domainauth.NewRefreshToken(
		storedToken.AnonID,
		userAgent,
		s.config.Auth.RefreshTokenTTL,
	)
	if err != nil {
		return nil, errors.Errorf("failed to create new refresh token: %w", err)
	}

	// Save new refresh token
	if err := s.anonRepo.SaveRefreshToken(ctx, newRefreshToken); err != nil {
		return nil, errors.Errorf("failed to save new refresh token: %w", err)
	}

	// Revoke old token (already marked as used, but clean up)
	_ = s.anonRepo.RevokeRefreshToken(ctx, tokenID)

	res := &scene_hunterv1.RefreshAnonResponse{
		AccessToken: &scene_hunterv1.Token{
			Token:         accessToken.Token,
			ExpiresAtUnix: accessToken.ExpiresAt.Unix(),
		},
		RefreshToken: &scene_hunterv1.Token{
			Token:         rawNewRefreshToken,
			ExpiresAtUnix: newRefreshToken.ExpiresAt.Unix(),
		},
	}

	return res, nil
}

// RevokeAnon revokes anonymous tokens.
func (s *Service) RevokeAnon(
	ctx context.Context,
	req *scene_hunterv1.RevokeAnonRequest,
) (*scene_hunterv1.RevokeAnonResponse, error) {
	rawToken := req.GetRefreshToken()

	// Parse token: ID:secret
	parts := strings.Split(rawToken, ":")
	if len(parts) != 2 {
		return nil, errors.Errorf("invalid refresh token format")
	}

	tokenID := parts[0]

	// Revoke the refresh token
	err := s.anonRepo.RevokeRefreshToken(ctx, tokenID)
	if err != nil {
		return nil, errors.Errorf("failed to revoke refresh token: %w", err)
	}

	res := &scene_hunterv1.RevokeAnonResponse{}

	return res, nil
}

// LoginWithGoogle is a placeholder - use LoginWithGoogleWithDB instead.
func (s *Service) LoginWithGoogle(
	ctx context.Context,
	req *scene_hunterv1.LoginWithGoogleRequest,
) (*scene_hunterv1.LoginWithGoogleResponse, error) {
	return nil, errors.Errorf("login requires database client - use LoginWithGoogleWithDB")
}
