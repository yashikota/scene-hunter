package di

import (
	"context"

	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	authhandler "github.com/yashikota/scene-hunter/server/internal/handler/auth"
	infradb "github.com/yashikota/scene-hunter/server/internal/infra/db"
	authsvc "github.com/yashikota/scene-hunter/server/internal/service/auth"
)

// authServiceHandler implements Connect RPC AuthService interface with handler support.
type authServiceHandler struct {
	service        *authsvc.Service
	upgradeHandler *authhandler.UpgradeServiceHandler
	loginHandler   *authhandler.LoginServiceHandler
}

// newAuthServiceHandler creates a new auth service with handler support.
func newAuthServiceHandler(service *authsvc.Service, dbClient *infradb.Client) *authServiceHandler {
	return &authServiceHandler{
		service:        service,
		upgradeHandler: authhandler.NewUpgradeServiceHandler(service, dbClient),
		loginHandler:   authhandler.NewLoginServiceHandler(service, dbClient),
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
	//nolint:wrapcheck // wrapper delegates to handler, error wrapping done in handler layer
	return s.upgradeHandler.UpgradeAnonWithGoogle(ctx, req)
}

// LoginWithGoogle handles direct Google login without anonymous token.
func (s *authServiceHandler) LoginWithGoogle(
	ctx context.Context,
	req *scene_hunterv1.LoginWithGoogleRequest,
) (*scene_hunterv1.LoginWithGoogleResponse, error) {
	//nolint:wrapcheck // wrapper delegates to handler, error wrapping done in handler layer
	return s.loginHandler.LoginWithGoogle(ctx, req)
}
