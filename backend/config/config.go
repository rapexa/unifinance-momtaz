package config

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
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

	// StaticDir, when set, is a built frontend (dist) served by the API itself on the same
	// origin — used by the Docker image so one container serves one customer.
	StaticDir string `mapstructure:"static_dir"`

	Bootstrap BootstrapConfig `mapstructure:"bootstrap"`
	License   LicenseConfig   `mapstructure:"license"`
	SaaS      SaaSConfig      `mapstructure:"saas"`
}

// BootstrapConfig seeds a fresh installation (new customer). It is used only while the
// database has no full-access admin yet; later changes are made in the app.
type BootstrapConfig struct {
	OrgName        string `mapstructure:"org_name"`
	AdminEmail     string `mapstructure:"admin_email"`
	AdminPassword  string `mapstructure:"admin_password"`
	AdminFirstName string `mapstructure:"admin_first_name"`
	AdminLastName  string `mapstructure:"admin_last_name"`
	AdminPhone     string `mapstructure:"admin_phone"`
}

// LicenseConfig holds the customer's license key (see pkg/license). A key saved from the
// settings page takes precedence over this one.
type LicenseConfig struct {
	Key     string `mapstructure:"key"`
	KeyFile string `mapstructure:"key_file"`
	// Owner marks the owner installation (free, unlimited). Only honored by builds that allow
	// it (source builds); customer Docker images ignore it. Normally not needed: an existing
	// database is detected automatically.
	Owner bool `mapstructure:"owner"`
}

// SaaSConfig configures the vendor's own instance (sales page, demo requests).
type SaaSConfig struct {
	// Vendor enables the public sales page at "/" and the demo-request (lead) inbox.
	Vendor bool `mapstructure:"vendor"`
	// ProductName is shown on the sales page.
	ProductName string `mapstructure:"product_name"`
	// NotifyPhone receives an SMS for every new demo request (needs melipayamak.from).
	NotifyPhone string `mapstructure:"notify_phone"`
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
		// Every key can be overridden by an environment variable with the UNIFINANCE_
		// prefix, e.g. UNIFINANCE_DB_PASS or UNIFINANCE_BOOTSTRAP_ADMIN_EMAIL (Docker).
		v.SetEnvPrefix("UNIFINANCE")
		v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
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

	v.SetDefault("static_dir", "")
	v.SetDefault("bootstrap.org_name", "")
	v.SetDefault("bootstrap.admin_email", "")
	v.SetDefault("bootstrap.admin_password", "")
	v.SetDefault("bootstrap.admin_first_name", "")
	v.SetDefault("bootstrap.admin_last_name", "")
	v.SetDefault("bootstrap.admin_phone", "")
	v.SetDefault("license.key", "")
	v.SetDefault("license.key_file", "")
	v.SetDefault("license.owner", false)
	v.SetDefault("saas.vendor", false)
	v.SetDefault("saas.product_name", "یونی‌فایننس")
	v.SetDefault("saas.notify_phone", "")
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
	if strings.TrimSpace(c.SaaS.ProductName) == "" {
		c.SaaS.ProductName = "یونی‌فایننس"
	}
	if len(c.CORS.AllowOrigins) == 1 && strings.Contains(c.CORS.AllowOrigins[0], ",") {
		// UNIFINANCE_CORS_ALLOW_ORIGINS="https://a,https://b"
		parts := strings.Split(c.CORS.AllowOrigins[0], ",")
		c.CORS.AllowOrigins = c.CORS.AllowOrigins[:0]
		for _, p := range parts {
			if p = strings.TrimSpace(p); p != "" {
				c.CORS.AllowOrigins = append(c.CORS.AllowOrigins, p)
			}
		}
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
