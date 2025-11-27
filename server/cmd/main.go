// Package main is the entry point of the scene-hunter server.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	slogchi "github.com/samber/slog-chi"
	"github.com/yashikota/scene-hunter/server/cmd/di"
	"github.com/yashikota/scene-hunter/server/internal/config"
	infraotel "github.com/yashikota/scene-hunter/server/internal/infra/otel"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

func main() {
	cfg := config.LoadConfig()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: cfg.Logger.Level,
	}))
	slog.SetDefault(logger)

	// Initialize OpenTelemetry with separate context
	var otelProvider *infraotel.Provider

	if cfg.Otel.Enabled {
		otelCtx, otelCancel := context.WithTimeout(context.Background(), 10*time.Second)

		var err error

		otelProvider, err = infraotel.Init(otelCtx, infraotel.Config{
			Endpoint:    cfg.Otel.Endpoint,
			Insecure:    cfg.Otel.Insecure,
			SampleRatio: cfg.Otel.SampleRatio,
		})

		otelCancel()

		if err != nil {
			logger.Error("failed to initialize OpenTelemetry", "error", err)
		} else {
			logger.Info("OpenTelemetry initialized",
				"endpoint", cfg.Otel.Endpoint,
				"sample_ratio", cfg.Otel.SampleRatio,
			)
		}
	}

	// Initialize DI container with separate context
	diCtx, diCancel := context.WithTimeout(context.Background(), 10*time.Second)
	container := di.New(diCtx, cfg, logger)

	diCancel()

	// Initialize router
	mux := chi.NewRouter()
	mux.Use(middleware.Recoverer)
	mux.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://*", "http://*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Add OpenTelemetry HTTP middleware
	if cfg.Otel.Enabled {
		mux.Use(func(next http.Handler) http.Handler {
			return otelhttp.NewHandler(next, infraotel.ServiceName)
		})
	}

	mux.Use(slogchi.NewWithConfig(logger, slogchi.Config{
		WithSpanID:       true,
		WithTraceID:      true,
		DefaultLevel:     slog.LevelInfo,
		ClientErrorLevel: slog.LevelWarn,
		ServerErrorLevel: slog.LevelError,
		WithUserAgent:    true,
		WithRequestID:    true,
	}))

	// Register handlers
	container.RegisterHandlers(mux)

	// Start server
	server := &http.Server{
		Addr:         cfg.Server.Port,
		Handler:      h2c.NewHandler(mux, &http2.Server{}),
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	logger.Info("starting scene-hunter server on http://localhost" + cfg.Server.Port)

	// Cleanup
	if dbClient := container.GetDBClient(); dbClient != nil {
		defer func() {
			err := dbClient.Close()
			if err != nil {
				errors.LogError(
					context.Background(),
					logger,
					"failed to close database connection",
					err,
				)
			}
		}()
	}

	if kvsClient := container.GetKVSClient(); kvsClient != nil {
		defer kvsClient.Close()
	}

	// Cleanup OpenTelemetry
	if otelProvider != nil {
		defer func() {
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer shutdownCancel()

			if err := otelProvider.Shutdown(shutdownCtx); err != nil {
				errors.LogError(
					context.Background(),
					logger,
					"failed to shutdown OpenTelemetry",
					err,
				)
			}
		}()
	}

	err := server.ListenAndServe()
	if err != nil {
		panic(err)
	}
}
