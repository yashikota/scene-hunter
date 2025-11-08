// Package health provides health check service implementation.
package health

import (
	"context"
	"time"

	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	"k8s.io/utils/clock"
)

// Service is the health check service.
type Service struct {
	clock clock.Clock
}

// NewService creates a new health check service.
func NewService(clk clock.Clock) *Service {
	return &Service{
		clock: clk,
	}
}

// Health implements the health check endpoint.
func (s *Service) Health(
	_ context.Context,
	_ *scene_hunterv1.HealthRequest,
) (*scene_hunterv1.HealthResponse, error) {
	now := s.clock.Now().Format(time.RFC3339)

	return &scene_hunterv1.HealthResponse{
		Status:    "ok",
		Timestamp: now,
	}, nil
}
