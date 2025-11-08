// Package handler provides HTTP handler registration for all services.
package handler

import (
	"connectrpc.com/connect"
	"connectrpc.com/validate"
	"github.com/go-chi/chi/v5"
	"github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1/scene_hunterv1connect"
	"github.com/yashikota/scene-hunter/server/internal/infra/chrono"
	"github.com/yashikota/scene-hunter/server/internal/service/health"
)

// RegisterHandlers registers all service handlers to the router.
func RegisterHandlers(mux *chi.Mux) {
	interceptors := connect.WithInterceptors(
		validate.NewInterceptor(),
	)

	// Health service
	healthService := health.NewService(chrono.New())
	healthPath, healthHandler := scene_hunterv1connect.NewHealthServiceHandler(
		healthService,
		interceptors,
	)
	mux.Mount(healthPath, healthHandler)
}
