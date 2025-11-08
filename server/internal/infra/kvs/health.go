package kvs

import (
	"context"
	"fmt"

	"github.com/yashikota/scene-hunter/server/internal/domain/health"
	domainkvs "github.com/yashikota/scene-hunter/server/internal/domain/kvs"
)

type HealthChecker struct {
	client domainkvs.KVS
}

func NewHealthChecker(client domainkvs.KVS) health.Checker {
	return &HealthChecker{
		client: client,
	}
}

func (h *HealthChecker) Check(ctx context.Context) error {
	err := h.client.Ping(ctx)
	if err != nil {
		return fmt.Errorf("valkey health check failed: %w", err)
	}

	return nil
}

func (h *HealthChecker) Name() string {
	return "valkey"
}
