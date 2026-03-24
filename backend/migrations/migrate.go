package migrations

import (
	"log"

	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/database"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// Run executes all migrations and seeders.
// Exposed as a function so it can be called from different commands (e.g. cmd/migrate).
func Run() {
	cfg := config.MustLoadConfig()
	log.Printf("migrations: running in %s environment", cfg.AppEnv)

	db := database.MustGetDB()
	autoMigrate(db)
	backfillPaymentAdvisorShares(db)
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
		&models.Student{},
		&models.Enrollment{},
		&models.Payment{},
		&models.PayrollEntry{},
		&models.ReminderRule{},
		&models.PaymentReminder{},
	); err != nil {
		log.Fatalf("migrations: auto-migrate failed: %v", err)
	}
	log.Println("migrations: AutoMigrate finished successfully")
}

// backfillPaymentAdvisorShares sets advisor_share_cents on existing PAID rows from current student commission rules.
func backfillPaymentAdvisorShares(db *gorm.DB) {
	var ids []uint
	if err := db.Model(&models.Payment{}).
		Where("status = ?", models.PaymentStatusPaid).
		Pluck("id", &ids).Error; err != nil {
		log.Printf("migrations: backfill advisor shares: list ids: %v", err)
		return
	}
	for _, id := range ids {
		var p models.Payment
		if err := db.First(&p, id).Error; err != nil {
			continue
		}
		var st models.Student
		if err := db.First(&st, p.StudentID).Error; err != nil {
			continue
		}
		share := models.ComputeAdvisorShareCents(&st, p.AmountCents)
		if p.AdvisorShareCents == share {
			continue
		}
		if err := db.Model(&models.Payment{}).Where("id = ?", id).Update("advisor_share_cents", share).Error; err != nil {
			log.Printf("migrations: backfill payment %d: %v", id, err)
		}
	}
	if len(ids) > 0 {
		log.Printf("migrations: backfill advisor_share_cents checked %d paid payments", len(ids))
	}
}

func ptrI64(v int64) *int64  { return &v }
func ptrF64(v float64) *float64 { return &v }

func seedRolesAndPermissions(db *gorm.DB) {
	type seed struct {
		role  models.Role
		perms []models.Permission
	}
	z := int64(0)
	p8 := 8.0
	unit := int64(10_000_000) // هر ۱۰ میلیون ریال حجم پرداخت دانش‌آموزان
	perUnit := int64(500_000) // مبلغ به ریال (کوچک‌ترین واحد ذخیره: سنت در مدل = ریال در پروژه فعلی)

	seeds := []seed{
		{
			role: models.Role{
				Code:               models.RoleCodeGeneralManager,
				Name:               "مدیرکل",
				Description:        "دسترسی کامل",
				IsSystem:           true,
				FullAccess:         true,
				CompensationKind:   models.CompFixed,
				FixedCents:         ptrI64(z),
			},
			perms: models.AllPermissions,
		},
		{
			role: models.Role{
				Code:                     models.RoleCodeAdvisor,
				Name:                     "مشاور",
				IsSystem:                 true,
				FullAccess:               false,
				CompensationKind:         models.CompPercent,
				PercentOfStudentPayments: ptrF64(p8),
			},
			perms: []models.Permission{models.PermStudents, models.PermPayments, models.PermPlans},
		},
		{
			role: models.Role{
				Code:             models.RoleCodeSecretary,
				Name:             "منشی",
				IsSystem:         true,
				FullAccess:       false,
				CompensationKind: models.CompFixed,
				FixedCents:       ptrI64(50_000_000),
			},
			perms: []models.Permission{models.PermStudents, models.PermPayments, models.PermPlans, models.PermReminders},
		},
		{
			role: models.Role{
				Code:             models.RoleCodeSupport,
				Name:             "پشتیبان",
				IsSystem:         true,
				FullAccess:       false,
				CompensationKind: models.CompFixed,
				FixedCents:       ptrI64(40_000_000),
			},
			perms: []models.Permission{models.PermStudents, models.PermSettings},
		},
		{
			role: models.Role{
				Code:             models.RoleCodeExecutiveManager,
				Name:             "مدیر اجرایی",
				IsSystem:         true,
				FullAccess:       false,
				CompensationKind: models.CompFixed,
				FixedCents:       ptrI64(80_000_000),
			},
			perms: []models.Permission{models.PermDashboard, models.PermPayments, models.PermPayroll, models.PermPlans, models.PermReports},
		},
		{
			role: models.Role{
				Code:               models.RoleCodeAdvisorLead,
				Name:               "سرپرست مشاوران",
				IsSystem:           true,
				FullAccess:         false,
				CompensationKind:   models.CompPerUnit,
				RevenueUnitCents:   ptrI64(unit),
				AmountPerUnitCents: ptrI64(perUnit),
			},
			perms: []models.Permission{models.PermStudents, models.PermPayments, models.PermPlans, models.PermReports},
		},
	}

	for i := range seeds {
		ensureRole(db, &seeds[i].role, seeds[i].perms)
	}
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
		existing.PercentOfStudentPayments = r.PercentOfStudentPayments
		existing.RevenueUnitCents = r.RevenueUnitCents
		existing.AmountPerUnitCents = r.AmountPerUnitCents
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
		"ADVISOR":    models.RoleCodeAdvisor,
		"ACCOUNTANT": models.RoleCodeExecutiveManager,
		"OPERATOR":   models.RoleCodeSupport,
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
	var adv models.Role
	if err := db.Where("code = ?", models.RoleCodeAdvisor).First(&adv).Error; err != nil {
		log.Fatalf("migrations: advisor role missing: %v", err)
	}
	if err := db.Model(&models.User{}).Where("role_id = ? OR role_id IS NULL", 0).Update("role_id", adv.ID).Error; err != nil {
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

	// Ensure existing admin has general_manager role and permissions
	var adminUser models.User
	if err := db.Where("email = ?", adminEmail).First(&adminUser).Error; err == nil {
		if adminUser.RoleID != gm.ID {
			adminUser.RoleID = gm.ID
			_ = db.Save(&adminUser)
		}
	}
}
