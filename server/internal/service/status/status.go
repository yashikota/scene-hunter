// Package status provides status check service implementation.
package status

import (
	"context"
	"time"

	scene_hunterv1 "github.com/yashikota/scene-hunter/server/gen/scene_hunter/v1"
	"github.com/yashikota/scene-hunter/server/internal/domain/chrono"
	"github.com/yashikota/scene-hunter/server/internal/domain/health"
	"github.com/yashikota/scene-hunter/server/internal/util/errors"
)

type Service struct {
	checkers []health.Checker
	chrono   chrono.Chrono
}

func NewService(checkers []health.Checker, chrono chrono.Chrono) *Service {
	return &Service{
		checkers: checkers,
		chrono:   chrono,
	}
}

func (s *Service) Status(
	ctx context.Context,
	_ *scene_hunterv1.StatusRequest,
) (*scene_hunterv1.StatusResponse, error) {
	now := s.chrono.Now().Format(time.RFC3339)

	serviceStatuses := make([]*scene_hunterv1.ServiceStatus, 0, len(s.checkers))
	overallHealthy := true

	for _, checker := range s.checkers {
		err := checker.Check(ctx)
		healthy := err == nil
		message := "ok"

		if !healthy {
			overallHealthy = false
			message = err.Error()
			errors.LogErrorCtx(ctx, "health check failed", err,
				"service", checker.Name(),
			)
		}

		serviceStatuses = append(serviceStatuses, &scene_hunterv1.ServiceStatus{
			Name:    checker.Name(),
			Healthy: healthy,
			Message: message,
		})
	}

	return &scene_hunterv1.StatusResponse{
		OverallHealthy: overallHealthy,
		Services:       serviceStatuses,
		Timestamp:      now,
	}, nil
}
