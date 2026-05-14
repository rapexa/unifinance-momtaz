package migrations

import (
	"context"
	"log"

	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/database"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"github.com/soheilsshh/unifinance-momtaz/services"
	"gorm.io/gorm"
)

// Run executes all migrations and seeders.
func Run() {
	cfg := config.MustLoadConfig()
	log.Printf("migrations: running in %s environment", cfg.AppEnv)

	db := database.MustGetDB()
	autoMigrate(db)
	backfillPaymentPayrollShares(db)
	seedRolesAndPermissions(db)
	migrateLegacyUserRoleColumn(db)
	fixUsersWithoutRole(db)
	seedOrganizationAndAdmin(db)
}

func autoMigrate(db *gorm.DB) {
	if err := db.AutoMigrate(
		&models.Role{},
		&models.RolePermission{},
		&models.Organization{},
		&models.User{},
		&models.UserPermission{},
		&models.PaymentSettings{},
		&models.NotificationSetting{},
		&models.Plan{},
		&models.PlanFeature{},
		&models.CompensationRule{},
		&models.CompensationRuleStudent{},
		&models.CompensationRuleUserStudent{},
		&models.Student{},
		&models.StudentRolePayout{},
		&models.Enrollment{},
		&models.Payment{},
		&models.PaymentPayrollShare{},
		&models.PayrollEntry{},
		&models.ReminderRule{},
		&models.PaymentReminder{},
		&models.FiscalYear{},
	); err != nil {
		log.Fatalf("migrations: auto-migrate failed: %v", err)
	}
	log.Println("migrations: AutoMigrate finished successfully")
}

// backfillPaymentPayrollShares rebuilds payment split rows for all PAID payments.
func backfillPaymentPayrollShares(db *gorm.DB) {
	repo := repositories.NewPaymentRepository(db)
	ps := services.NewPaymentService(repo, db, nil)
	if err := ps.RebuildAllPaidPaymentPayrollShares(context.Background()); err != nil {
		log.Printf("migrations: backfill payment payroll shares: %v", err)
		return
	}
	log.Println("migrations: payment payroll shares backfill finished")
}

func ptrI64(v int64) *int64 { return &v }

func seedRolesAndPermissions(db *gorm.DB) {
	// Only the general_manager is a system (built-in) role.
	// All other roles are created by the organization admin via the UI.
	z := int64(0)
	gm := models.Role{
		Code:             models.RoleCodeGeneralManager,
		Name:             "مدیرکل",
		Description:      "مدیرکل مجموعه — دسترسی کامل",
		IsSystem:         true,
		FullAccess:       true,
		CompensationKind: models.CompFixed,
		FixedCents:       ptrI64(z),
	}
	ensureRole(db, &gm, models.AllPermissions)
	log.Println("migrations: roles and role_permissions seeded")
}

func ensureRole(db *gorm.DB, r *models.Role, perms []models.Permission) {
	var existing models.Role
	err := db.Where("code = ?", r.Code).First(&existing).Error
	if err == gorm.ErrRecordNotFound {
		if err := db.Create(r).Error; err != nil {
			log.Fatalf("migrations: create role %s: %v", r.Code, err)
		}
		existing = *r
	} else if err != nil {
		log.Fatalf("migrations: load role %s: %v", r.Code, err)
	} else {
		existing.Name = r.Name
		existing.Description = r.Description
		existing.IsSystem = r.IsSystem
		existing.FullAccess = r.FullAccess
		existing.CompensationKind = r.CompensationKind
		existing.FixedCents = r.FixedCents
		if err := db.Save(&existing).Error; err != nil {
			log.Fatalf("migrations: update role %s: %v", r.Code, err)
		}
	}

	if err := db.Unscoped().Where("role_id = ?", existing.ID).Delete(&models.RolePermission{}).Error; err != nil {
		log.Fatalf("migrations: clear role_permissions %s: %v", r.Code, err)
	}
	for _, p := range perms {
		if err := db.Create(&models.RolePermission{RoleID: existing.ID, Permission: p}).Error; err != nil {
			log.Fatalf("migrations: seed role_permission %s %s: %v", r.Code, p, err)
		}
	}
}

func migrateLegacyUserRoleColumn(db *gorm.DB) {
	if !db.Migrator().HasColumn(&models.User{}, "role") {
		return
	}
	mapping := map[string]string{
		"ADMIN":      models.RoleCodeGeneralManager,
		"ADVISOR":    models.RoleCodeGeneralManager,
		"ACCOUNTANT": models.RoleCodeGeneralManager,
		"OPERATOR":   models.RoleCodeGeneralManager,
	}
	for old, code := range mapping {
		if err := db.Exec(`
			UPDATE users u
			INNER JOIN roles r ON r.code = ?
			SET u.role_id = r.id
			WHERE u.role = ?
		`, code, old).Error; err != nil {
			log.Printf("migrations: warning legacy role map %s->%s: %v", old, code, err)
		}
	}
	log.Println("migrations: legacy user.role column mapped to role_id (if present)")
}

func fixUsersWithoutRole(db *gorm.DB) {
	var gm models.Role
	if err := db.Where("code = ?", models.RoleCodeGeneralManager).First(&gm).Error; err != nil {
		log.Fatalf("migrations: general_manager role missing: %v", err)
	}
	if err := db.Model(&models.User{}).Where("role_id = ? OR role_id IS NULL", 0).Update("role_id", gm.ID).Error; err != nil {
		log.Printf("migrations: warning fixUsersWithoutRole: %v", err)
	}
}

func seedOrganizationAndAdmin(db *gorm.DB) {
	org := models.Organization{
		Name:  "گروه مشاوره تحصیلی و روانشناسی",
		Phone: "021-88888888",
		Email: "info@example.com",
	}

	if err := db.Where("name = ?", org.Name).FirstOrCreate(&org).Error; err != nil {
		log.Fatalf("migrations: failed to seed organization: %v", err)
	}

	var gm models.Role
	if err := db.Where("code = ?", models.RoleCodeGeneralManager).First(&gm).Error; err != nil {
		log.Fatalf("migrations: general_manager role missing: %v", err)
	}

	const adminEmail = "admin@example.com"

	var count int64
	if err := db.Model(&models.User{}).
		Where("email = ?", adminEmail).
		Count(&count).Error; err != nil {
		log.Fatalf("migrations: failed to check admin user: %v", err)
	}

	if count == 0 {
		admin := models.User{
			FirstName:      "مدیر",
			LastName:       "سیستم",
			Email:          adminEmail,
			Phone:          "09121234567",
			IsActive:       true,
			PlainPassword:  "change-me-please",
			OrganizationID: &org.ID,
			RoleID:         gm.ID,
		}

		if err := db.Create(&admin).Error; err != nil {
			log.Fatalf("migrations: failed to create admin user: %v", err)
		}
		for _, p := range models.AllPermissions {
			if err := db.Create(&models.UserPermission{UserID: admin.ID, Permission: p}).Error; err != nil {
				log.Printf("migrations: warning seeding admin permission %s: %v", p, err)
			}
		}
		log.Println("migrations: seeded default admin user (email: admin@example.com, password: change-me-please). Please change this in production.")
		return
	}

	var adminUser models.User
	if err := db.Where("email = ?", adminEmail).First(&adminUser).Error; err == nil {
		if adminUser.RoleID != gm.ID {
			adminUser.RoleID = gm.ID
			_ = db.Save(&adminUser)
		}
	}
}
