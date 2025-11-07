// Package config provides configuration management for the scene-hunter server.
package config

import "github.com/spf13/viper"

// LoadConfig loads the configuration from the config.toml file.
func LoadConfig() *viper.Viper {
	viper := viper.New()
	viper.SetConfigName("config")
	viper.AddConfigPath(".")

	err := viper.ReadInConfig()
	if err != nil {
		panic(err)
	}

	return viper
}
