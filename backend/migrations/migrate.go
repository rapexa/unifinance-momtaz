package migrations

import (
	"context"
	"log"
	"strings"
	"time"

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
	// Roles + orphan role_id cleanup must run BEFORE AutoMigrate adds fk_roles_users.
	prepareUserRoleForeignKey(db)
	autoMigrate(db)
	markLicenseOwner(db)
	backfillRolePayrollMonths(db)
	backfillPaymentPayrollShares(db)
	migratePaidPayslipsToStaffPayouts(db)
	seedCostCenters(db)
	seedRolesAndPermissions(db)
	migrateLegacyUserRoleColumn(db)
	fixUsersWithoutRole(db)
	seedOrganizationAndAdmin(db)
}

// prepareUserRoleForeignKey ensures the roles table/seed exist and every users.role_id
// points at a real role, so AutoMigrate can add CONSTRAINT fk_roles_users without Error 1452.
func prepareUserRoleForeignKey(db *gorm.DB) {
	// Migrating Role (which has Users association) can try to add the FK before data is clean.
	prevDisableFK := db.DisableForeignKeyConstraintWhenMigrating
	db.DisableForeignKeyConstraintWhenMigrating = true
	if err := db.AutoMigrate(&models.Role{}, &models.RolePermission{}); err != nil {
		db.DisableForeignKeyConstraintWhenMigrating = prevDisableFK
		log.Fatalf("migrations: prepare roles tables failed: %v", err)
	}
	db.DisableForeignKeyConstraintWhenMigrating = prevDisableFK

	seedRolesAndPermissions(db)

	if !db.Migrator().HasTable(&models.User{}) {
		return
	}
	if !db.Migrator().HasColumn(&models.User{}, "role_id") {
		return
	}

	var gm models.Role
	if err := db.Where("code = ?", models.RoleCodeGeneralManager).First(&gm).Error; err != nil {
		log.Fatalf("migrations: general_manager role missing before FK fix: %v", err)
	}

	// Drop a half-created FK if a previous migrate failed mid-way (MySQL name used by GORM).
	_ = db.Exec("ALTER TABLE `users` DROP FOREIGN KEY `fk_roles_users`").Error

	res := db.Exec(`
		UPDATE users u
		LEFT JOIN roles r ON r.id = u.role_id
		SET u.role_id = ?
		WHERE u.role_id = 0 OR u.role_id IS NULL OR r.id IS NULL
	`, gm.ID)
	if res.Error != nil {
		log.Fatalf("migrations: fix orphaned users.role_id failed: %v", res.Error)
	}
	if res.RowsAffected > 0 {
		log.Printf("migrations: repaired %d user(s) with missing/invalid role_id → general_manager", res.RowsAffected)
	}
}

func autoMigrate(db *gorm.DB) {
	if err := db.AutoMigrate(
		&models.Role{},
		&models.RolePermission{},
		&models.BankAccount{},
		&models.Organization{},
		&models.User{},
		&models.UserPermission{},
		&models.PaymentSettings{},
		&models.NotificationSetting{},
		&models.Plan{},
		&models.PlanFeature{},
		&models.Student{},
		&models.StudentRolePayout{},
		&models.Enrollment{},
		&models.SchoolContract{},
		&models.Payment{},
		&models.PaymentPayrollShare{},
		&models.PayrollEntry{},
		&models.ReminderRule{},
		&models.PaymentReminder{},
		&models.PayrollReminder{},
		&models.FiscalYear{},
		&models.StaffPayout{},
		&models.SchemaMarker{},
		&models.CostCenter{},
		&models.Expense{},
		&models.MessageTemplate{},
		&models.AppSetting{},
		&models.Lead{},
	); err != nil {
		log.Fatalf("migrations: auto-migrate failed: %v", err)
	}
	log.Println("migrations: AutoMigrate finished successfully")
	relaxPaymentStudentIDNotNull(db)
	backfillStudentRegistrationChannel(db)
}

// backfillStudentRegistrationChannel sets PRIVATE for legacy rows with empty channel.
func backfillStudentRegistrationChannel(db *gorm.DB) {
	res := db.Exec(`UPDATE students SET registration_channel = ? WHERE registration_channel = '' OR registration_channel IS NULL`,
		models.RegistrationChannelPrivate)
	if res.Error != nil {
		log.Printf("migrations: backfill registration_channel: %v", res.Error)
		return
	}
	if res.RowsAffected > 0 {
		log.Printf("migrations: set registration_channel=PRIVATE on %d student(s)", res.RowsAffected)
	}
}

// relaxPaymentStudentIDNotNull allows school-contract payments without a student_id.
// GORM AutoMigrate often keeps an existing NOT NULL constraint; drop it explicitly on MySQL.
func relaxPaymentStudentIDNotNull(db *gorm.DB) {
	if err := db.Exec("ALTER TABLE payments MODIFY COLUMN student_id BIGINT UNSIGNED NULL").Error; err != nil {
		log.Printf("migrations: relax payments.student_id nullability: %v", err)
		return
	}
	log.Println("migrations: payments.student_id is nullable")
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

// runOnce executes fn a single time per database, recorded in schema_markers.
func runOnce(db *gorm.DB, name string, fn func(tx *gorm.DB) error) {
	var n int64
	if err := db.Model(&models.SchemaMarker{}).Where("name = ?", name).Count(&n).Error; err != nil {
		log.Printf("migrations: check marker %s: %v", name, err)
		return
	}
	if n > 0 {
		return
	}
	if err := db.Transaction(func(tx *gorm.DB) error {
		if err := fn(tx); err != nil {
			return err
		}
		return tx.Create(&models.SchemaMarker{Name: name}).Error
	}); err != nil {
		log.Printf("migrations: %s failed: %v", name, err)
		return
	}
	log.Printf("migrations: %s finished", name)
}

// migratePaidPayslipsToStaffPayouts converts payslips that were toggled "paid" before the
// staff ledger existed into payout rows, so the running balance keeps them as paid.
// Staff members who already have payouts recorded were using the payout ledger (the toggle
// only locked the payslip there), so their payslips are not converted to avoid double counting.
func migratePaidPayslipsToStaffPayouts(db *gorm.DB) {
	runOnce(db, "2026_09_staff_ledger_paid_payslips", func(tx *gorm.DB) error {
		var withPayouts []uint
		if err := tx.Model(&models.StaffPayout{}).Distinct("user_id").Pluck("user_id", &withPayouts).Error; err != nil {
			return err
		}
		skip := make(map[uint]bool, len(withPayouts))
		for _, id := range withPayouts {
			skip[id] = true
		}
		var entries []models.PayrollEntry
		if err := tx.Where("status = ? AND total_salary_cents > 0", models.PayrollStatusPaid).
			Order("period_year, period_month, id").Find(&entries).Error; err != nil {
			return err
		}
		converted := 0
		for _, e := range entries {
			if skip[e.UserID] {
				continue
			}
			paidAt := time.Now()
			if e.PaidAt != nil {
				paidAt = *e.PaidAt
			}
			id := e.ID
			row := models.StaffPayout{
				UserID:         e.UserID,
				AmountCents:    e.TotalSalaryCents,
				PaidAt:         paidAt,
				Note:           "انتقال از فیش پرداخت‌شده " + services.FormatPeriodLabel(e.PeriodYear, e.PeriodMonth),
				PayrollEntryID: &id,
				Source:         models.StaffPayoutSourceMigrated,
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
			converted++
		}
		log.Printf("migrations: converted %d paid payslip(s) into staff payouts (skipped %d staff with existing payouts)", converted, len(skip))
		return nil
	})
}

// seedCostCenters creates the built-in salary cost center and a rent example once.
func seedCostCenters(db *gorm.DB) {
	runOnce(db, "2026_09_seed_cost_centers", func(tx *gorm.DB) error {
		var n int64
		if err := tx.Model(&models.CostCenter{}).Where("kind = ?", models.CostCenterKindSalary).Count(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			if err := tx.Create(&models.CostCenter{
				Name: "حقوق و دستمزد", Kind: models.CostCenterKindSalary, IsSystem: true, IsActive: true,
				Description: "پرداخت‌های ثبت‌شده به مشاوران و کارکنان (خودکار از بخش حقوق)",
			}).Error; err != nil {
				return err
			}
		}
		var total int64
		if err := tx.Model(&models.CostCenter{}).Count(&total).Error; err != nil {
			return err
		}
		if total <= 1 {
			return tx.Create(&models.CostCenter{Name: "اجاره دفتر", Kind: models.CostCenterKindGeneral, IsActive: true, SortOrder: 1}).Error
		}
		return nil
	})
}

func ptrI64(v int64) *int64 { return &v }

func ptrInt(v int) *int { return &v }

func backfillRolePayrollMonths(db *gorm.DB) {
	var roles []models.Role
	if err := db.Find(&roles).Error; err != nil {
		log.Printf("migrations: backfill role payroll months load: %v", err)
		return
	}
	for _, r := range roles {
		if r.PayrollMonthsCount != nil && *r.PayrollMonthsCount > 0 {
			continue
		}
		n := models.DefaultPayrollMonthsForKind(r.CompensationKind)
		if err := db.Model(&models.Role{}).Where("id = ?", r.ID).
			Update("payroll_months_count", n).Error; err != nil {
			log.Printf("migrations: backfill payroll_months_count role %d: %v", r.ID, err)
		}
	}
	log.Println("migrations: role payroll_months_count backfill finished")
}

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
		CompensationKind:   models.CompFixed,
		FixedCents:         ptrI64(z),
		PayrollMonthsCount: ptrInt(12),
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
		if existing.PayrollMonthsCount == nil {
			existing.PayrollMonthsCount = r.PayrollMonthsCount
		}
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

// markLicenseOwner records, once, whether this database existed before licensing was
// introduced. It runs before any seeding: an existing installation already has users (the
// owner, گروه مشاوره ممتاز → free and unlimited); a new customer's database is still empty and
// needs a license.
func markLicenseOwner(db *gorm.DB) {
	var existing int64
	if err := db.Model(&models.AppSetting{}).Where("`key` = ?", models.AppSettingLicenseOwner).
		Count(&existing).Error; err != nil || existing > 0 {
		return
	}
	var users int64
	if err := db.Unscoped().Model(&models.User{}).Count(&users).Error; err != nil {
		log.Printf("migrations: warning checking license owner: %v", err)
		return // decide on the next start
	}
	value := "0"
	if users > 0 {
		value = "1"
	}
	if err := db.Create(&models.AppSetting{Key: models.AppSettingLicenseOwner, Value: value}).Error; err != nil {
		log.Printf("migrations: warning saving license owner flag: %v", err)
		return
	}
	log.Printf("migrations: license owner installation = %s", value)
}

func seedOrganizationAndAdmin(db *gorm.DB) {
	cfg := config.MustLoadConfig()
	b := cfg.Bootstrap

	// One organization per installation: reuse the existing one (it may have been renamed
	// in settings), otherwise create it from bootstrap.org_name.
	var org models.Organization
	if err := db.Order("id ASC").First(&org).Error; err != nil {
		org = models.Organization{
			Name:  strings.TrimSpace(b.OrgName),
			Phone: "",
			Email: "",
		}
		if org.Name == "" {
			org.Name = "گروه مشاوره تحصیلی و روانشناسی"
		}
		if err := db.Create(&org).Error; err != nil {
			log.Fatalf("migrations: failed to seed organization: %v", err)
		}
	}

	var gm models.Role
	if err := db.Where("code = ?", models.RoleCodeGeneralManager).First(&gm).Error; err != nil {
		log.Fatalf("migrations: general_manager role missing: %v", err)
	}

	// Seed an admin only for a fresh installation (no general manager yet). Re-creating the
	// default account on every start would bring its default password back.
	var admins int64
	if err := db.Model(&models.User{}).Where("role_id = ?", gm.ID).Count(&admins).Error; err != nil {
		log.Fatalf("migrations: failed to check admin user: %v", err)
	}
	if admins > 0 {
		return
	}

	email := strings.ToLower(strings.TrimSpace(b.AdminEmail))
	password := b.AdminPassword
	defaultAccount := email == ""
	if defaultAccount {
		email = "admin@example.com"
		password = "change-me-please"
	}
	if len(password) < 8 {
		log.Fatalf("migrations: bootstrap.admin_password must be at least 8 characters")
	}
	first, last := strings.TrimSpace(b.AdminFirstName), strings.TrimSpace(b.AdminLastName)
	if first == "" && last == "" {
		first, last = "مدیر", "سیستم"
	}

	var existing models.User
	if err := db.Unscoped().Where("email = ?", email).First(&existing).Error; err == nil {
		// The account exists (maybe archived) but lost its role: promote it back.
		if err := db.Unscoped().Model(&existing).Updates(map[string]interface{}{
			"role_id": gm.ID, "is_active": true, "deleted_at": nil,
		}).Error; err != nil {
			log.Printf("migrations: warning restoring admin %s: %v", email, err)
		}
		return
	}

	admin := models.User{
		FirstName:      first,
		LastName:       last,
		Email:          email,
		Phone:          strings.TrimSpace(b.AdminPhone),
		IsActive:       true,
		PlainPassword:  password,
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
	if defaultAccount {
		log.Println("migrations: seeded default admin user (email: admin@example.com, password: change-me-please). Please change this in production.")
	} else {
		log.Printf("migrations: seeded admin user %s from bootstrap settings", email)
	}
}
