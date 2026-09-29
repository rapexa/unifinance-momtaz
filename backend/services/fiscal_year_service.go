package services

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

var (
	ErrFiscalYearAlreadyOpen       = errors.New("یک سال مالی باز وجود دارد. ابتدا آن را ببندید")
	ErrFiscalYearNotFound          = errors.New("سال مالی یافت نشد")
	ErrFiscalYearNotOpen           = errors.New("این سال مالی باز نیست")
	ErrFiscalYearNotClosed         = errors.New("این سال مالی بسته نیست")
	ErrFiscalYearRestoreBlocked    = errors.New("سال مالی جدیدتری ثبت شده؛ بازگردانی امکان‌پذیر نیست")
	ErrFiscalYearMustBeClosedFirst = errors.New("فقط سال مالی بسته قابل حذف کامل است")
)

// fiscalCloseTables lists every table whose rows are soft-deleted by Close (and restored
// by Restore). Kept in one place so the two stay in sync.
var fiscalCloseTables = []string{
	"roles", "role_permissions",
	"users", "user_permissions", "notification_settings",
	"plans", "plan_features",
	"students", "enrollments",
	"student_role_payouts",
	"payroll_entries", "staff_payouts", "expenses",
	"payments", "payment_payroll_shares", "payment_reminders",
}

type FiscalYearService struct {
	db *gorm.DB
}

func NewFiscalYearService(db *gorm.DB) *FiscalYearService {
	return &FiscalYearService{db: db}
}

func (s *FiscalYearService) List(ctx context.Context) ([]models.FiscalYear, error) {
	var years []models.FiscalYear
	if err := s.db.WithContext(ctx).Order("id DESC").Find(&years).Error; err != nil {
		return nil, err
	}
	return years, nil
}

func (s *FiscalYearService) GetCurrent(ctx context.Context) (*models.FiscalYear, error) {
	var fy models.FiscalYear
	err := s.db.WithContext(ctx).
		Where("status = ?", models.FiscalYearOpen).
		First(&fy).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &fy, nil
}

type CreateFiscalYearInput struct {
	Name      string
	StartDate time.Time
}

func (s *FiscalYearService) UpdateName(ctx context.Context, id uint, name string) (*models.FiscalYear, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("نام سال مالی الزامی است")
	}

	var fy models.FiscalYear
	if err := s.db.WithContext(ctx).First(&fy, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFiscalYearNotFound
		}
		return nil, err
	}

	if err := s.db.WithContext(ctx).Model(&fy).Update("name", name).Error; err != nil {
		return nil, err
	}
	fy.Name = name
	return &fy, nil
}

func (s *FiscalYearService) Create(ctx context.Context, input CreateFiscalYearInput) (*models.FiscalYear, error) {
	existing, err := s.GetCurrent(ctx)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrFiscalYearAlreadyOpen
	}

	fy := &models.FiscalYear{
		Name:      input.Name,
		StartDate: input.StartDate,
		Status:    models.FiscalYearOpen,
	}
	if err := s.db.WithContext(ctx).Create(fy).Error; err != nil {
		return nil, err
	}
	return fy, nil
}

// Close closes the current fiscal year: generates a CSV snapshot, then soft-deletes
// all operational data so a full Restore remains possible until a new year is created.
// The system general-manager role and default admin user are never touched.
func (s *FiscalYearService) Close(ctx context.Context, id uint) (*models.FiscalYear, error) {
	var fy models.FiscalYear
	if err := s.db.WithContext(ctx).First(&fy, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFiscalYearNotFound
		}
		return nil, err
	}
	if fy.Status != models.FiscalYearOpen {
		return nil, ErrFiscalYearNotOpen
	}

	exportURL, err := s.generateExport(ctx, &fy)
	if err != nil {
		return nil, fmt.Errorf("خطا در تولید فایل خروجی: %w", err)
	}

	now := time.Now()
	// One canonical close timestamp (whole seconds) shared by every archived row and the
	// fiscal year record, so Restore can match them by exact equality.
	closedAt := now.Truncate(time.Second)
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var gm models.Role
		if err := tx.Where("code = ? AND is_system = ?", models.RoleCodeGeneralManager, true).
			First(&gm).Error; err != nil {
			return err
		}
		// Keep every general manager (not just the default admin@example.com account, whose
		// email a customer may have changed).
		var keepIDs []uint
		if err := tx.Model(&models.User{}).Where("role_id = ?", gm.ID).Pluck("id", &keepIDs).Error; err != nil {
			return err
		}
		if len(keepIDs) == 0 {
			return errors.New("هیچ کاربر مدیرکلی یافت نشد")
		}

		// --- Soft-delete operational data (most-dependent first) ---
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).
			Delete(&models.PaymentReminder{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).
			Delete(&models.PaymentPayrollShare{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).
			Delete(&models.Payment{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).
			Delete(&models.StaffPayout{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).
			Delete(&models.Expense{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).
			Delete(&models.PayrollEntry{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).
			Delete(&models.StudentRolePayout{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).
			Delete(&models.Enrollment{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).
			Delete(&models.Student{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).
			Delete(&models.PlanFeature{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).
			Delete(&models.Plan{}).Error; err != nil {
			return err
		}

		// Non-admin users, their permissions and notification settings.
		if err := tx.Where("user_id NOT IN ?", keepIDs).
			Delete(&models.UserPermission{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id NOT IN ?", keepIDs).
			Delete(&models.NotificationSetting{}).Error; err != nil {
			return err
		}
		if err := tx.Where("id NOT IN ?", keepIDs).
			Delete(&models.User{}).Error; err != nil {
			return err
		}

		// Non-system roles: collect IDs first so we can soft-delete their permissions.
		var nonSystemIDs []uint
		if err := tx.Model(&models.Role{}).
			Where("is_system = ?", false).
			Pluck("id", &nonSystemIDs).Error; err != nil {
			return err
		}
		if len(nonSystemIDs) > 0 {
			if err := tx.Where("role_id IN ?", nonSystemIDs).
				Delete(&models.RolePermission{}).Error; err != nil {
				return err
			}
			if err := tx.Where("id IN ?", nonSystemIDs).
				Delete(&models.Role{}).Error; err != nil {
				return err
			}
		}

		// Stamp every row soft-deleted in THIS close with one canonical timestamp so Restore
		// can match them exactly (deleted_at = closedAt) instead of a fuzzy time window.
		// Rows deleted before this close (deleted_at < now) are left untouched.
		for _, t := range fiscalCloseTables {
			if err := tx.Exec(
				"UPDATE `"+t+"` SET deleted_at = ? WHERE deleted_at IS NOT NULL AND deleted_at >= ?",
				closedAt, now,
			).Error; err != nil {
				return err
			}
		}

		return tx.Model(&fy).Updates(map[string]interface{}{
			"status":     models.FiscalYearClosed,
			"end_date":   closedAt,
			"closed_at":  closedAt,
			"export_url": exportURL,
		}).Error
	}); err != nil {
		return nil, err
	}

	fy.Status = models.FiscalYearClosed
	fy.EndDate = &closedAt
	fy.ClosedAt = &closedAt
	fy.ExportURL = exportURL
	return &fy, nil
}

// Restore undoes a Close: every row soft-deleted during that close is undeleted and
// the fiscal year is re-opened. Only allowed when no other year is OPEN and no newer
// fiscal year has been created after this one.
func (s *FiscalYearService) Restore(ctx context.Context, id uint) (*models.FiscalYear, error) {
	open, err := s.GetCurrent(ctx)
	if err != nil {
		return nil, err
	}
	if open != nil {
		return nil, ErrFiscalYearAlreadyOpen
	}

	var fy models.FiscalYear
	if err := s.db.WithContext(ctx).First(&fy, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFiscalYearNotFound
		}
		return nil, err
	}
	if fy.Status != models.FiscalYearClosed {
		return nil, ErrFiscalYearNotClosed
	}
	if fy.ClosedAt == nil {
		return nil, errors.New("سال مالی تاریخ بستن ندارد")
	}

	// Block restore if a newer fiscal year exists (user already started a new year).
	var laterCount int64
	if err := s.db.WithContext(ctx).Unscoped().Model(&models.FiscalYear{}).
		Where("id > ?", id).Count(&laterCount).Error; err != nil {
		return nil, err
	}
	if laterCount > 0 {
		return nil, ErrFiscalYearRestoreBlocked
	}

	// Close stamped every archived row with deleted_at = closed_at exactly, so we restore
	// precisely those rows — no fuzzy time window, no risk of reviving unrelated deletions.
	closedAt := *fy.ClosedAt

	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, t := range fiscalCloseTables {
			if err := tx.Exec(
				"UPDATE `"+t+"` SET deleted_at = NULL WHERE deleted_at = ?", closedAt,
			).Error; err != nil {
				return err
			}
		}
		return tx.Model(&fy).Updates(map[string]interface{}{
			"status":    models.FiscalYearOpen,
			"end_date":  gorm.Expr("NULL"),
			"closed_at": gorm.Expr("NULL"),
		}).Error
	}); err != nil {
		return nil, err
	}

	if err := s.db.WithContext(ctx).First(&fy, id).Error; err != nil {
		return nil, err
	}
	return &fy, nil
}

// Reopen marks a closed fiscal year as OPEN again. Only allowed when no other
// year is OPEN (same rule as starting a new year). Rows deleted by Close are
// not restored; the next setup must be recreated manually if needed.
func (s *FiscalYearService) Reopen(ctx context.Context, id uint) (*models.FiscalYear, error) {
	open, err := s.GetCurrent(ctx)
	if err != nil {
		return nil, err
	}
	if open != nil {
		return nil, ErrFiscalYearAlreadyOpen
	}

	var fy models.FiscalYear
	if err := s.db.WithContext(ctx).First(&fy, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFiscalYearNotFound
		}
		return nil, err
	}
	if fy.Status != models.FiscalYearClosed {
		return nil, ErrFiscalYearNotClosed
	}

	now := time.Now()
	// GORM map updates omit nil; use SQL NULL for cleared timestamps.
	if err := s.db.WithContext(ctx).Model(&fy).Updates(map[string]interface{}{
		"status":     models.FiscalYearOpen,
		"end_date":   gorm.Expr("NULL"),
		"closed_at":  gorm.Expr("NULL"),
		"updated_at": now,
	}).Error; err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).First(&fy, id).Error; err != nil {
		return nil, err
	}
	return &fy, nil
}

// HardDelete permanently removes a fiscal year record and its CSV export (if closed).
// Open years can be deleted directly (e.g. test years) without closing first.
func (s *FiscalYearService) HardDelete(ctx context.Context, id uint) error {
	var fy models.FiscalYear
	if err := s.db.WithContext(ctx).First(&fy, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrFiscalYearNotFound
		}
		return err
	}
	if fy.Status == models.FiscalYearClosed {
		removeFiscalYearExportFile(fy.ExportURL)
	}
	res := s.db.WithContext(ctx).Unscoped().Delete(&models.FiscalYear{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrFiscalYearNotFound
	}
	return nil
}

func removeFiscalYearExportFile(exportURL string) {
	exportURL = strings.TrimSpace(exportURL)
	if exportURL == "" {
		return
	}
	rel := strings.TrimPrefix(exportURL, "/")
	if rel == exportURL || strings.Contains(rel, "..") {
		return
	}
	_ = os.Remove(rel)
}

// generateExport writes a multi-section CSV file to uploads/exports/ and
// returns the public URL path.
func (s *FiscalYearService) generateExport(ctx context.Context, fy *models.FiscalYear) (string, error) {
	dir := filepath.Join("uploads", "exports")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	filename := fmt.Sprintf("fiscal_year_%d_%s.csv", fy.ID, time.Now().Format("20060102_150405"))
	fpath := filepath.Join(dir, filename)

	f, err := os.Create(fpath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	// Write UTF-8 BOM so Excel opens the file correctly.
	_, _ = f.Write([]byte("\xef\xbb\xbf"))

	w := csv.NewWriter(f)
	defer w.Flush()

	if err := s.writeStudentsSection(ctx, w, fy); err != nil {
		return "", err
	}
	if err := s.writePaymentsSection(ctx, w, fy); err != nil {
		return "", err
	}
	if err := s.writePayrollSection(ctx, w, fy); err != nil {
		return "", err
	}

	return "/uploads/exports/" + filename, nil
}

func (s *FiscalYearService) writeStudentsSection(ctx context.Context, w *csv.Writer, fy *models.FiscalYear) error {
	_ = w.Write([]string{"=== دانش‌آموزان / سال مالی: " + fy.Name + " ==="})
	_ = w.Write([]string{"شناسه", "نام", "نام خانوادگی", "موبایل", "ایمیل", "وضعیت", "موجودی (تومان)", "مشاور"})

	var students []models.Student
	q := s.db.WithContext(ctx).Preload("Advisor")
	if !fy.StartDate.IsZero() {
		q = q.Where("created_at >= ?", fy.StartDate)
	}
	if err := q.Find(&students).Error; err != nil {
		return err
	}
	for _, st := range students {
		advisor := ""
		if st.Advisor != nil {
			advisor = st.Advisor.FirstName + " " + st.Advisor.LastName
		}
		_ = w.Write([]string{
			strconv.FormatUint(uint64(st.ID), 10),
			st.FirstName,
			st.LastName,
			st.Phone,
			st.Email,
			string(st.Status),
			strconv.FormatInt(st.BalanceCents/10, 10),
			advisor,
		})
	}
	_ = w.Write(nil) // blank line between sections
	return nil
}

func (s *FiscalYearService) writePaymentsSection(ctx context.Context, w *csv.Writer, fy *models.FiscalYear) error {
	_ = w.Write([]string{"=== پرداخت‌ها / سال مالی: " + fy.Name + " ==="})
	_ = w.Write([]string{"شناسه", "دانش‌آموز", "مبلغ (تومان)", "وضعیت", "روش", "تاریخ سررسید", "تاریخ پرداخت", "کد مرجع", "توضیحات"})

	var payments []models.Payment
	q := s.db.WithContext(ctx).Preload("Student")
	if !fy.StartDate.IsZero() {
		q = q.Where("created_at >= ?", fy.StartDate)
	}
	if err := q.Find(&payments).Error; err != nil {
		return err
	}
	for _, p := range payments {
		studentName := ""
		if p.Student != nil && p.Student.ID != 0 {
			studentName = p.Student.FirstName + " " + p.Student.LastName
		} else if p.SchoolContract != nil {
			studentName = p.SchoolContract.SchoolName
		}
		dueDate := ""
		if p.DueDate != nil {
			dueDate = p.DueDate.Format("2006-01-02")
		}
		paidAt := ""
		if p.PaidAt != nil {
			paidAt = p.PaidAt.Format("2006-01-02")
		}
		_ = w.Write([]string{
			strconv.FormatUint(uint64(p.ID), 10),
			studentName,
			strconv.FormatInt(p.AmountCents/10, 10),
			string(p.Status),
			string(p.Method),
			dueDate,
			paidAt,
			p.ReferenceCode,
			p.Description,
		})
	}
	_ = w.Write(nil)
	return nil
}

func (s *FiscalYearService) writePayrollSection(ctx context.Context, w *csv.Writer, fy *models.FiscalYear) error {
	_ = w.Write([]string{"=== حقوق‌ها / سال مالی: " + fy.Name + " ==="})
	_ = w.Write([]string{"شناسه", "کارمند", "سال", "ماه", "حقوق پایه (تومان)", "حقوق متغیر (تومان)", "کل (تومان)", "وضعیت", "تاریخ پرداخت"})

	var entries []models.PayrollEntry
	q := s.db.WithContext(ctx).Preload("User")
	if !fy.StartDate.IsZero() {
		q = q.Where("created_at >= ?", fy.StartDate)
	}
	if err := q.Find(&entries).Error; err != nil {
		return err
	}
	for _, e := range entries {
		userName := e.User.FirstName + " " + e.User.LastName
		paidAt := ""
		if e.PaidAt != nil {
			paidAt = e.PaidAt.Format("2006-01-02")
		}
		_ = w.Write([]string{
			strconv.FormatUint(uint64(e.ID), 10),
			userName,
			strconv.Itoa(e.PeriodYear),
			strconv.Itoa(e.PeriodMonth),
			strconv.FormatInt(e.BaseSalaryCents/10, 10),
			strconv.FormatInt(e.VariableSalaryCents/10, 10),
			strconv.FormatInt(e.TotalSalaryCents/10, 10),
			string(e.Status),
			paidAt,
		})
	}
	_ = w.Write(nil)
	return nil
}
