package main

import (
	"log"

	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/database"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

func main() {
	cfg := config.MustLoadConfig()
	log.Printf("migrations: running in %s environment", cfg.AppEnv)

	db := database.MustGetDB()
	autoMigrate(db)
	seed(db)
}

func autoMigrate(db *gorm.DB) {
	if err := db.AutoMigrate(
		&models.Organization{},
		&models.User{},
		&models.PaymentSettings{},
		&models.NotificationSetting{},
		&models.Plan{},
		&models.PlanFeature{},
		&models.Student{},
		&models.Enrollment{},
		&models.Payment{},
		&models.PayrollScheme{},
		&models.PayrollEntry{},
		&models.ReminderRule{},
		&models.PaymentReminder{},
	); err != nil {
		log.Fatalf("migrations: auto-migrate failed: %v", err)
	}
	log.Println("migrations: AutoMigrate finished successfully")
}

func seed(db *gorm.DB) {
	// Seed a default organization based on frontend copy
	org := models.Organization{
		Name:  "گروه مشاوره تحصیلی و روانشناسی",
		Phone: "021-88888888",
		Email: "info@example.com",
	}

	if err := db.Where("name = ?", org.Name).FirstOrCreate(&org).Error; err != nil {
		log.Fatalf("migrations: failed to seed organization: %v", err)
	}

	// Seed an admin user if not present
	const adminEmail = "admin@example.com"

	var count int64
	if err := db.Model(&models.User{}).
		Where("email = ?", adminEmail).
		Count(&count).Error; err != nil {
		log.Fatalf("migrations: failed to check admin user: %v", err)
	}

	if count == 0 {
		admin := models.User{
			FirstName:     "مدیر",
			LastName:      "سیستم",
			Email:         adminEmail,
			Phone:         "09121234567",
			Role:          models.UserRoleAdmin,
			IsActive:      true,
			PlainPassword: "change-me-please",
			OrganizationID: &org.ID,
		}

		if err := db.Create(&admin).Error; err != nil {
			log.Fatalf("migrations: failed to create admin user: %v", err)
		}
		log.Println("migrations: seeded default admin user (email: admin@example.com, password: change-me-please). Please change this in production.")
	}
}

