package config

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config はアプリケーション全体の設定を表す
type Config struct {
	Server    ServerConfig
	Auth      AuthConfig
	Storage   StorageConfig
	Image     ImageConfig
	Transform TransformConfig
}

// ServerConfig はサーバー設定を表す
type ServerConfig struct {
	Port  int
	Debug bool
}

// AuthConfig は認証設定を表す
type AuthConfig struct {
	Enabled bool
	JWT     JWTConfig
}

// JWTConfig はJWT認証設定を表す
type JWTConfig struct {
	Secret string
	Expiry time.Duration
	Issuer string
}

// StorageConfig はストレージ設定を表す
type StorageConfig struct {
	Endpoint        string
	AccessKey       string
	SecretKey       string
	UseSSL          bool
	TemporaryBucket string
	PermanentBucket string
	AccountID       string
}

// ImageConfig は画像設定を表す
type ImageConfig struct {
	Formats []string
	MaxSize int
}

// TransformConfig は画像変換設定を表す
type TransformConfig struct {
	Presets []PresetConfig
}

// PresetConfig は変換プリセット設定を表す
type PresetConfig struct {
	Name             string
	Width            int
	Height           int
	Quality          int
	Format           string
	PreserveOriginal bool
}

// Load は設定ファイルを読み込む
func Load(path string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(path)
	v.SetConfigType("toml")

	// 環境変数のサポートを有効化
	v.AutomaticEnv()

	// ${VAR}形式の環境変数を置換
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	if err := v.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("設定ファイルの読み込みに失敗しました: %w", err)
	}

	// 環境変数で設定値を上書き
	for _, key := range v.AllKeys() {
		val := v.GetString(key)
		if strings.HasPrefix(val, "${") && strings.HasSuffix(val, "}") {
			envVar := val[2 : len(val)-1]
			envVal := os.Getenv(envVar)
			if envVal != "" {
				v.Set(key, envVal)
			}
		}
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("設定のパースに失敗しました: %w", err)
	}

	// JWTの有効期限を文字列からDurationに変換
	if expiry, err := time.ParseDuration(v.GetString("auth.jwt.expiry")); err == nil {
		cfg.Auth.JWT.Expiry = expiry
	} else {
		return nil, fmt.Errorf("JWT有効期限のパースに失敗しました: %w", err)
	}

	return &cfg, nil
}

// IsAuthEnabled は認証が有効かどうかを返す
func (c *Config) IsAuthEnabled() bool {
	return c.Auth.Enabled
}

// GetPresetByName はプリセット名からプリセット設定を取得する
func (c *Config) GetPresetByName(name string) (*PresetConfig, error) {
	for _, preset := range c.Transform.Presets {
		if preset.Name == name {
			return &preset, nil
		}
	}
	return nil, fmt.Errorf("プリセット '%s' が見つかりません", name)
}

// IsSupportedFormat は指定されたフォーマットがサポートされているかどうかを返す
func (c *Config) IsSupportedFormat(format string) bool {
	format = strings.ToLower(format)
	return contains(c.Image.Formats, format)
}

// contains はスライスに指定された要素が含まれているかどうかを返す
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
