// Package auth provides authentication handlers.
package auth

import (
	"context"

	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	"github.com/yashikota/scene-hunter/server/internal/infra/db"
	authsvc "github.com/yashikota/scene-hunter/server/internal/service/auth"
)

// UpgradeServiceHandler wraps auth service and provides transaction support.
type UpgradeServiceHandler struct {
	authSvc  *authsvc.Service
	dbClient *db.Client
}

// NewUpgradeServiceHandler creates a handler that adds DB transaction support.
func NewUpgradeServiceHandler(
	authSvc *authsvc.Service,
	dbClient *db.Client,
) *UpgradeServiceHandler {
	return &UpgradeServiceHandler{
		authSvc:  authSvc,
		dbClient: dbClient,
	}
}

// UpgradeAnonWithGoogle handles Google OAuth upgrade with transaction management.
func (h *UpgradeServiceHandler) UpgradeAnonWithGoogle(
	ctx context.Context,
	req *scene_hunterv1.UpgradeAnonWithGoogleRequest,
) (*scene_hunterv1.UpgradeAnonWithGoogleResponse, error) {
	//nolint:wrapcheck // handler delegates to service, error wrapping done in service layer
	return h.authSvc.UpgradeAnonWithGoogleWithDB(ctx, req, h.dbClient)
}
