package blob

import (
	"context"
	"fmt"

	domainblob "github.com/yashikota/scene-hunter/server/internal/domain/blob"
	"github.com/yashikota/scene-hunter/server/internal/domain/health"
)

type HealthChecker struct {
	client domainblob.Blob
}

func NewHealthChecker(client domainblob.Blob) health.Checker {
	return &HealthChecker{
		client: client,
	}
}

func (h *HealthChecker) Check(ctx context.Context) error {
	err := h.client.Ping(ctx)
	if err != nil {
		return fmt.Errorf("rustfs ping failed: %w", err)
	}

	return nil
}

func (h *HealthChecker) Name() string {
	return "rustfs"
}
