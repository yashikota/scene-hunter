package handler

import (
	"context"

	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	authhandler "github.com/yashikota/scene-hunter/server/internal/handler/auth"
	"github.com/yashikota/scene-hunter/server/internal/infra/db"
	authsvc "github.com/yashikota/scene-hunter/server/internal/service/auth"
)

// AuthService implements Connect RPC AuthService interface with handler support.
type AuthService struct {
	service        *authsvc.Service
	upgradeHandler *authhandler.UpgradeServiceHandler
}

// NewAuthService creates a new auth service with handler support.
func NewAuthService(service *authsvc.Service, dbClient *db.Client) *AuthService {
	return &AuthService{
		service:        service,
		upgradeHandler: authhandler.NewUpgradeServiceHandler(service, dbClient),
	}
}

// IssueAnon issues new anonymous tokens.
func (s *AuthService) IssueAnon(
	ctx context.Context,
	req *scene_hunterv1.IssueAnonRequest,
) (*scene_hunterv1.IssueAnonResponse, error) {
	//nolint:wrapcheck // wrapper delegates to service, error wrapping done in service layer
	return s.service.IssueAnon(ctx, req)
}

// RefreshAnon refreshes anonymous tokens.
func (s *AuthService) RefreshAnon(
	ctx context.Context,
	req *scene_hunterv1.RefreshAnonRequest,
) (*scene_hunterv1.RefreshAnonResponse, error) {
	//nolint:wrapcheck // wrapper delegates to service, error wrapping done in service layer
	return s.service.RefreshAnon(ctx, req)
}

// RevokeAnon revokes anonymous tokens.
func (s *AuthService) RevokeAnon(
	ctx context.Context,
	req *scene_hunterv1.RevokeAnonRequest,
) (*scene_hunterv1.RevokeAnonResponse, error) {
	//nolint:wrapcheck // wrapper delegates to service, error wrapping done in service layer
	return s.service.RevokeAnon(ctx, req)
}

// UpgradeAnonWithGoogle upgrades anonymous user with Google OAuth.
func (s *AuthService) UpgradeAnonWithGoogle(
	ctx context.Context,
	req *scene_hunterv1.UpgradeAnonWithGoogleRequest,
) (*scene_hunterv1.UpgradeAnonWithGoogleResponse, error) {
	//nolint:wrapcheck // wrapper delegates to handler, error wrapping done in handler layer
	return s.upgradeHandler.UpgradeAnonWithGoogle(ctx, req)
}
