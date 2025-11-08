// Package handler provides HTTP handler registration for all services.
package handler

import (
	"context"

	"connectrpc.com/connect"
	"connectrpc.com/validate"
	"github.com/go-chi/chi/v5"
	"github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1/scene_hunterv1connect"
	domainblob "github.com/yashikota/scene-hunter/server/internal/domain/blob"
	domainchrono "github.com/yashikota/scene-hunter/server/internal/domain/chrono"
	domaindb "github.com/yashikota/scene-hunter/server/internal/domain/db"
	"github.com/yashikota/scene-hunter/server/internal/domain/health"
	domainkvs "github.com/yashikota/scene-hunter/server/internal/domain/kvs"
	"github.com/yashikota/scene-hunter/server/internal/infra/chrono"
	healthsvc "github.com/yashikota/scene-hunter/server/internal/service/health"
	imagesvc "github.com/yashikota/scene-hunter/server/internal/service/image"
	"github.com/yashikota/scene-hunter/server/internal/service/status"
)

// failedChecker は初期化に失敗した依存を表すヘルスチェッカー.
type failedChecker struct {
	name string
	err  error
}

func (f *failedChecker) Check(_ context.Context) error {
	return f.err
}

func (f *failedChecker) Name() string {
	return f.name
}

// Dependencies は外部依存を集約する構造体.
type Dependencies struct {
	DBClient   domaindb.DB
	DBError    error
	KVSClient  domainkvs.KVS
	KVSError   error
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
	if deps == nil {
		return
	}

	registerStatusService(mux, deps, chronoProvider, interceptors)
	registerImageService(mux, deps, interceptors)
}

func registerStatusService(
	mux *chi.Mux,
	deps *Dependencies,
	chronoProvider domainchrono.Chrono,
	interceptors connect.Option,
) {
	checkers := buildHealthCheckers(deps)

	statusService := status.NewService(checkers, chronoProvider)
	statusPath, statusHandler := scene_hunterv1connect.NewStatusServiceHandler(
		statusService,
		interceptors,
	)
	mux.Mount(statusPath, statusHandler)
}

func buildHealthCheckers(deps *Dependencies) []health.Checker {
	checkers := []health.Checker{}

	// DBクライアントのヘルスチェック
	if deps.DBClient != nil {
		// DBClient自体がhealth.Checkerを実装している
		if checker, ok := deps.DBClient.(health.Checker); ok {
			checkers = append(checkers, checker)
		}
	} else if deps.DBError != nil {
		checkers = append(checkers, &failedChecker{name: "postgres", err: deps.DBError})
	}

	// KVSクライアントのヘルスチェック
	if deps.KVSClient != nil {
		// KVSClient自体がhealth.Checkerを実装している
		if checker, ok := deps.KVSClient.(health.Checker); ok {
			checkers = append(checkers, checker)
		}
	} else if deps.KVSError != nil {
		checkers = append(checkers, &failedChecker{name: "valkey", err: deps.KVSError})
	}

	// Blobクライアントのヘルスチェック
	if deps.BlobClient != nil {
		// BlobClient自体がhealth.Checkerを実装している
		if checker, ok := deps.BlobClient.(health.Checker); ok {
			checkers = append(checkers, checker)
		}
	}

	return checkers
}

func registerImageService(mux *chi.Mux, deps *Dependencies, interceptors connect.Option) {
	if deps.BlobClient == nil || deps.KVSClient == nil {
		return
	}

	imageService := imagesvc.NewService(deps.BlobClient, deps.KVSClient)
	imagePath, imageHandler := scene_hunterv1connect.NewImageServiceHandler(
		imageService,
		interceptors,
	)
	mux.Mount(imagePath, imageHandler)
}
