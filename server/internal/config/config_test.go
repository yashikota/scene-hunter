package config_test

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/yashikota/scene-hunter/server/internal/config"
)

// createTempConfigFile creates a temporary config file with the given content.
func createTempConfigFile(t *testing.T, content string) string {
	t.Helper()

	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "config.toml")

	err := os.WriteFile(configPath, []byte(content), 0o600)
	if err != nil {
		t.Fatalf("Failed to create temp config file: %v", err)
	}

	return tempDir
}

// setupEnv sets up environment variables and registers cleanup.
func setupEnv(t *testing.T, envVars map[string]string) {
	t.Helper()

	for key, value := range envVars {
		t.Setenv(key, value)
	}
}

// assertEqual compares two comparable values.
func assertEqual[T comparable](t *testing.T, got, want T, field string) {
	t.Helper()

	if got != want {
		t.Errorf("Expected %s to be %v, got %v", field, want, got)
	}
}

// TestLoadConfig tests loading config with various settings.
func TestLoadConfig(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		content           string
		assertions        func(t *testing.T, cfg *config.AppConfig)
	}{
		"minimal settings": {
			content: `
[database]
host = "localhost"
port = 5432
user = "testuser"
dbname = "testdb"
sslmode = "disable"
`,
			assertions: func(t *testing.T, cfg *config.AppConfig) {
				// Check database settings
				assertEqual(t, cfg.Database.Host, "localhost", "database host")
				assertEqual(t, cfg.Database.Port, uint16(5432), "database port")
				assertEqual(t, cfg.Database.User, "testuser", "database user")
				assertEqual(t, cfg.Database.Dbname, "testdb", "database dbname")
				assertEqual(t, cfg.Database.Sslmode, "disable", "database sslmode")

				// Check default values
				assertEqual(t, cfg.Server.Port, ":8686", "default server port")
				assertEqual(t, cfg.Server.ReadTimeout, 30*time.Second, "default read timeout")
				assertEqual(t, cfg.Server.WriteTimeout, 30*time.Second, "default write timeout")
				assertEqual(t, cfg.Server.IdleTimeout, 60*time.Second, "default idle timeout")
				assertEqual(t, cfg.Logger.Level, slog.LevelDebug, "default logger level")
			},
		},
		"full settings": {
			content: `
[server]
port = ":9090"
read_timeout = "60s"
write_timeout = "60s"
idle_timeout = "120s"

[database]
host = "db.example.com"
port = 5433
user = "admin"
password = "secret"
dbname = "production"
sslmode = "require"

[kvs]
url = "redis://kvs.example.com:6379"

[blob]
url = "http://blob.example.com:9000"

[logger]
level = 0
`,
			assertions: func(t *testing.T, cfg *config.AppConfig) {
				// Check server settings
				assertEqual(t, cfg.Server.Port, ":9090", "server port")
				assertEqual(t, cfg.Server.ReadTimeout, 60*time.Second, "read timeout")
				assertEqual(t, cfg.Server.WriteTimeout, 60*time.Second, "write timeout")
				assertEqual(t, cfg.Server.IdleTimeout, 120*time.Second, "idle timeout")

				// Check database settings
				assertEqual(t, cfg.Database.Host, "db.example.com", "database host")
				assertEqual(t, cfg.Database.Port, uint16(5433), "database port")
				assertEqual(t, cfg.Database.User, "admin", "database user")
				assertEqual(t, cfg.Database.Password, "secret", "database password")
				assertEqual(t, cfg.Database.Dbname, "production", "database dbname")
				assertEqual(t, cfg.Database.Sslmode, "require", "database sslmode")

				// Check KVS settings
				assertEqual(t, cfg.Kvs.URL, "redis://kvs.example.com:6379", "kvs url")

				// Check blob settings
				assertEqual(t, cfg.Blob.URL, "http://blob.example.com:9000", "blob url")

				// Check logger settings
				assertEqual(t, cfg.Logger.Level, slog.LevelInfo, "logger level")
			},
		},
	}

	for testName, testCase := range tests {
		t.Run(testName, func(t *testing.T) {
			t.Parallel()
			configPath := createTempConfigFile(t, testCase.content)
			cfg := config.LoadConfigFromPath(configPath)
			testCase.assertions(t, cfg)
		})
	}
}

// TestLoadConfigNotFound tests loading config when file doesn't exist.
func TestLoadConfigNotFound(t *testing.T) {
	t.Parallel()

	defer func() {
		if r := recover(); r == nil {
			t.Errorf("Expected panic when config file doesn't exist, but didn't panic")
		}
	}()

	tempDir := t.TempDir()
	config.LoadConfigFromPath(tempDir)
}

// TestLoadConfigWithEnv tests loading config with environment variable overrides.
// Note: This test cannot use t.Parallel() because it modifies environment variables.
//
//nolint:paralleltest // Cannot use t.Parallel() with t.Setenv()
func TestLoadConfigWithEnv(t *testing.T) {
	content := `
[server]
port = ":8686"

[database]
host = "localhost"
port = 5432
user = "testuser"
dbname = "testdb"
sslmode = "disable"
`

	configPath := createTempConfigFile(t, content)

	// Set environment variables to override config
	setupEnv(t, map[string]string{
		"SERVER_PORT":   ":3000",
		"DATABASE_HOST": "envhost",
		"DATABASE_PORT": "5433",
	})

	cfg := config.LoadConfigFromPath(configPath)

	// Check that environment variables override config file values
	assertEqual(t, cfg.Server.Port, ":3000", "server port from env")
	assertEqual(t, cfg.Database.Host, "envhost", "database host from env")
	assertEqual(t, cfg.Database.Port, uint16(5433), "database port from env")

	// Check that non-overridden values remain from config file
	assertEqual(t, cfg.Database.User, "testuser", "database user")
}

// TestLoadConfigInvalidFormat tests loading config with invalid TOML format.
func TestLoadConfigInvalidFormat(t *testing.T) {
	t.Parallel()

	defer func() {
		if r := recover(); r == nil {
			t.Errorf("Expected panic when config file has invalid format, but didn't panic")
		}
	}()

	content := `
[database
invalid toml format
host = "localhost
`

	configPath := createTempConfigFile(t, content)
	config.LoadConfigFromPath(configPath)
}
