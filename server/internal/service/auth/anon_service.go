// Package auth provides authentication services.
package auth

import (
	"context"
	"os"

	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	domainauth "github.com/yashikota/scene-hunter/server/internal/domain/auth"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
	"github.com/yashikota/scene-hunter/server/util/config"
)

// Service implements the AuthService.
type Service struct {
	anonRepo     domainauth.AnonRepository
	identityRepo domainauth.IdentityRepository
	tokenSigner  *domainauth.TokenSigner
	config       *config.AppConfig
}

// NewService creates a new auth Service.
func NewService(
	anonRepo domainauth.AnonRepository,
	identityRepo domainauth.IdentityRepository,
	cfg *config.AppConfig,
) *Service {
	// Get HMAC secret from environment
	hmacSecret := os.Getenv("AUTH_HMAC_SECRET")
	if hmacSecret == "" {
		panic("AUTH_HMAC_SECRET environment variable is required")
	}

	return &Service{
		anonRepo:     anonRepo,
		identityRepo: identityRepo,
		tokenSigner:  domainauth.NewTokenSigner([]byte(hmacSecret)),
		config:       cfg,
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
		return nil, err
	}

	// Create access token
	accessToken, err := s.tokenSigner.SignAnonToken(anonID, s.config.Auth.AccessTokenTTL)
	if err != nil {
		return nil, err
	}

	// Create refresh token
	userAgent := ""
	if req.GetClient() != nil {
		userAgent = req.GetClient().GetUserAgent()
	}

	refreshToken, err := domainauth.NewRefreshToken(
		anonID,
		userAgent,
		s.config.Auth.RefreshTokenTTL,
	)
	if err != nil {
		return nil, err
	}

	// Save refresh token
	if err := s.anonRepo.SaveRefreshToken(ctx, refreshToken); err != nil {
		return nil, err
	}

	res := &scene_hunterv1.IssueAnonResponse{
		AccessToken: &scene_hunterv1.Token{
			Token:         accessToken.Token,
			ExpiresAtUnix: accessToken.ExpiresAt.Unix(),
		},
		RefreshToken: &scene_hunterv1.Token{
			Token:         refreshToken.GetRawToken(),
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
	refreshTokenID := req.GetRefreshToken()

	// Get refresh token
	storedToken, err := s.anonRepo.GetRefreshToken(ctx, refreshTokenID)
	if err != nil {
		return nil, errors.Errorf("invalid refresh token")
	}

	// Validate token
	if !storedToken.IsValid() {
		return nil, errors.Errorf("refresh token expired or used")
	}

	// Mark old token as used
	if err := s.anonRepo.MarkRefreshTokenAsUsed(ctx, refreshTokenID); err != nil {
		return nil, err
	}

	// Create new access token
	accessToken, err := s.tokenSigner.SignAnonToken(
		storedToken.AnonID,
		s.config.Auth.AccessTokenTTL,
	)
	if err != nil {
		return nil, err
	}

	// Create new refresh token
	userAgent := ""
	if req.GetClient() != nil {
		userAgent = req.GetClient().GetUserAgent()
	}

	newRefreshToken, err := domainauth.NewRefreshToken(
		storedToken.AnonID,
		userAgent,
		s.config.Auth.RefreshTokenTTL,
	)
	if err != nil {
		return nil, err
	}

	// Save new refresh token
	if err := s.anonRepo.SaveRefreshToken(ctx, newRefreshToken); err != nil {
		return nil, err
	}

	// Revoke old token (already marked as used, but clean up)
	_ = s.anonRepo.RevokeRefreshToken(ctx, refreshTokenID)

	res := &scene_hunterv1.RefreshAnonResponse{
		AccessToken: &scene_hunterv1.Token{
			Token:         accessToken.Token,
			ExpiresAtUnix: accessToken.ExpiresAt.Unix(),
		},
		RefreshToken: &scene_hunterv1.Token{
			Token:         newRefreshToken.GetRawToken(),
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
	refreshTokenID := req.GetRefreshToken()

	// Revoke the refresh token
	err := s.anonRepo.RevokeRefreshToken(ctx, refreshTokenID)
	if err != nil {
		return nil, err
	}

	res := &scene_hunterv1.RevokeAnonResponse{}

	return res, nil
}
