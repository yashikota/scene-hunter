package room_test

import (
	"context"
	"testing"

	domainroom "github.com/yashikota/scene-hunter/server/internal/domain/room"
	infrakvs "github.com/yashikota/scene-hunter/server/internal/infra/kvs"
	infraroom "github.com/yashikota/scene-hunter/server/internal/infra/room"
	"github.com/yashikota/scene-hunter/server/util/config"
)

//nolint:unparam // Repository is used in future test implementations
func setupTestRepository(t *testing.T) (domainroom.Repository, context.Context) {
	t.Helper()

	ctx := context.Background()
	cfg := config.LoadConfigFromPath("../../..")

	kvsClient, err := infrakvs.NewClient(cfg.Kvs.URL, "")
	if err != nil {
		t.Skipf("KVS client initialization failed: %v", err)
	}

	// Ping to verify connection
	err = kvsClient.Ping(ctx)
	if err != nil {
		t.Skipf("KVS ping failed: %v", err)
	}

	repo := infraroom.NewRepository(kvsClient)

	return repo, ctx
}

func TestRepository_Create(t *testing.T) {
	t.Parallel()
	_, _ = setupTestRepository(t)

	// Note: This test needs domain.Room type
	// For now, we'll skip the actual test implementation
	t.Skip("Test requires proper domain.Room setup")
}

func TestRepository_Get(t *testing.T) {
	t.Parallel()
	_, _ = setupTestRepository(t)

	t.Skip("Test requires proper domain.Room setup")
}

func TestRepository_Update(t *testing.T) {
	t.Parallel()
	_, _ = setupTestRepository(t)

	t.Skip("Test requires proper domain.Room setup")
}

func TestRepository_Delete(t *testing.T) {
	t.Parallel()
	_, _ = setupTestRepository(t)

	t.Skip("Test requires proper domain.Room setup")
}

func TestRepository_Exists(t *testing.T) {
	t.Parallel()
	_, _ = setupTestRepository(t)

	t.Skip("Test requires proper domain.Room setup")
}
