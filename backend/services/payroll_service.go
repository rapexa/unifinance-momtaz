package services

import (
	"context"
	"errors"
	"math"
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
	RevenueVolumeCents  int64 // sum of advisor_share_cents on PAID payments for advisor's students in period (PERCENT/PER_UNIT on role)
}

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

// advisorPaidVolumeAndStudentPayers sums advisor_share_cents on PAID payments in the period for students assigned to advisorID,
// and counts distinct students who had such payments.
func (s *PayrollService) advisorPaidVolumeAndStudentPayers(ctx context.Context, advisorID uint, year, month int) (volume int64, distinctStudents int, err error) {
	start, endEx := payrollPeriodBounds(year, month)

	if err = s.db.WithContext(ctx).
		Table("payments").
		Select("COALESCE(SUM(payments.advisor_share_cents), 0)").
		Joins("INNER JOIN students ON students.id = payments.student_id AND students.deleted_at IS NULL").
		Where("students.advisor_id = ?", advisorID).
		Where("payments.status = ?", models.PaymentStatusPaid).
		Where("payments.paid_at IS NOT NULL AND payments.paid_at >= ? AND payments.paid_at < ?", start, endEx).
		Where("payments.deleted_at IS NULL").
		Scan(&volume).Error; err != nil {
		return 0, 0, err
	}

	var cnt int64
	if err = s.db.WithContext(ctx).Raw(`
SELECT COUNT(DISTINCT payments.student_id)
FROM payments
INNER JOIN students ON students.id = payments.student_id AND students.deleted_at IS NULL
WHERE students.advisor_id = ?
  AND payments.status = ?
  AND payments.paid_at IS NOT NULL
  AND payments.paid_at >= ? AND payments.paid_at < ?
  AND payments.deleted_at IS NULL
`, advisorID, models.PaymentStatusPaid, start, endEx).Scan(&cnt).Error; err != nil {
		return volume, 0, err
	}
	return volume, int(cnt), nil
}

func (s *PayrollService) countAdvisorActiveStudents(ctx context.Context, advisorID uint) (int, error) {
	var n int64
	if err := s.db.WithContext(ctx).Model(&models.Student{}).
		Where("advisor_id = ? AND status = ?", advisorID, models.StudentStatusActive).
		Count(&n).Error; err != nil {
		return 0, err
	}
	return int(n), nil
}

// ComputeCompensationForUser derives base / variable / students_count from the user's role and payment data.
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

	volume, payers, err := s.advisorPaidVolumeAndStudentPayers(ctx, userID, year, month)
	if err != nil {
		return PayrollCompensationBreakdown{}, err
	}
	activeStudents, err := s.countAdvisorActiveStudents(ctx, userID)
	if err != nil {
		return PayrollCompensationBreakdown{}, err
	}

	out := PayrollCompensationBreakdown{
		CompensationKind:   r.CompensationKind,
		RevenueVolumeCents: volume,
	}

	switch r.CompensationKind {
	case models.CompFixed:
		out.BaseSalaryCents = derefInt64(r.FixedCents)
		out.VariableSalaryCents = 0
		out.StudentsCount = activeStudents
	case models.CompPercent:
		if r.PercentOfStudentPayments == nil {
			return PayrollCompensationBreakdown{}, ErrPayrollInvalidRoleCompensation
		}
		p := *r.PercentOfStudentPayments
		out.BaseSalaryCents = 0
		out.VariableSalaryCents = int64(math.Round(float64(volume) * p / 100.0))
		out.StudentsCount = payers
	case models.CompPerUnit:
		if r.RevenueUnitCents == nil || *r.RevenueUnitCents <= 0 || r.AmountPerUnitCents == nil {
			return PayrollCompensationBreakdown{}, ErrPayrollInvalidRoleCompensation
		}
		unit := *r.RevenueUnitCents
		per := derefInt64(r.AmountPerUnitCents)
		out.BaseSalaryCents = 0
		out.VariableSalaryCents = (volume / unit) * per
		out.StudentsCount = payers
	default:
		return PayrollCompensationBreakdown{}, ErrPayrollInvalidRoleCompensation
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

