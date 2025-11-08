package handler

import (
	"context"
	"log/slog"
	"os"

	infrablob "github.com/yashikota/scene-hunter/server/internal/infra/blob"
	infradb "github.com/yashikota/scene-hunter/server/internal/infra/db"
	infrakvs "github.com/yashikota/scene-hunter/server/internal/infra/kvs"
	"github.com/yashikota/scene-hunter/server/util/config"
)

func InitializeDependencies(
	ctx context.Context,
	cfg *config.AppConfig,
	logger *slog.Logger,
) *Dependencies {
	deps := &Dependencies{}

	// PostgreSQL client
	dbPassword := os.Getenv("POSTGRES_PASSWORD")

	dbClient, err := infradb.NewPgxClient(ctx, cfg.Database.ConnectionString(dbPassword))
	if err != nil {
		logger.Warn("failed to initialize database client", "error", err)
	} else {
		deps.DBClient = dbClient

		logger.Info("database client initialized successfully")
	}

	// Valkey client
	kvsPassword := os.Getenv("VALKEY_PASSWORD")

	kvsClient, err := infrakvs.NewClient(cfg.Kvs.URL, kvsPassword)
	if err != nil {
		logger.Warn("failed to initialize KVS client", "error", err)
	} else {
		deps.KVSClient = kvsClient

		logger.Info("KVS client initialized successfully")
	}

	// RustFS client
	blobClient := infrablob.NewClient(cfg.Blob.URL)
	deps.BlobClient = blobClient

	logger.Info("blob client initialized successfully")

	return deps
}
