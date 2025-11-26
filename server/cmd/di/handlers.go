package di

import (
	"log/slog"

	"connectrpc.com/connect"
	"connectrpc.com/validate"
	"github.com/go-chi/chi/v5"
	"github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1/scene_hunterv1connect"
	"github.com/yashikota/scene-hunter/server/internal/config"
	gamehandler "github.com/yashikota/scene-hunter/server/internal/handler/game"
	infradb "github.com/yashikota/scene-hunter/server/internal/infra/db"
	"github.com/yashikota/scene-hunter/server/internal/service"
	authsvc "github.com/yashikota/scene-hunter/server/internal/service/auth"
	gamesvc "github.com/yashikota/scene-hunter/server/internal/service/game"
	healthsvc "github.com/yashikota/scene-hunter/server/internal/service/health"
	"github.com/yashikota/scene-hunter/server/internal/service/middleware"
	roomsvc "github.com/yashikota/scene-hunter/server/internal/service/room"
	"github.com/yashikota/scene-hunter/server/internal/service/status"
	"github.com/yashikota/scene-hunter/server/internal/util/chrono"
)

func newInterceptors() connect.Option {
	logger := slog.Default()

	return connect.WithInterceptors(
		validate.NewInterceptor(),
		newErrorLoggingInterceptor(logger),
		middleware.AuthInterceptor(),
	)
}

func registerHealthService(mux *chi.Mux, chronoProvider chrono.Chrono) {
	interceptors := newInterceptors()
	healthService := healthsvc.NewService(chronoProvider)
	healthPath, healthHandler := scene_hunterv1connect.NewHealthServiceHandler(
		healthService,
		interceptors,
	)
	mux.Mount(healthPath, healthHandler)
}

func registerStatusService(
	mux *chi.Mux,
	chronoProvider chrono.Chrono,
	dbClient *infradb.Client,
	kvsClient service.KVS,
	blobClient service.Blob,
) {
	interceptors := newInterceptors()
	checkers := buildHealthCheckers(dbClient, kvsClient, blobClient)
	statusService := status.NewService(checkers, chronoProvider)
	statusPath, statusHandler := scene_hunterv1connect.NewStatusServiceHandler(
		statusService,
		interceptors,
	)
	mux.Mount(statusPath, statusHandler)
}

func buildHealthCheckers(
	dbClient *infradb.Client,
	kvsClient service.KVS,
	blobClient service.Blob,
) []status.Checker {
	checkers := []status.Checker{}

	if dbClient != nil {
		checkers = append(checkers, dbClient)
	}

	if kvsClient != nil {
		if checker, ok := kvsClient.(status.Checker); ok {
			checkers = append(checkers, checker)
		}
	}

	if blobClient != nil {
		if checker, ok := blobClient.(status.Checker); ok {
			checkers = append(checkers, checker)
		}
	}

	return checkers
}

func registerImageService(
	mux *chi.Mux,
	kvsClient service.KVS,
	blobClient service.Blob,
	roomRepo service.RoomRepository,
) {
	interceptors := newInterceptors()
	imageService := newImageServiceHandler(blobClient, kvsClient, roomRepo)
	imagePath, imageHandler := scene_hunterv1connect.NewImageServiceHandler(
		imageService,
		interceptors,
	)
	mux.Mount(imagePath, imageHandler)
}

func registerRoomService(mux *chi.Mux, roomRepo service.RoomRepository) {
	interceptors := newInterceptors()
	roomService := roomsvc.NewService(roomRepo)
	roomPath, roomHandler := scene_hunterv1connect.NewRoomServiceHandler(
		roomService,
		interceptors,
	)
	mux.Mount(roomPath, roomHandler)
}

func registerAuthService(
	mux *chi.Mux,
	cfg *config.AppConfig,
	dbClient *infradb.Client,
	anonRepo service.AnonRepository,
	identityRepo service.IdentityRepository,
) {
	interceptors := newInterceptors()
	authSvc := authsvc.NewService(anonRepo, identityRepo, cfg)
	authService := newAuthServiceHandler(authSvc, dbClient)
	authPath, authHandler := scene_hunterv1connect.NewAuthServiceHandler(
		authService,
		interceptors,
	)
	mux.Mount(authPath, authHandler)
}

func registerGameService(
	mux *chi.Mux,
	gameRepo service.GameRepository,
	roomRepo service.RoomRepository,
	blobClient service.Blob,
	geminiClient service.Gemini,
) {
	interceptors := newInterceptors()
	gameSvc := gamesvc.NewService(gameRepo, roomRepo, blobClient, geminiClient)
	gameService := gamehandler.NewHandler(gameSvc, roomRepo)
	gamePath, gameHandler := scene_hunterv1connect.NewGameServiceHandler(
		gameService,
		interceptors,
	)
	mux.Mount(gamePath, gameHandler)
}
