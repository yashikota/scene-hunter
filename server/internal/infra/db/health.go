package db

import (
	"context"
	"fmt"

	domaindb "github.com/yashikota/scene-hunter/server/internal/domain/db"
	"github.com/yashikota/scene-hunter/server/internal/domain/health"
)

type HealthChecker struct {
	db domaindb.DB
}

func NewHealthChecker(db domaindb.DB) health.Checker {
	return &HealthChecker{
		db: db,
	}
}

func (h *HealthChecker) Check(ctx context.Context) error {
	err := h.db.Ping(ctx)
	if err != nil {
		return fmt.Errorf("postgres ping failed: %w", err)
	}

	return nil
}

func (h *HealthChecker) Name() string {
	return "postgres"
}
