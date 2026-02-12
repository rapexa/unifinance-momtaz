package services

import (
	"context"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// PayrollSummary holds aggregated payroll metrics for a given period.
type PayrollSummary struct {
	PeriodYear        int   `json:"period_year"`
	PeriodMonth       int   `json:"period_month"`
	TotalBaseCents    int64 `json:"total_base_cents"`
	TotalVariableCents int64 `json:"total_variable_cents"`
	TotalPaidCents    int64 `json:"total_paid_cents"`
	TotalPendingCents int64 `json:"total_pending_cents"`
}

// PayrollService encapsulates payroll-related business logic.
type PayrollService struct {
	db *gorm.DB
}

func NewPayrollService(db *gorm.DB) *PayrollService {
	return &PayrollService{db: db}
}

// GetMonthlySummary aggregates payroll amounts for a given year and month.
func (s *PayrollService) GetMonthlySummary(ctx context.Context, year, month int) (PayrollSummary, error) {
	var (
		totalBase     int64
		totalVariable int64
		totalPaid     int64
		totalPending  int64
	)

	if err := s.db.WithContext(ctx).
		Model(&models.PayrollEntry{}).
		Where("period_year = ? AND period_month = ?", year, month).
		Select("COALESCE(SUM(base_salary_cents), 0)").
		Scan(&totalBase).Error; err != nil {
		return PayrollSummary{}, err
	}

	if err := s.db.WithContext(ctx).
		Model(&models.PayrollEntry{}).
		Where("period_year = ? AND period_month = ?", year, month).
		Select("COALESCE(SUM(variable_salary_cents), 0)").
		Scan(&totalVariable).Error; err != nil {
		return PayrollSummary{}, err
	}

	if err := s.db.WithContext(ctx).
		Model(&models.PayrollEntry{}).
		Where("period_year = ? AND period_month = ? AND status = ?", year, month, models.PayrollStatusPaid).
		Select("COALESCE(SUM(total_salary_cents), 0)").
		Scan(&totalPaid).Error; err != nil {
		return PayrollSummary{}, err
	}

	if err := s.db.WithContext(ctx).
		Model(&models.PayrollEntry{}).
		Where("period_year = ? AND period_month = ? AND status = ?", year, month, models.PayrollStatusPending).
		Select("COALESCE(SUM(total_salary_cents), 0)").
		Scan(&totalPending).Error; err != nil {
		return PayrollSummary{}, err
	}

	return PayrollSummary{
		PeriodYear:         year,
		PeriodMonth:        month,
		TotalBaseCents:     totalBase,
		TotalVariableCents: totalVariable,
		TotalPaidCents:     totalPaid,
		TotalPendingCents:  totalPending,
	}, nil
}

// ListEntries returns payroll entries for a given period with pagination.
func (s *PayrollService) ListEntries(
	ctx context.Context,
	year, month int,
	limit, offset int,
	status string,
	userID *uint,
) ([]models.PayrollEntry, int64, error) {
	var (
		entries []models.PayrollEntry
		count   int64
	)

	query := s.db.WithContext(ctx).Model(&models.PayrollEntry{}).
		Where("period_year = ? AND period_month = ?", year, month)

	if status != "" {
		query = query.Where("status = ?", status)
	}
	if userID != nil {
		query = query.Where("user_id = ?", *userID)
	}

	if err := query.Count(&count).Error; err != nil {
		return nil, 0, err
	}

	if err := query.
		Preload("User").
		Order("user_id ASC").
		Limit(limit).
		Offset(offset).
		Find(&entries).Error; err != nil {
		return nil, 0, err
	}

	return entries, count, nil
}

// GetSchemes returns all active payroll schemes.
func (s *PayrollService) GetSchemes(ctx context.Context) ([]models.PayrollScheme, error) {
	var schemes []models.PayrollScheme
	if err := s.db.WithContext(ctx).
		Model(&models.PayrollScheme{}).
		Where("is_active = ?", true).
		Order("role ASC").
		Find(&schemes).Error; err != nil {
		return nil, err
	}
	return schemes, nil
}

// DefaultPeriod returns current year and month in local time.
func DefaultPeriod(now time.Time) (int, int) {
	year, month, _ := now.Date()
	return year, int(month)
}

