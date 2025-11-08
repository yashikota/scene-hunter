// Package config provides configuration management for the scene-hunter server.
package config

import (
	"log/slog"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// AppConfig represents the application configuration.
type AppConfig struct {
	Server   serverConfig   `mapstructure:"server"`
	Database databaseConfig `mapstructure:"database"`
	Kvs      kvsConfig      `mapstructure:"kvs"`
	Blob     blobConfig     `mapstructure:"blob"`
	Logger   loggerConfig   `mapstructure:"logger"`
}

type serverConfig struct {
	Port         string        `mapstructure:"port"`
	ReadTimeout  time.Duration `mapstructure:"read_timeout"`
	WriteTimeout time.Duration `mapstructure:"write_timeout"`
	IdleTimeout  time.Duration `mapstructure:"idle_timeout"`
}

type databaseConfig struct {
	Host     string `mapstructure:"host"`
	Port     uint16 `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	Dbname   string `mapstructure:"dbname"`
	Sslmode  string `mapstructure:"sslmode"`
}

type kvsConfig struct {
	URL string `mapstructure:"url"`
}

type blobConfig struct {
	URL string `mapstructure:"url"`
}

type loggerConfig struct {
	Level slog.Level `mapstructure:"level"`
}

// LoadConfig loads the configuration from the config.toml file.
func LoadConfig() *AppConfig {
	return LoadConfigFromPath(".")
}

// LoadConfigFromPath loads the configuration from the specified path.
// This function is primarily for testing purposes.
func LoadConfigFromPath(configPath string) *AppConfig {
	var config AppConfig

	viper := viper.New()
	viper.SetConfigName("config")
	viper.AddConfigPath(configPath)

	// Set default values
	viper.SetDefault("server.port", ":8686")
	viper.SetDefault("server.read_timeout", 30*time.Second)
	viper.SetDefault("server.write_timeout", 30*time.Second)
	viper.SetDefault("server.idle_timeout", 60*time.Second)
	viper.SetDefault("logger.level", slog.LevelDebug)

	// Load environment variables
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	viper.AutomaticEnv()

	// Load configuration file
	err := viper.ReadInConfig()
	if err != nil {
		panic(err)
	}

	// Unmarshal configuration into struct
	err = viper.Unmarshal(&config)
	if err != nil {
		panic(err)
	}

	return &config
}
