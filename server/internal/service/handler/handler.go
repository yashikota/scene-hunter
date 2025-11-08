// Package handler provides HTTP handler registration for all services.
package handler

import (
	"connectrpc.com/connect"
	"connectrpc.com/validate"
	"github.com/go-chi/chi/v5"
	"github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1/scene_hunterv1connect"
	domainblob "github.com/yashikota/scene-hunter/server/internal/domain/blob"
	domaindb "github.com/yashikota/scene-hunter/server/internal/domain/db"
	"github.com/yashikota/scene-hunter/server/internal/domain/health"
	domainkvs "github.com/yashikota/scene-hunter/server/internal/domain/kvs"
	"github.com/yashikota/scene-hunter/server/internal/infra/blob"
	"github.com/yashikota/scene-hunter/server/internal/infra/chrono"
	infradb "github.com/yashikota/scene-hunter/server/internal/infra/db"
	"github.com/yashikota/scene-hunter/server/internal/infra/kvs"
	healthsvc "github.com/yashikota/scene-hunter/server/internal/service/health"
	imagesvc "github.com/yashikota/scene-hunter/server/internal/service/image"
	"github.com/yashikota/scene-hunter/server/internal/service/status"
)

// Dependencies は外部依存を集約する構造体.
type Dependencies struct {
	DBClient   domaindb.DB
	KVSClient  domainkvs.KVS
	BlobClient domainblob.Blob
}

// RegisterHandlers registers all service handlers to the router.
func RegisterHandlers(mux *chi.Mux, deps *Dependencies) {
	interceptors := connect.WithInterceptors(
		validate.NewInterceptor(),
	)

	chronoProvider := chrono.New()

	// Health service
	healthService := healthsvc.NewService(chronoProvider)
	healthPath, healthHandler := scene_hunterv1connect.NewHealthServiceHandler(
		healthService,
		interceptors,
	)
	mux.Mount(healthPath, healthHandler)

	// Status service
	if deps != nil {
		checkers := []health.Checker{}
		if deps.DBClient != nil {
			checkers = append(checkers, infradb.NewHealthChecker(deps.DBClient))
		}

		if deps.KVSClient != nil {
			checkers = append(checkers, kvs.NewHealthChecker(deps.KVSClient))
		}

		if deps.BlobClient != nil {
			checkers = append(checkers, blob.NewHealthChecker(deps.BlobClient))
		}

		statusService := status.NewService(checkers, chronoProvider)
		statusPath, statusHandler := scene_hunterv1connect.NewStatusServiceHandler(
			statusService,
			interceptors,
		)
		mux.Mount(statusPath, statusHandler)

		// Image service
		if deps.BlobClient != nil && deps.KVSClient != nil {
			imageService := imagesvc.NewService(deps.BlobClient, deps.KVSClient)
			imagePath, imageHandler := scene_hunterv1connect.NewImageServiceHandler(
				imageService,
				interceptors,
			)
			mux.Mount(imagePath, imageHandler)
		}
	}
}
