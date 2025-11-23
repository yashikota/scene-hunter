package kvs_test

import (
	"context"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go/modules/valkey"
	"github.com/yashikota/scene-hunter/server/internal/infra/kvs"
)

// setupValkey はテスト用のValkeyコンテナをセットアップする.
func setupValkey(ctx context.Context, t *testing.T) (string, func()) {
	t.Helper()

	valkeyContainer, err := valkey.Run(ctx, "docker.io/valkey/valkey:9.0.0")
	if err != nil {
		t.Fatalf("failed to start valkey container: %v", err)
	}

	addr, err := valkeyContainer.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("failed to get connection string: %v", err)
	}

	cleanup := func() {
		if err := valkeyContainer.Terminate(ctx); err != nil {
			t.Logf("failed to terminate container: %v", err)
		}
	}

	return addr, cleanup
}

// TestNewClient はKVSクライアントが正常に作成できることをテストする.
func TestNewClient(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	addr, cleanup := setupValkey(ctx, t)
	defer cleanup()

	client, err := kvs.NewClient(addr, "")
	if err != nil {
		t.Fatalf("NewClient() error = %v, want nil", err)
	}

	if client == nil {
		t.Error("NewClient() returned nil")
	}

	client.Close()
}

// TestNewClient_InvalidAddress は無効なアドレスでエラーが返されることをテストする.
func TestNewClient_InvalidAddress(t *testing.T) {
	t.Parallel()

	_, err := kvs.NewClient("invalid:address:format", "")
	if err == nil {
		t.Error("NewClient() with invalid address should return error")
	}
}

// TestClient_Ping はKVSサーバーへの疎通確認が成功することをテストする.
func TestClient_Ping(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	addr, cleanup := setupValkey(ctx, t)
	defer cleanup()

	client, err := kvs.NewClient(addr, "")
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	defer client.Close()

	err = client.Ping(ctx)
	if err != nil {
		t.Errorf("Ping() error = %v, want nil", err)
	}
}

// TestClient_Set_Get はキーと値の設定と取得が正常に動作することをテストする.
// TTLあり・なし、空文字列、長い文字列など様々なケースを検証する.
func TestClient_Set_Get(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		k string
		v string
		t time.Duration
	}{
		"simple key-value without ttl": {"test_key", "test_value", 0},
		"key-value with ttl":           {"temp_key", "temp_value", 1 * time.Hour},
		"empty value":                  {"empty_key", "", 0},
		"long value":                   {"long_key", "Lorem ipsum dolor sit amet, consectetur adipiscing elit", 0},
	}

	for testName, tc := range tests {
		t.Run(testName, func(t *testing.T) {
			t.Parallel()

			ctx := context.Background()

			addr, cleanup := setupValkey(ctx, t)
			defer cleanup()

			client, err := kvs.NewClient(addr, "")
			if err != nil {
				t.Fatalf("NewClient() error = %v", err)
			}
			defer client.Close()

			// Set
			err = client.Set(ctx, tc.k, tc.v, tc.t)
			if err != nil {
				t.Errorf("Set() error = %v, want nil", err)
				return
			}

			// Get
			got, err := client.Get(ctx, tc.k)
			if err != nil {
				t.Errorf("Get() error = %v, want nil", err)
				return
			}

			if got != tc.v {
				t.Errorf("Get() = %v, want %v", got, tc.v)
			}
		})
	}
}

// TestClient_Get_NonExistentKey は存在しないキーを取得した際にエラーが返されることをテストする.
func TestClient_Get_NonExistentKey(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	addr, cleanup := setupValkey(ctx, t)
	defer cleanup()

	client, err := kvs.NewClient(addr, "")
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	defer client.Close()

	_, err = client.Get(ctx, "non_existent_key")
	if err == nil {
		t.Error("Get() with non-existent key should return error")
	}
}

// TestClient_Delete はキーが正常に削除できることをテストする.
// 削除前にキーが存在し、削除後に存在しないことを確認する.
func TestClient_Delete(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	addr, cleanup := setupValkey(ctx, t)
	defer cleanup()

	client, err := kvs.NewClient(addr, "")
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	defer client.Close()

	key := "test_key"
	value := "test_value"

	// Set a key
	err = client.Set(ctx, key, value, 0)
	if err != nil {
		t.Fatalf("Set() error = %v", err)
	}

	// Verify it exists
	exists, err := client.Exists(ctx, key)
	if err != nil {
		t.Fatalf("Exists() error = %v", err)
	}

	if !exists {
		t.Error("Key should exist before deletion")
	}

	// Delete the key
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
		t.Error("Key should not exist after deletion")
	}
}

// TestClient_Delete_NonExistentKey は存在しないキーを削除してもエラーにならないこと（冪等性）をテストする.
func TestClient_Delete_NonExistentKey(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	addr, cleanup := setupValkey(ctx, t)
	defer cleanup()

	client, err := kvs.NewClient(addr, "")
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	defer client.Close()

	// Deleting a non-existent key should not return an error
	err = client.Delete(ctx, "non_existent_key")
	if err != nil {
		t.Errorf("Delete() non-existent key error = %v, want nil", err)
	}
}

// TestClient_Exists はキーの存在確認が正常に動作することをテストする.
// 存在するキーと存在しないキーの両方のケースを検証する.
func TestClient_Exists(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		s bool
		k string
		v string
		w bool
	}{
		"key exists":         {true, "existing_key", "value", true},
		"key does not exist": {false, "non_existing_key", "", false},
	}

	for testName, tc := range tests {
		t.Run(testName, func(t *testing.T) {
			t.Parallel()

			ctx := context.Background()

			addr, cleanup := setupValkey(ctx, t)
			defer cleanup()

			client, err := kvs.NewClient(addr, "")
			if err != nil {
				t.Fatalf("NewClient() error = %v", err)
			}
			defer client.Close()

			if tc.s {
				err = client.Set(ctx, tc.k, tc.v, 0)
				if err != nil {
					t.Fatalf("Set() error = %v", err)
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

// TestClient_SetWithTTL_Expiration はTTL（有効期限）が正常に機能することをテストする.
// 設定直後はキーが存在し、TTL経過後には自動削除されることを確認する.
func TestClient_SetWithTTL_Expiration(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	addr, cleanup := setupValkey(ctx, t)
	defer cleanup()

	client, err := kvs.NewClient(addr, "")
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	defer client.Close()

	key := "ttl_key"
	value := "ttl_value"
	ttl := 2 * time.Second

	// Set with TTL
	err = client.Set(ctx, key, value, ttl)
	if err != nil {
		t.Fatalf("Set() with TTL error = %v", err)
	}

	// Verify key exists
	exists, err := client.Exists(ctx, key)
	if err != nil {
		t.Fatalf("Exists() error = %v", err)
	}

	if !exists {
		t.Error("Key should exist immediately after setting")
	}

	// Wait for TTL to expire
	time.Sleep(3 * time.Second)

	// Verify key has expired
	exists, err = client.Exists(ctx, key)
	if err != nil {
		t.Fatalf("Exists() after TTL error = %v", err)
	}

	if exists {
		t.Error("Key should not exist after TTL expiration")
	}
}

// TestClient_UpdateExistingKey は既存のキーの値を上書き更新できることをテストする.
func TestClient_UpdateExistingKey(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	addr, cleanup := setupValkey(ctx, t)
	defer cleanup()

	client, err := kvs.NewClient(addr, "")
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	defer client.Close()

	key := "update_key"
	value1 := "value1"
	value2 := "value2"

	// Set initial value
	err = client.Set(ctx, key, value1, 0)
	if err != nil {
		t.Fatalf("Set() first value error = %v", err)
	}

	// Get and verify initial value
	got, err := client.Get(ctx, key)
	if err != nil {
		t.Fatalf("Get() first value error = %v", err)
	}

	if got != value1 {
		t.Errorf("Get() first value = %v, want %v", got, value1)
	}

	// Update to new value
	err = client.Set(ctx, key, value2, 0)
	if err != nil {
		t.Fatalf("Set() second value error = %v", err)
	}

	// Get and verify updated value
	got, err = client.Get(ctx, key)
	if err != nil {
		t.Fatalf("Get() second value error = %v", err)
	}

	if got != value2 {
		t.Errorf("Get() second value = %v, want %v", got, value2)
	}
}
