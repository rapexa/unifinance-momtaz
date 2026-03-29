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
	// JWTRefreshExpiryHrs controls refresh token lifetime in hours.
	JWTRefreshExpiryHrs int `mapstructure:"JWT_REFRESH_EXPIRY_HOURS"`

	// ZarinPal payment gateway
	ZarinpalMerchantID  string `mapstructure:"ZARINPAL_MERCHANT_ID"`
	ZarinpalSandbox     bool   `mapstructure:"ZARINPAL_SANDBOX"`
	ZarinpalCallbackURL string `mapstructure:"ZARINPAL_CALLBACK_URL"`
	// FrontendURL is the base URL of the React frontend for post-payment redirects.
	FrontendURL string `mapstructure:"FRONTEND_URL"`

	// Melipayamak SMS gateway (ملی پیامک)
	MelipayamakUsername string `mapstructure:"MELIPAYAMAK_USERNAME"`
	MelipayamakAPIKey   string `mapstructure:"MELIPAYAMAK_API_KEY"`
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
		viper.SetDefault("DB_USER", "rapexa")
		viper.SetDefault("DB_PASS", "mgstudio884")
		viper.SetDefault("DB_NAME", "momtazuni")
		viper.SetDefault("DB_CHARSET", "utf8mb4")
		viper.SetDefault("DB_TIMEZONE", "Local")
		viper.SetDefault("JWT_SECRET", "dev-secret-change-me")
		viper.SetDefault("JWT_ISSUER", "unifinance-api")
		viper.SetDefault("JWT_EXPIRY_HOURS", 24)
		viper.SetDefault("JWT_REFRESH_EXPIRY_HOURS", 24*7)
		viper.SetDefault("ZARINPAL_MERCHANT_ID", "c099634b-fbfa-4485-852a-5e88916d901c")
		viper.SetDefault("ZARINPAL_SANDBOX", false)
		viper.SetDefault("ZARINPAL_CALLBACK_URL", "https://checkout.momtaz-team.ir/payment/callback")
		viper.SetDefault("FRONTEND_URL", "https://mali-momtazisho.ir")
		viper.SetDefault("MELIPAYAMAK_USERNAME", "")
		viper.SetDefault("MELIPAYAMAK_API_KEY", "2f8d3c35-160b-4d3c-9d29-b0a1b4d53b2a")

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
