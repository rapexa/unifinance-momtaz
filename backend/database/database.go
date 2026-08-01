package database

import (
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/config"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	db   *gorm.DB
	once sync.Once
)

// Init initializes the global GORM DB instance using Viper configuration.
func Init() (*gorm.DB, error) {
	var err error

	once.Do(func() {
		cfg := config.MustLoadConfig()

		dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=%s&parseTime=True&loc=%s",
			cfg.DB.User,
			cfg.DB.Pass,
			cfg.DB.Host,
			cfg.DB.Port,
			cfg.DB.Name,
			cfg.DB.Charset,
			cfg.DB.Timezone,
		)

		logLevel := logger.Silent
		if cfg.AppEnv == "development" {
			logLevel = logger.Info
		}

		gormLogger := logger.New(
			log.New(os.Stdout, "[gorm] ", log.LstdFlags),
			logger.Config{
				SlowThreshold:             time.Second,
				LogLevel:                  logLevel,
				IgnoreRecordNotFoundError: true,
				Colorful:                  true,
			},
		)

		db, err = gorm.Open(mysql.Open(dsn), &gorm.Config{
			Logger: gormLogger,
		})
	})

	return db, err
}

// MustGetDB returns the DB instance or fatals if connection cannot be established.
func MustGetDB() *gorm.DB {
	d, err := Init()
	if err != nil {
		log.Fatalf("database: failed to connect to database: %v", err)
	}
	return d
}

