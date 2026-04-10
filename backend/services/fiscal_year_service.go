package services

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

var (
	ErrFiscalYearAlreadyOpen = errors.New("یک سال مالی باز وجود دارد. ابتدا آن را ببندید")
	ErrFiscalYearNotFound    = errors.New("سال مالی یافت نشد")
	ErrFiscalYearNotOpen     = errors.New("این سال مالی باز نیست")
	ErrFiscalYearNotClosed   = errors.New("این سال مالی بسته نیست")
)

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

// Close closes the current fiscal year: generates a CSV export, resets student
// balances to zero, then marks the year as CLOSED.
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
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Reset all active students' balance to zero for the new year.
		if err := tx.Model(&models.Student{}).
			Where("status = ?", models.StudentStatusActive).
			Update("balance_cents", 0).Error; err != nil {
			return err
		}

		// Mark fiscal year as closed.
		return tx.Model(&fy).Updates(map[string]interface{}{
			"status":     models.FiscalYearClosed,
			"end_date":   now,
			"closed_at":  now,
			"export_url": exportURL,
		}).Error
	}); err != nil {
		return nil, err
	}

	fy.Status = models.FiscalYearClosed
	fy.EndDate = &now
	fy.ClosedAt = &now
	fy.ExportURL = exportURL
	return &fy, nil
}

// Reopen marks a closed fiscal year as OPEN again. Only allowed when no other
// year is OPEN (same rule as starting a new year). Student balances are not
// restored to pre-close values — that must be fixed manually if needed.
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
	if err := s.db.WithContext(ctx).Preload("Advisor").Find(&students).Error; err != nil {
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
		if p.Student.ID != 0 {
			studentName = p.Student.FirstName + " " + p.Student.LastName
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
	if err := s.db.WithContext(ctx).Preload("User").Find(&entries).Error; err != nil {
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
