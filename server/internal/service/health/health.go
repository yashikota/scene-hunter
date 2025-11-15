// Package health provides health check service implementation.
package health

import (
	"context"
	"time"

	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	"github.com/yashikota/scene-hunter/server/internal/infra/chrono"
)

type Service struct {
	chrono chrono.Chrono
}

func NewService(chrono chrono.Chrono) *Service {
	return &Service{
		chrono: chrono,
	}
}

func (s *Service) Health(
	_ context.Context,
	_ *scene_hunterv1.HealthRequest,
) (*scene_hunterv1.HealthResponse, error) {
	now := s.chrono.Now().Format(time.RFC3339)

	return &scene_hunterv1.HealthResponse{
		Status:    "ok",
		Timestamp: now,
	}, nil
}
