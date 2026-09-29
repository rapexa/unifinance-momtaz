package config

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"

	"github.com/spf13/viper"
)

// Config is loaded from config.yaml (see config.example.yaml).
type Config struct {
	AppEnv string `mapstructure:"app_env"`

	Server ServerConfig `mapstructure:"server"`
	DB     DBConfig     `mapstructure:"db"`
	JWT    JWTConfig    `mapstructure:"jwt"`
	CORS   CORSConfig   `mapstructure:"cors"`

	Zarinpal    ZarinpalConfig    `mapstructure:"zarinpal"`
	FrontendURL string            `mapstructure:"frontend_url"`
	Melipayamak MelipayamakConfig `mapstructure:"melipayamak"`
}

type ServerConfig struct {
	Addr string `mapstructure:"addr"`
}

type DBConfig struct {
	Host     string `mapstructure:"host"`
	Port     string `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Pass     string `mapstructure:"pass"`
	Name     string `mapstructure:"name"`
	Charset  string `mapstructure:"charset"`
	Timezone string `mapstructure:"timezone"`
}

type JWTConfig struct {
	Secret             string `mapstructure:"secret"`
	Issuer             string `mapstructure:"issuer"`
	ExpiryHours        int    `mapstructure:"expiry_hours"`
	RefreshExpiryHours int    `mapstructure:"refresh_expiry_hours"`
}

type CORSConfig struct {
	AllowOrigins []string `mapstructure:"allow_origins"`
}

type ZarinpalConfig struct {
	MerchantID  string `mapstructure:"merchant_id"`
	Sandbox     bool   `mapstructure:"sandbox"`
	CallbackURL string `mapstructure:"callback_url"`
}

type MelipayamakConfig struct {
	Username string `mapstructure:"username"`
	APIKey   string `mapstructure:"api_key"`
	// From is the sender line number. When set, reminders are sent as free text from the
	// editable templates; otherwise the fixed panel patterns (bodyId) are used.
	From string `mapstructure:"from"`
}

var (
	cfg        *Config
	once       sync.Once
	configPath string
)

// ConfigFilePath returns the path of the loaded config.yaml (empty if none).
func ConfigFilePath() string { return configPath }

// LoadConfig loads configuration from config.yaml (preferred) with sensible defaults.
func LoadConfig() (*Config, error) {
	var err error

	once.Do(func() {
		v := viper.New()
		v.SetConfigName("config")
		v.SetConfigType("yaml")
		v.AddConfigPath(".")
		v.AddConfigPath("./backend")
		if exe, e := os.Executable(); e == nil {
			v.AddConfigPath(filepath.Dir(exe))
		}
		v.AutomaticEnv()

		setDefaults(v)

		if readErr := v.ReadInConfig(); readErr != nil {
			log.Printf("config: could not read config.yaml: %v (using defaults only)", readErr)
			WarnIfMissingConfigFile()
		} else {
			configPath = v.ConfigFileUsed()
			log.Printf("config: loaded %s", configPath)
		}

		c := &Config{}
		if unmarshalErr := v.Unmarshal(c); unmarshalErr != nil {
			err = unmarshalErr
			return
		}
		normalize(c)
		cfg = c
		log.Printf("config: app_env=%s db=%s@%s:%s/%s frontend=%s",
			c.AppEnv, c.DB.User, c.DB.Host, c.DB.Port, c.DB.Name, c.FrontendURL)
	})

	return cfg, err
}

func setDefaults(v *viper.Viper) {
	v.SetDefault("app_env", "development")
	v.SetDefault("server.addr", ":8081")

	v.SetDefault("db.host", "127.0.0.1")
	v.SetDefault("db.port", "3306")
	v.SetDefault("db.user", "root")
	v.SetDefault("db.pass", "")
	v.SetDefault("db.name", "momtaz")
	v.SetDefault("db.charset", "utf8mb4")
	v.SetDefault("db.timezone", "Local")

	v.SetDefault("jwt.secret", "dev-secret-change-me")
	v.SetDefault("jwt.issuer", "unifinance-api")
	v.SetDefault("jwt.expiry_hours", 24)
	v.SetDefault("jwt.refresh_expiry_hours", 24*7)

	v.SetDefault("cors.allow_origins", []string{
		"http://localhost:8080",
		"http://127.0.0.1:8080",
	})

	v.SetDefault("zarinpal.merchant_id", "")
	v.SetDefault("zarinpal.sandbox", true)
	v.SetDefault("zarinpal.callback_url", "http://localhost:8081/payment/callback")

	v.SetDefault("frontend_url", "http://localhost:8080")

	v.SetDefault("melipayamak.username", "")
	v.SetDefault("melipayamak.api_key", "")
	v.SetDefault("melipayamak.from", "")
}

func normalize(c *Config) {
	if c.Server.Addr == "" {
		c.Server.Addr = ":8081"
	}
	if c.DB.Charset == "" {
		c.DB.Charset = "utf8mb4"
	}
	if c.DB.Timezone == "" {
		c.DB.Timezone = "Local"
	}
	if c.JWT.ExpiryHours <= 0 {
		c.JWT.ExpiryHours = 24
	}
	if c.JWT.RefreshExpiryHours <= 0 {
		c.JWT.RefreshExpiryHours = 24 * 7
	}
	if len(c.CORS.AllowOrigins) == 0 {
		c.CORS.AllowOrigins = []string{"http://localhost:8080", "http://127.0.0.1:8080"}
	}
}

func MustLoadConfig() *Config {
	c, err := LoadConfig()
	if err != nil {
		log.Fatalf("config: failed to load configuration: %v", err)
	}
	if c == nil {
		log.Fatalf("config: configuration is nil")
	}
	return c
}

// WarnIfMissingConfigFile prints a tip when config.yaml is missing.
func WarnIfMissingConfigFile() {
	cwd, _ := os.Getwd()
	hint := filepath.Join(cwd, "config.yaml")
	fmt.Fprintf(os.Stderr, "config: tip — copy config.example.yaml to %s for local settings\n", hint)
}
