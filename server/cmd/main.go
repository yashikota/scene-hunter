// Package main is the entry point of the scene-hunter server.
package main

import (
	"log/slog"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	slogchi "github.com/samber/slog-chi"
	"github.com/yashikota/scene-hunter/server/util/config"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

func main() {
	cfg := config.LoadConfig()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: cfg.Logger.Level,
	}))
	slog.SetDefault(logger)

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
	mux.Use(slogchi.NewWithConfig(logger, slogchi.Config{
		WithSpanID:       true,
		WithTraceID:      true,
		DefaultLevel:     slog.LevelInfo,
		ClientErrorLevel: slog.LevelWarn,
		ServerErrorLevel: slog.LevelError,
		WithUserAgent:    true,
		WithRequestID:    true,
	}))

	// Start server
	server := &http.Server{
		Addr:         cfg.Server.Port,
		Handler:      h2c.NewHandler(mux, &http2.Server{}),
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	logger.Info("starting scene-hunter server on http://localhost" + cfg.Server.Port)

	err := server.ListenAndServe()
	if err != nil {
		panic(err)
	}
}
