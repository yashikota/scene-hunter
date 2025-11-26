// Package di provides dependency injection container using uber/dig.
package di

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/yashikota/scene-hunter/server/internal/config"
	infrablob "github.com/yashikota/scene-hunter/server/internal/infra/blob"
	infradb "github.com/yashikota/scene-hunter/server/internal/infra/db"
	infragemini "github.com/yashikota/scene-hunter/server/internal/infra/gemini"
	infrakvs "github.com/yashikota/scene-hunter/server/internal/infra/kvs"
	infrarepo "github.com/yashikota/scene-hunter/server/internal/infra/repository"
	"github.com/yashikota/scene-hunter/server/internal/service"
	"github.com/yashikota/scene-hunter/server/internal/util/chrono"
	"go.uber.org/dig"
)

// Container wraps dig.Container.
type Container struct {
	container *dig.Container
}

// New creates a new DI container with all dependencies.
func New(ctx context.Context, cfg *config.AppConfig, logger *slog.Logger) *Container {
	container := dig.New()

	// Provide config and logger
	_ = container.Provide(func() *config.AppConfig { return cfg })
	_ = container.Provide(func() *slog.Logger { return logger })
	_ = container.Provide(chrono.New)

	// Provide infra clients
	provideInfraClients(container, ctx, cfg, logger)

	// Provide repositories
	provideRepositories(container)

	return &Container{container: container}
}

//nolint:funlen // DI provider registration function
func provideInfraClients(
	container *dig.Container,
	ctx context.Context,
	cfg *config.AppConfig,
	logger *slog.Logger,
) {
	// DB Client
	_ = container.Provide(func() (*infradb.Client, error) {
		dbPassword := os.Getenv("POSTGRES_PASSWORD")

		client, err := infradb.NewClient(ctx, cfg.Database.ConnectionString(dbPassword))
		if err != nil {
			logger.Error("failed to initialize database", "error", err)

			return nil, fmt.Errorf("failed to create database client: %w", err)
		}

		logger.Info("database client initialized successfully")

		return client, nil
	})

	// KVS Client
	_ = container.Provide(func() (service.KVS, error) {
		kvsPassword := os.Getenv("VALKEY_PASSWORD")

		client, err := infrakvs.NewClient(cfg.Kvs.URL, kvsPassword)
		if err != nil {
			logger.Error("failed to initialize KVS", "error", err)

			return nil, fmt.Errorf("failed to create KVS client: %w", err)
		}

		if err := client.Ping(ctx); err != nil {
			logger.Error("KVS ping failed", "error", err)

			return nil, fmt.Errorf("failed to ping KVS: %w", err)
		}

		logger.Info("KVS client initialized successfully")

		return client, nil
	})

	// Blob Client
	_ = container.Provide(func() (service.Blob, error) {
		blobAccessKey := os.Getenv("BLOB_ACCESS_KEY")
		blobSecretKey := os.Getenv("BLOB_SECRET_KEY")
		blobBucketName := os.Getenv("BLOB_BUCKET_NAME")
		blobUseSSL := os.Getenv("BLOB_USE_SSL") == "true"

		client, err := infrablob.NewClient(
			cfg.Blob.URL,
			blobAccessKey,
			blobSecretKey,
			blobBucketName,
			blobUseSSL,
		)
		if err != nil {
			logger.Error("failed to initialize blob storage", "error", err)

			return nil, fmt.Errorf("failed to create blob client: %w", err)
		}

		if err := client.Ping(ctx); err != nil {
			logger.Error("blob storage ping failed", "error", err)

			return nil, fmt.Errorf("failed to ping blob storage: %w", err)
		}

		logger.Info("blob client initialized successfully")

		return client, nil
	})

	// Gemini Client
	_ = container.Provide(func() (service.Gemini, error) {
		client, err := infragemini.NewClient(ctx, cfg.Gemini.APIKey, cfg.Gemini.Model)
		if err != nil {
			logger.Error("failed to initialize Gemini client", "error", err)

			return nil, fmt.Errorf("failed to create Gemini client: %w", err)
		}

		logger.Info("Gemini client initialized successfully")

		return client, nil
	})
}

func provideRepositories(container *dig.Container) {
	// Game Repository
	_ = container.Provide(infrarepo.NewGameRepository)

	// Room Repository
	_ = container.Provide(infrarepo.NewRoomRepository)

	// Anon Repository
	_ = container.Provide(infrarepo.NewAnonRepository)

	// Identity Repository
	_ = container.Provide(infrarepo.NewIdentityRepository)
}

// Invoke runs a function with dependencies injected.
func (c *Container) Invoke(fn any) error {
	if err := c.container.Invoke(fn); err != nil {
		return fmt.Errorf("failed to invoke function: %w", err)
	}

	return nil
}

// MustInvoke runs a function with dependencies injected, panics on error.
func (c *Container) MustInvoke(fn any) {
	if err := c.container.Invoke(fn); err != nil {
		panic(err)
	}
}

// GetDBClient returns the DB client if available.
func (c *Container) GetDBClient() *infradb.Client {
	var client *infradb.Client

	_ = c.container.Invoke(func(dbClient *infradb.Client) {
		client = dbClient
	})

	return client
}

// GetKVSClient returns the KVS client if available.
func (c *Container) GetKVSClient() service.KVS {
	var client service.KVS

	_ = c.container.Invoke(func(kvsClient service.KVS) {
		client = kvsClient
	})

	return client
}

// RegisterHandlers registers all HTTP handlers to the router.
func (c *Container) RegisterHandlers(mux *chi.Mux) {
	var logger *slog.Logger

	var chronoProvider chrono.Chrono

	c.MustInvoke(func(l *slog.Logger, cp chrono.Chrono) {
		logger = l
		chronoProvider = cp
		registerHealthService(mux, chronoProvider)
	})

	// StatusService should always be registered for health monitoring
	// Even if some dependencies fail, we want to report their status
	c.registerStatusServiceWithFallback(mux, logger, chronoProvider)

	// Register optional services with error logging
	if err := c.container.Invoke(func(
		kvsClient service.KVS,
		blobClient service.Blob,
		roomRepo service.RoomRepository,
	) {
		registerImageService(mux, kvsClient, blobClient, roomRepo)
	}); err != nil {
		logger.Warn("failed to register ImageService", "error", err)
	}

	if err := c.container.Invoke(func(roomRepo service.RoomRepository) {
		registerRoomService(mux, roomRepo)
	}); err != nil {
		logger.Warn("failed to register RoomService", "error", err)
	}

	if err := c.container.Invoke(func(
		cfg *config.AppConfig,
		dbClient *infradb.Client,
		anonRepo service.AnonRepository,
		identityRepo service.IdentityRepository,
	) {
		registerAuthService(mux, cfg, dbClient, anonRepo, identityRepo)
	}); err != nil {
		logger.Warn("failed to register AuthService", "error", err)
	}

	if err := c.container.Invoke(func(
		gameRepo service.GameRepository,
		roomRepo service.RoomRepository,
		blobClient service.Blob,
		geminiClient service.Gemini,
	) {
		registerGameService(mux, gameRepo, roomRepo, blobClient, geminiClient)
	}); err != nil {
		logger.Warn("failed to register GameService", "error", err)
	}
}

// registerStatusServiceWithFallback registers StatusService even if some dependencies are unavailable.
func (c *Container) registerStatusServiceWithFallback(
	mux *chi.Mux,
	logger *slog.Logger,
	chronoProvider chrono.Chrono,
) {
	// Try to get all dependencies, use nil for unavailable ones
	var dbClient *infradb.Client

	var kvsClient service.KVS

	var blobClient service.Blob

	// Try to resolve each dependency individually
	if err := c.container.Invoke(func(db *infradb.Client) {
		dbClient = db
	}); err != nil {
		logger.Warn("DB client unavailable for StatusService", "error", err)
	}

	if err := c.container.Invoke(func(kvs service.KVS) {
		kvsClient = kvs
	}); err != nil {
		logger.Warn("KVS client unavailable for StatusService", "error", err)
	}

	if err := c.container.Invoke(func(blob service.Blob) {
		blobClient = blob
	}); err != nil {
		logger.Warn("Blob client unavailable for StatusService", "error", err)
	}

	// Always register StatusService with whatever dependencies are available
	registerStatusService(mux, chronoProvider, dbClient, kvsClient, blobClient)
}
