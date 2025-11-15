// Package handler provides HTTP handler registration for all services.
package handler

import (
	"context"
	"log/slog"

	"connectrpc.com/connect"
	"connectrpc.com/validate"
	"github.com/go-chi/chi/v5"
	"github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1/scene_hunterv1connect"
	"github.com/yashikota/scene-hunter/server/internal/infra/blob"
	"github.com/yashikota/scene-hunter/server/internal/infra/chrono"
	infradb "github.com/yashikota/scene-hunter/server/internal/infra/db"
	"github.com/yashikota/scene-hunter/server/internal/infra/health"
	"github.com/yashikota/scene-hunter/server/internal/infra/kvs"
	infrarepository "github.com/yashikota/scene-hunter/server/internal/infra/repository"
	authsvc "github.com/yashikota/scene-hunter/server/internal/service/auth"
	healthsvc "github.com/yashikota/scene-hunter/server/internal/service/health"
	imagesvc "github.com/yashikota/scene-hunter/server/internal/service/image"
	"github.com/yashikota/scene-hunter/server/internal/service/middleware"
	roomsvc "github.com/yashikota/scene-hunter/server/internal/service/room"
	"github.com/yashikota/scene-hunter/server/internal/service/status"
	"github.com/yashikota/scene-hunter/server/util/config"
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
	DBClient   *infradb.Client
	DBError    error
	KVSClient  kvs.KVS
	KVSError   error
	BlobClient blob.Blob
	Config     *config.AppConfig
}

// RegisterHandlers registers all service handlers to the router.
func RegisterHandlers(mux *chi.Mux, deps *Dependencies) {
	logger := slog.Default()

	interceptors := connect.WithInterceptors(
		validate.NewInterceptor(),
		NewErrorLoggingInterceptor(logger),
		middleware.AuthInterceptor(),
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
	registerAuthService(mux, deps, interceptors)
	registerImageService(mux, deps, interceptors)
	registerRoomService(mux, deps, interceptors)
}

func registerStatusService(
	mux *chi.Mux,
	deps *Dependencies,
	chronoProvider chrono.Chrono,
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
		checkers = append(checkers, deps.DBClient)
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

	roomRepo := infrarepository.NewRoomRepository(deps.KVSClient)
	imageService := imagesvc.NewService(deps.BlobClient, deps.KVSClient, roomRepo)
	imagePath, imageHandler := scene_hunterv1connect.NewImageServiceHandler(
		imageService,
		interceptors,
	)
	mux.Mount(imagePath, imageHandler)
}

func registerRoomService(mux *chi.Mux, deps *Dependencies, interceptors connect.Option) {
	if deps.KVSClient == nil {
		return
	}

	roomRepo := infrarepository.NewRoomRepository(deps.KVSClient)
	roomService := roomsvc.NewService(roomRepo)
	roomPath, roomHandler := scene_hunterv1connect.NewRoomServiceHandler(
		roomService,
		interceptors,
	)
	mux.Mount(roomPath, roomHandler)
}

func registerAuthService(mux *chi.Mux, deps *Dependencies, interceptors connect.Option) {
	if deps.KVSClient == nil || deps.DBClient == nil || deps.Config == nil {
		return
	}

	anonRepo := infrarepository.NewAnonRepository(deps.KVSClient)
	identityRepo := infrarepository.NewIdentityRepository(deps.DBClient)
	authService := authsvc.NewService(anonRepo, identityRepo, deps.Config)
	authPath, authHandler := scene_hunterv1connect.NewAuthServiceHandler(
		authService,
		interceptors,
	)
	mux.Mount(authPath, authHandler)
}
