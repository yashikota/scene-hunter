package blob_test

import (
	"bytes"
	"context"
	"io"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go/modules/minio"
	"github.com/yashikota/scene-hunter/server/internal/infra/blob"
)

// setupMinio はテスト用のMinIOコンテナをセットアップする.
func setupMinio(ctx context.Context, t *testing.T) (string, func()) {
	t.Helper()

	minioContainer, err := minio.Run(
		ctx,
		"docker.io/minio/minio:RELEASE.2025-09-07T16-13-09Z",
	)
	if err != nil {
		t.Fatalf("failed to start minio container: %v", err)
	}

	connString, err := minioContainer.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("failed to get connection string: %v", err)
	}

	// Wait for MinIO to be fully initialized by attempting to create a client and ping
	// Retry up to 10 times with 1 second delay between attempts
	var client blob.Blob
	for range 10 {
		client, err = blob.NewClient(connString, "minioadmin", "minioadmin", "test-bucket", false)
		if err == nil {
			err = client.Ping(ctx)
			if err == nil {
				break
			}
		}

		time.Sleep(1 * time.Second)
	}

	if err != nil {
		_ = minioContainer.Terminate(ctx)

		t.Fatalf("failed to initialize minio: %v", err)
	}

	cleanup := func() {
		err := minioContainer.Terminate(ctx)
		if err != nil {
			t.Logf("failed to terminate container: %v", err)
		}
	}

	return connString, cleanup
}

// TestNewClient はBlobクライアントが正常に作成できることをテストする.
func TestNewClient(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	endpoint, cleanup := setupMinio(ctx, t)
	defer cleanup()

	client, err := blob.NewClient(endpoint, "minioadmin", "minioadmin", "test-bucket", false)
	if err != nil {
		t.Fatalf("NewClient() error = %v, want nil", err)
	}

	if client == nil {
		t.Error("NewClient() returned nil")
	}
}

// TestNewClient_InvalidEndpoint は無効なエンドポイントでエラーが返されることをテストする.
func TestNewClient_InvalidEndpoint(t *testing.T) {
	t.Parallel()

	_, err := blob.NewClient("invalid:endpoint:format", "key", "secret", "bucket", false)
	if err == nil {
		t.Error("NewClient() with invalid endpoint should return error")
	}
}

// TestClient_Ping はBlobストレージへの疎通確認が成功することをテストする.
func TestClient_Ping(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	endpoint, cleanup := setupMinio(ctx, t)
	defer cleanup()

	client, err := blob.NewClient(endpoint, "minioadmin", "minioadmin", "test-bucket", false)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	err = client.Ping(ctx)
	if err != nil {
		t.Errorf("Ping() error = %v, want nil", err)
	}
}

// TestClient_Put_Get はオブジェクトの保存と取得が正常に動作することをテストする.
func TestClient_Put_Get(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		k string
		c string
		t time.Duration
	}{
		"simple put and get": {"test-key", "test content", 0},
		"put with ttl":       {"ttl-key", "ttl content", 1 * time.Hour},
		"empty content":      {"empty-key", "", 0},
		"large content":      {"large-key", string(make([]byte, 1024*1024)), 0},
	}

	for testName, tc := range tests {
		t.Run(testName, func(t *testing.T) {
			t.Parallel()

			ctx := context.Background()

			endpoint, cleanup := setupMinio(ctx, t)
			defer cleanup()

			client, err := blob.NewClient(
				endpoint,
				"minioadmin",
				"minioadmin",
				"test-bucket",
				false,
			)
			if err != nil {
				t.Fatalf("NewClient() error = %v", err)
			}

			// Ping to ensure bucket exists
			err = client.Ping(ctx)
			if err != nil {
				t.Fatalf("Ping() error = %v", err)
			}

			// Put
			err = client.Put(ctx, tc.k, bytes.NewReader([]byte(tc.c)), tc.t)
			if err != nil {
				t.Errorf("Put() error = %v, want nil", err)
				return
			}

			// Get
			reader, err := client.Get(ctx, tc.k)
			if err != nil {
				t.Errorf("Get() error = %v, want nil", err)
				return
			}

			defer func() {
				if closeErr := reader.Close(); closeErr != nil {
					t.Logf("failed to close reader: %v", closeErr)
				}
			}()

			got, err := io.ReadAll(reader)
			if err != nil {
				t.Errorf("ReadAll() error = %v, want nil", err)
				return
			}

			if string(got) != tc.c {
				t.Errorf("Get() content = %v, want %v", string(got), tc.c)
			}
		})
	}
}

// TestClient_Get_NonExistentKey は存在しないキーを取得した際にエラーが返されることをテストする.
func TestClient_Get_NonExistentKey(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	endpoint, cleanup := setupMinio(ctx, t)
	defer cleanup()

	client, err := blob.NewClient(endpoint, "minioadmin", "minioadmin", "test-bucket", false)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	err = client.Ping(ctx)
	if err != nil {
		t.Fatalf("Ping() error = %v", err)
	}

	_, err = client.Get(ctx, "non-existent-key")
	if err == nil {
		t.Error("Get() with non-existent key should return error")
	}
}

// TestClient_Delete はオブジェクトが正常に削除できることをテストする.
func TestClient_Delete(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	endpoint, cleanup := setupMinio(ctx, t)
	defer cleanup()

	client, err := blob.NewClient(endpoint, "minioadmin", "minioadmin", "test-bucket", false)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	err = client.Ping(ctx)
	if err != nil {
		t.Fatalf("Ping() error = %v", err)
	}

	key := "delete-test-key"
	content := "delete test content"

	// Put an object
	err = client.Put(ctx, key, bytes.NewReader([]byte(content)), 0)
	if err != nil {
		t.Fatalf("Put() error = %v", err)
	}

	// Verify it exists
	exists, err := client.Exists(ctx, key)
	if err != nil {
		t.Fatalf("Exists() error = %v", err)
	}

	if !exists {
		t.Error("Object should exist before deletion")
	}

	// Delete the object
	err = client.Delete(ctx, key)
	if err != nil {
		t.Errorf("Delete() error = %v, want nil", err)
	}

	// Verify it no longer exists
	exists, err = client.Exists(ctx, key)
	if err != nil {
		t.Fatalf("Exists() after delete error = %v", err)
	}

	if exists {
		t.Error("Object should not exist after deletion")
	}
}

// TestClient_Delete_NonExistentKey は存在しないキーを削除してもエラーにならないこと（冪等性）をテストする.
func TestClient_Delete_NonExistentKey(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	endpoint, cleanup := setupMinio(ctx, t)
	defer cleanup()

	client, err := blob.NewClient(endpoint, "minioadmin", "minioadmin", "test-bucket", false)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	err = client.Ping(ctx)
	if err != nil {
		t.Fatalf("Ping() error = %v", err)
	}

	// Deleting a non-existent key should not return an error
	err = client.Delete(ctx, "non-existent-key")
	if err != nil {
		t.Errorf("Delete() non-existent key error = %v, want nil", err)
	}
}

// TestClient_Exists はオブジェクトの存在確認が正常に動作することをテストする.
func TestClient_Exists(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		s bool
		k string
		c string
		w bool
	}{
		"object exists":         {true, "existing-key", "content", true},
		"object does not exist": {false, "non-existing-key", "", false},
	}

	for testName, tc := range tests {
		t.Run(testName, func(t *testing.T) {
			t.Parallel()

			ctx := context.Background()

			endpoint, cleanup := setupMinio(ctx, t)
			defer cleanup()

			client, err := blob.NewClient(
				endpoint,
				"minioadmin",
				"minioadmin",
				"test-bucket",
				false,
			)
			if err != nil {
				t.Fatalf("NewClient() error = %v", err)
			}

			err = client.Ping(ctx)
			if err != nil {
				t.Fatalf("Ping() error = %v", err)
			}

			if tc.s {
				err = client.Put(ctx, tc.k, bytes.NewReader([]byte(tc.c)), 0)
				if err != nil {
					t.Fatalf("Put() error = %v", err)
				}
			}

			exists, err := client.Exists(ctx, tc.k)
			if err != nil {
				t.Errorf("Exists() error = %v, want nil", err)
				return
			}

			if exists != tc.w {
				t.Errorf("Exists() = %v, want %v", exists, tc.w)
			}
		})
	}
}

// TestClient_List はオブジェクトの一覧取得が正常に動作することをテストする.
func TestClient_List(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	endpoint, cleanup := setupMinio(ctx, t)
	defer cleanup()

	client, err := blob.NewClient(endpoint, "minioadmin", "minioadmin", "test-bucket", false)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	err = client.Ping(ctx)
	if err != nil {
		t.Fatalf("Ping() error = %v", err)
	}

	// Put some objects
	testObjects := map[string]string{
		"test/file1.txt": "content1",
		"test/file2.txt": "content2",
		"prod/file3.txt": "content3",
	}

	for key, content := range testObjects {
		err = client.Put(ctx, key, bytes.NewReader([]byte(content)), 0)
		if err != nil {
			t.Fatalf("Put() error = %v", err)
		}
	}

	// List all objects
	allObjects, err := client.List(ctx, "")
	if err != nil {
		t.Errorf("List() error = %v, want nil", err)
	}

	if len(allObjects) < len(testObjects) {
		t.Errorf("List() returned %d objects, want at least %d", len(allObjects), len(testObjects))
	}

	// List with prefix
	testObjects2, err := client.List(ctx, "test/")
	if err != nil {
		t.Errorf("List() with prefix error = %v, want nil", err)
	}

	if len(testObjects2) < 2 {
		t.Errorf("List() with prefix returned %d objects, want at least 2", len(testObjects2))
	}
}

// TestClient_UpdateExistingKey は既存のキーの値を上書き更新できることをテストする.
func TestClient_UpdateExistingKey(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	endpoint, cleanup := setupMinio(ctx, t)
	defer cleanup()

	client, err := blob.NewClient(endpoint, "minioadmin", "minioadmin", "test-bucket", false)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	err = client.Ping(ctx)
	if err != nil {
		t.Fatalf("Ping() error = %v", err)
	}

	key := "update-key"
	content1 := "content1"
	content2 := "content2"

	// Put initial content
	err = client.Put(ctx, key, bytes.NewReader([]byte(content1)), 0)
	if err != nil {
		t.Fatalf("Put() first content error = %v", err)
	}

	// Get and verify initial content
	reader, err := client.Get(ctx, key)
	if err != nil {
		t.Fatalf("Get() first content error = %v", err)
	}

	got, err := io.ReadAll(reader)
	if closeErr := reader.Close(); closeErr != nil {
		t.Fatalf("Close() first content error = %v", closeErr)
	}

	if err != nil {
		t.Fatalf("ReadAll() first content error = %v", err)
	}

	if string(got) != content1 {
		t.Errorf("Get() first content = %v, want %v", string(got), content1)
	}

	// Update to new content
	err = client.Put(ctx, key, bytes.NewReader([]byte(content2)), 0)
	if err != nil {
		t.Fatalf("Put() second content error = %v", err)
	}

	// Get and verify updated content
	reader, err = client.Get(ctx, key)
	if err != nil {
		t.Fatalf("Get() second content error = %v", err)
	}

	got, err = io.ReadAll(reader)
	if closeErr := reader.Close(); closeErr != nil {
		t.Fatalf("Close() second content error = %v", closeErr)
	}

	if err != nil {
		t.Fatalf("ReadAll() second content error = %v", err)
	}

	if string(got) != content2 {
		t.Errorf("Get() second content = %v, want %v", string(got), content2)
	}
}
