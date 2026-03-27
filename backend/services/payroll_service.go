package services

import (
	"context"
	"errors"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

var (
	ErrPayrollUserNotFound            = errors.New("user not found")
	ErrPayrollNoRole                  = errors.New("user has no role")
	ErrPayrollInvalidRoleCompensation = errors.New("role compensation settings are incomplete")
)

// PayrollCompensationBreakdown is the computed amounts for a user in a calendar month.
type PayrollCompensationBreakdown struct {
	BaseSalaryCents     int64
	VariableSalaryCents int64
	StudentsCount       int
	CompensationKind    models.CompensationKind
}

// PayrollSummary holds aggregated payroll metrics for a given period.
type PayrollSummary struct {
	PeriodYear         int   `json:"period_year"`
	PeriodMonth        int   `json:"period_month"`
	TotalBaseCents     int64 `json:"total_base_cents"`
	TotalVariableCents int64 `json:"total_variable_cents"`
	TotalPaidCents     int64 `json:"total_paid_cents"`
	TotalPendingCents  int64 `json:"total_pending_cents"`
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

// EnsureEntriesForPeriod auto-registers pending payroll rows for active users for a month.
func (s *PayrollService) EnsureEntriesForPeriod(ctx context.Context, year, month int) error {
	var users []models.User
	if err := s.db.WithContext(ctx).
		Preload("Role").
		Where("is_active = ? AND role_id IS NOT NULL", true).
		Find(&users).Error; err != nil {
		return err
	}
	for i := range users {
		u := &users[i]
		if u.Role == nil {
			continue
		}
		if err := s.EnsureEntryForUserPeriod(ctx, u.ID, year, month); err != nil {
			return err
		}
	}
	return nil
}

// EnsureEntryForUserPeriod creates or refreshes a pending payroll entry for a user/period.
func (s *PayrollService) EnsureEntryForUserPeriod(ctx context.Context, userID uint, year, month int) error {
	var existing models.PayrollEntry
	err := s.db.WithContext(ctx).
		Where("user_id = ? AND period_year = ? AND period_month = ?", userID, year, month).
		First(&existing).Error
	if err == nil {
		// Do not mutate already-paid entries automatically.
		if existing.Status == models.PayrollStatusPaid {
			return nil
		}
		br, err := s.ComputeCompensationForUser(ctx, userID, year, month)
		if err != nil {
			return err
		}
		existing.BaseSalaryCents = br.BaseSalaryCents
		existing.VariableSalaryCents = br.VariableSalaryCents
		existing.TotalSalaryCents = br.BaseSalaryCents + br.VariableSalaryCents
		existing.StudentsCount = br.StudentsCount
		existing.Status = models.PayrollStatusPending
		return s.db.WithContext(ctx).Save(&existing).Error
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	_, err = s.CreateEntry(ctx, CreateEntryParams{
		UserID:         userID,
		PeriodYear:     year,
		PeriodMonth:    month,
		ApplyRoleRules: true,
		Status:         models.PayrollStatusPending,
	})
	return err
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
		Preload("User.Role").
		Order("user_id ASC").
		Limit(limit).
		Offset(offset).
		Find(&entries).Error; err != nil {
		return nil, 0, err
	}

	return entries, count, nil
}

// GetSchemes returns all roles with compensation rules (حقوق پیش‌فرض نقش).
func (s *PayrollService) GetSchemes(ctx context.Context) ([]models.Role, error) {
	var roles []models.Role
	if err := s.db.WithContext(ctx).
		Model(&models.Role{}).
		Order("name ASC").
		Find(&roles).Error; err != nil {
		return nil, err
	}
	return roles, nil
}

// DefaultPeriod returns current year and month in local time.
func DefaultPeriod(now time.Time) (int, int) {
	year, month, _ := now.Date()
	return year, int(month)
}

func payrollPeriodBounds(year, month int) (start, endExclusive time.Time) {
	loc := time.Local
	start = time.Date(year, time.Month(month), 1, 0, 0, 0, 0, loc)
	endExclusive = start.AddDate(0, 1, 0)
	return start, endExclusive
}

func derefInt64(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}

// sumUserSharesInPeriod sums all payment_payroll_shares for a user in the given month.
func (s *PayrollService) sumUserSharesInPeriod(ctx context.Context, userID uint, year, month int) (int64, error) {
	start, endEx := payrollPeriodBounds(year, month)
	var sum int64
	if err := s.db.WithContext(ctx).Raw(`
SELECT COALESCE(SUM(pps.share_cents), 0)
FROM payment_payroll_shares pps
INNER JOIN payments ON payments.id = pps.payment_id AND payments.deleted_at IS NULL
WHERE pps.deleted_at IS NULL
  AND pps.user_id = ?
  AND payments.status = ?
  AND payments.paid_at IS NOT NULL
  AND payments.paid_at >= ? AND payments.paid_at < ?
`, userID, models.PaymentStatusPaid, start, endEx).Scan(&sum).Error; err != nil {
		return 0, err
	}
	return sum, nil
}

// countStudentsForUserInPeriod counts distinct students whose payments contributed shares to this user in the period.
func (s *PayrollService) countStudentsForUserInPeriod(ctx context.Context, userID uint, year, month int) (int, error) {
	start, endEx := payrollPeriodBounds(year, month)
	var cnt int64
	if err := s.db.WithContext(ctx).Raw(`
SELECT COUNT(DISTINCT payments.student_id)
FROM payment_payroll_shares pps
INNER JOIN payments ON payments.id = pps.payment_id AND payments.deleted_at IS NULL
WHERE pps.deleted_at IS NULL
  AND pps.user_id = ?
  AND payments.status = ?
  AND payments.paid_at IS NOT NULL
  AND payments.paid_at >= ? AND payments.paid_at < ?
`, userID, models.PaymentStatusPaid, start, endEx).Scan(&cnt).Error; err != nil {
		return 0, err
	}
	return int(cnt), nil
}

// ComputeCompensationForUser derives base / variable / students_count from the user's role and StudentRolePayout shares.
// FIXED: base = FixedCents, variable = sum of all PaymentPayrollShare for user in period.
// VARIABLE: base = 0, variable = sum of all PaymentPayrollShare for user in period.
func (s *PayrollService) ComputeCompensationForUser(ctx context.Context, userID uint, year, month int) (PayrollCompensationBreakdown, error) {
	var u models.User
	if err := s.db.WithContext(ctx).Preload("Role").First(&u, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return PayrollCompensationBreakdown{}, ErrPayrollUserNotFound
		}
		return PayrollCompensationBreakdown{}, err
	}
	if u.Role == nil {
		return PayrollCompensationBreakdown{}, ErrPayrollNoRole
	}
	r := u.Role

	variableFromShares, err := s.sumUserSharesInPeriod(ctx, userID, year, month)
	if err != nil {
		return PayrollCompensationBreakdown{}, err
	}
	studentsCount, err := s.countStudentsForUserInPeriod(ctx, userID, year, month)
	if err != nil {
		return PayrollCompensationBreakdown{}, err
	}

	out := PayrollCompensationBreakdown{
		CompensationKind:    r.CompensationKind,
		StudentsCount:       studentsCount,
		VariableSalaryCents: variableFromShares,
	}
	switch r.CompensationKind {
	case models.CompFixed:
		out.BaseSalaryCents = derefInt64(r.FixedCents)
	case models.CompVariable:
		out.BaseSalaryCents = 0
	default:
		out.BaseSalaryCents = 0
	}
	return out, nil
}

// CreateEntryParams is the input for creating a payroll entry.
type CreateEntryParams struct {
	UserID              uint
	PeriodYear          int
	PeriodMonth         int
	ApplyRoleRules      bool
	BaseSalaryCents     int64
	VariableSalaryCents int64
	StudentsCount       int
	Status              models.PayrollStatus
}

// CreateEntry creates a new payroll entry (payslip). Total = Base + Variable.
func (s *PayrollService) CreateEntry(ctx context.Context, p CreateEntryParams) (*models.PayrollEntry, error) {
	if p.ApplyRoleRules {
		br, err := s.ComputeCompensationForUser(ctx, p.UserID, p.PeriodYear, p.PeriodMonth)
		if err != nil {
			return nil, err
		}
		p.BaseSalaryCents = br.BaseSalaryCents
		p.VariableSalaryCents = br.VariableSalaryCents
		p.StudentsCount = br.StudentsCount
	}

	total := p.BaseSalaryCents + p.VariableSalaryCents
	entry := &models.PayrollEntry{
		UserID:              p.UserID,
		PeriodYear:          p.PeriodYear,
		PeriodMonth:         p.PeriodMonth,
		BaseSalaryCents:     p.BaseSalaryCents,
		VariableSalaryCents: p.VariableSalaryCents,
		TotalSalaryCents:    total,
		StudentsCount:       p.StudentsCount,
		Status:              p.Status,
	}
	if p.Status == models.PayrollStatusPaid {
		now := time.Now()
		entry.PaidAt = &now
	}
	if err := s.db.WithContext(ctx).Create(entry).Error; err != nil {
		return nil, err
	}
	// Reload with User preload for response
	if err := s.db.WithContext(ctx).Preload("User.Role").First(entry, entry.ID).Error; err != nil {
		return entry, nil // return created even if reload fails
	}
	return entry, nil
}

var ErrPayrollEntryNotFound = errors.New("payroll entry not found")

// GetEntryByID returns a single payroll entry by ID.
func (s *PayrollService) GetEntryByID(ctx context.Context, id uint) (*models.PayrollEntry, error) {
	var entry models.PayrollEntry
	if err := s.db.WithContext(ctx).
		Preload("User.Role").
		First(&entry, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPayrollEntryNotFound
		}
		return nil, err
	}
	return &entry, nil
}

// UpdateEntryParams is the input for updating a payroll entry.
type UpdateEntryParams struct {
	RecalculateFromRoleRules bool
	BaseSalaryCents          *int64
	VariableSalaryCents      *int64
	StudentsCount            *int
	Status                   *models.PayrollStatus
}

// UpdateEntry updates an existing payroll entry. Total is recalculated from base + variable.
func (s *PayrollService) UpdateEntry(ctx context.Context, id uint, p UpdateEntryParams) (*models.PayrollEntry, error) {
	entry, err := s.GetEntryByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if p.RecalculateFromRoleRules {
		br, err := s.ComputeCompensationForUser(ctx, entry.UserID, entry.PeriodYear, entry.PeriodMonth)
		if err != nil {
			return nil, err
		}
		entry.BaseSalaryCents = br.BaseSalaryCents
		entry.VariableSalaryCents = br.VariableSalaryCents
		entry.StudentsCount = br.StudentsCount
	}
	if p.BaseSalaryCents != nil {
		entry.BaseSalaryCents = *p.BaseSalaryCents
	}
	if p.VariableSalaryCents != nil {
		entry.VariableSalaryCents = *p.VariableSalaryCents
	}
	if p.StudentsCount != nil {
		entry.StudentsCount = *p.StudentsCount
	}
	if p.Status != nil {
		entry.Status = *p.Status
		if *p.Status == models.PayrollStatusPaid && entry.PaidAt == nil {
			now := time.Now()
			entry.PaidAt = &now
		} else if *p.Status == models.PayrollStatusPending {
			entry.PaidAt = nil
		}
	}
	entry.TotalSalaryCents = entry.BaseSalaryCents + entry.VariableSalaryCents
	if err := s.db.WithContext(ctx).Save(entry).Error; err != nil {
		return nil, err
	}
	return s.GetEntryByID(ctx, entry.ID)
}
