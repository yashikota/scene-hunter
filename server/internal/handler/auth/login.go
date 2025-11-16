package auth

import (
	"context"

	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	"github.com/yashikota/scene-hunter/server/internal/infra/db"
	authsvc "github.com/yashikota/scene-hunter/server/internal/service/auth"
)

// LoginServiceHandler wraps auth service and provides transaction support for login.
type LoginServiceHandler struct {
	authSvc  *authsvc.Service
	dbClient *db.Client
}

// NewLoginServiceHandler creates a handler that adds DB transaction support for login.
func NewLoginServiceHandler(
	authSvc *authsvc.Service,
	dbClient *db.Client,
) *LoginServiceHandler {
	return &LoginServiceHandler{
		authSvc:  authSvc,
		dbClient: dbClient,
	}
}

// LoginWithGoogle handles direct Google login with transaction management.
func (h *LoginServiceHandler) LoginWithGoogle(
	ctx context.Context,
	req *scene_hunterv1.LoginWithGoogleRequest,
) (*scene_hunterv1.LoginWithGoogleResponse, error) {
	//nolint:wrapcheck // handler delegates to service, error wrapping done in service layer
	return h.authSvc.LoginWithGoogleWithDB(ctx, req, h.dbClient)
}
