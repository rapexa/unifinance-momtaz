package config

import (
	"log"
	"sync"

	"github.com/spf13/viper"
)

type Config struct {
	AppEnv       string `mapstructure:"APP_ENV"`
	DBHost       string `mapstructure:"DB_HOST"`
	DBPort       string `mapstructure:"DB_PORT"`
	DBUser       string `mapstructure:"DB_USER"`
	DBPass       string `mapstructure:"DB_PASS"`
	DBName       string `mapstructure:"DB_NAME"`
	DBCharset    string `mapstructure:"DB_CHARSET"`
	DBTimeZone   string `mapstructure:"DB_TIMEZONE"`
	JWTSecret    string `mapstructure:"JWT_SECRET"`
	JWTIssuer    string `mapstructure:"JWT_ISSUER"`
	JWTExpiryHrs int    `mapstructure:"JWT_EXPIRY_HOURS"`
}

var (
	cfg  *Config
	once sync.Once
)

// LoadConfig loads configuration from .env (if present) and environment variables.
func LoadConfig() (*Config, error) {
	var err error

	once.Do(func() {
		viper.SetConfigFile(".env")
		viper.SetConfigType("env")

		// Read from environment variables as well
		viper.AutomaticEnv()

		// Defaults
		viper.SetDefault("APP_ENV", "development")
		viper.SetDefault("DB_HOST", "127.0.0.1")
		viper.SetDefault("DB_PORT", "3306")
		viper.SetDefault("DB_CHARSET", "utf8mb4")
		viper.SetDefault("DB_TIMEZONE", "Local")
		viper.SetDefault("JWT_SECRET", "dev-secret-change-me")
		viper.SetDefault("JWT_ISSUER", "unifinance-api")
		viper.SetDefault("JWT_EXPIRY_HOURS", 24)

		if readErr := viper.ReadInConfig(); readErr != nil {
			log.Printf("config: could not read .env file: %v (falling back to env vars only)", readErr)
		}

		c := &Config{}
		if unmarshalErr := viper.Unmarshal(c); unmarshalErr != nil {
			err = unmarshalErr
			return
		}
		cfg = c
	})

	return cfg, err
}

func MustLoadConfig() *Config {
	c, err := LoadConfig()
	if err != nil {
		log.Fatalf("config: failed to load configuration: %v", err)
	}
	return c
}

