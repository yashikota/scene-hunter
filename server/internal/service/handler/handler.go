package handler

import (
	"context"
	"log/slog"

	"connectrpc.com/connect"
	"connectrpc.com/validate"
	"github.com/go-chi/chi/v5"
	"github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1/scene_hunterv1connect"
	domainblob "github.com/yashikota/scene-hunter/server/internal/domain/blob"
	domainchrono "github.com/yashikota/scene-hunter/server/internal/domain/chrono"
	"github.com/yashikota/scene-hunter/server/internal/domain/health"
	domainkvs "github.com/yashikota/scene-hunter/server/internal/domain/kvs"
	"github.com/yashikota/scene-hunter/server/internal/infra/chrono"
	infradb "github.com/yashikota/scene-hunter/server/internal/infra/db"
	infraroom "github.com/yashikota/scene-hunter/server/internal/infra/room"
	healthsvc "github.com/yashikota/scene-hunter/server/internal/service/health"
	imagesvc "github.com/yashikota/scene-hunter/server/internal/service/image"
	roomsvc "github.com/yashikota/scene-hunter/server/internal/service/room"
	"github.com/yashikota/scene-hunter/server/internal/service/status"
)

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

type Dependencies struct {
	DBClient   *infradb.Client
	DBError    error
	KVSClient  domainkvs.KVS
	KVSError   error
	BlobClient domainblob.Blob
}

func RegisterHandlers(mux *chi.Mux, deps *Dependencies) {
	logger := slog.Default()

	interceptors := connect.WithInterceptors(
		validate.NewInterceptor(),
		NewErrorLoggingInterceptor(logger),
	)

	chronoProvider := chrono.New()

	healthService := healthsvc.NewService(chronoProvider)
	healthPath, healthHandler := scene_hunterv1connect.NewHealthServiceHandler(
		healthService,
		interceptors,
	)
	mux.Mount(healthPath, healthHandler)

	if deps == nil {
		return
	}

	registerStatusService(mux, deps, chronoProvider, interceptors)
	registerImageService(mux, deps, interceptors)
	registerRoomService(mux, deps, chronoProvider, interceptors)
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

	if deps.DBClient != nil {
		checkers = append(checkers, deps.DBClient)
	} else if deps.DBError != nil {
		checkers = append(checkers, &failedChecker{name: "postgres", err: deps.DBError})
	}

	if deps.KVSClient != nil {
		if checker, ok := deps.KVSClient.(health.Checker); ok {
			checkers = append(checkers, checker)
		}
	} else if deps.KVSError != nil {
		checkers = append(checkers, &failedChecker{name: "valkey", err: deps.KVSError})
	}

	if deps.BlobClient != nil {
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

func registerRoomService(
	mux *chi.Mux,
	deps *Dependencies,
	chronoProvider domainchrono.Chrono,
	interceptors connect.Option,
) {
	if deps.KVSClient == nil {
		return
	}

	roomRepo := infraroom.NewRepository(deps.KVSClient, chronoProvider)
	roomService := roomsvc.NewService(roomRepo, chronoProvider)
	roomPath, roomHandler := scene_hunterv1connect.NewRoomServiceHandler(
		roomService,
		interceptors,
	)
	mux.Mount(roomPath, roomHandler)
}
