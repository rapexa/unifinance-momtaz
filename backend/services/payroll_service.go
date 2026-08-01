package services

import (
	"context"
	"errors"
	"sort"
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
// When scopeUser is set, only that user's payroll entries are included.
func (s *PayrollService) GetMonthlySummary(ctx context.Context, year, month int, scopeUser *uint) (PayrollSummary, error) {
	var (
		totalBase     int64
		totalVariable int64
		totalPaid     int64
		totalPending  int64
	)

	baseQ := func() *gorm.DB {
		q := s.db.WithContext(ctx).Model(&models.PayrollEntry{}).
			Where("period_year = ? AND period_month = ?", year, month)
		if scopeUser != nil {
			q = q.Where("user_id = ?", *scopeUser)
		}
		return q
	}

	if err := baseQ().
		Select("COALESCE(SUM(base_salary_cents), 0)").
		Scan(&totalBase).Error; err != nil {
		return PayrollSummary{}, err
	}

	if err := baseQ().
		Select("COALESCE(SUM(variable_salary_cents), 0)").
		Scan(&totalVariable).Error; err != nil {
		return PayrollSummary{}, err
	}

	if err := baseQ().
		Where("status = ?", models.PayrollStatusPaid).
		Select("COALESCE(SUM(total_salary_cents), 0)").
		Scan(&totalPaid).Error; err != nil {
		return PayrollSummary{}, err
	}

	if err := baseQ().
		Where("status = ?", models.PayrollStatusPending).
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
		// Row already exists — do not overwrite amounts here. List/summary call Ensure
		// only to create missing payslips; recomputing on every GET would wipe manual
		// edits from PUT and confuse users. Use PUT with recalculate_from_role_rules or
		// the payroll "بروزرسانی" action to refresh from rules.
		return nil
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

// payrollMonthIndexInYear returns the 1-based month index within the payroll year.
// Uses the open fiscal year's start month when available; otherwise calendar year (January = 1).
func (s *PayrollService) payrollMonthIndexInYear(ctx context.Context, year, month int) int {
	loc := time.Local
	target := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, loc)
	yearStart := time.Date(year, 1, 1, 0, 0, 0, 0, loc)

	var fy models.FiscalYear
	if err := s.db.WithContext(ctx).
		Where("status = ?", models.FiscalYearOpen).
		Order("start_date ASC").
		First(&fy).Error; err == nil {
		start := time.Date(fy.StartDate.Year(), fy.StartDate.Month(), 1, 0, 0, 0, 0, loc)
		if !target.Before(start) {
			yearStart = start
		}
	}

	if target.Before(yearStart) {
		return 0
	}
	return (target.Year()-yearStart.Year())*12 + int(target.Month()-yearStart.Month()) + 1
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

// sumUserAccrualSharesInPeriod sums monthly advisor accruals from school-enrollment students.
func (s *PayrollService) sumUserAccrualSharesInPeriod(ctx context.Context, userID uint, year, month int) (int64, error) {
	var students []models.Student
	if err := s.db.WithContext(ctx).
		Where("advisor_id = ? AND enrollment_billing_mode = ? AND status = ?",
			userID, models.EnrollmentBillingSchoolEnrollment, models.StudentStatusActive).
		Find(&students).Error; err != nil {
		return 0, err
	}
	var sum int64
	for i := range students {
		sum += models.AdvisorAccrualDueForPeriod(&students[i], year, month)
	}
	return sum, nil
}

func (s *PayrollService) countAccrualStudentsForUserInPeriod(ctx context.Context, userID uint, year, month int) (int, error) {
	var students []models.Student
	if err := s.db.WithContext(ctx).
		Where("advisor_id = ? AND enrollment_billing_mode = ? AND status = ?",
			userID, models.EnrollmentBillingSchoolEnrollment, models.StudentStatusActive).
		Find(&students).Error; err != nil {
		return 0, err
	}
	cnt := 0
	for i := range students {
		if models.AdvisorAccrualDueForPeriod(&students[i], year, month) > 0 {
			cnt++
		}
	}
	return cnt, nil
}

// RecalculateAccrualForStudent refreshes pending payroll for months affected by this student's accrual schedule.
func (s *PayrollService) RecalculateAccrualForStudent(ctx context.Context, st *models.Student) error {
	if st == nil || st.JoinDate == nil {
		return nil
	}
	start := time.Date(st.JoinDate.Year(), st.JoinDate.Month(), 1, 0, 0, 0, 0, time.Local)
	for i := 0; i < 36; i++ {
		t := start.AddDate(0, i, 0)
		y, m, _ := t.Date()
		if models.AdvisorAccrualDueForPeriod(st, y, int(m)) > 0 {
			if err := s.RecalculateAllPendingEntriesForPeriod(ctx, y, int(m)); err != nil {
				return err
			}
		}
	}
	return nil
}

// sumAllPaymentPayrollSharesInPeriod totals role/advisor shares attributed on PAID payments in the month.
func (s *PayrollService) sumAllPaymentPayrollSharesInPeriod(ctx context.Context, year, month int) (int64, error) {
	start, endEx := payrollPeriodBounds(year, month)
	var sum int64
	if err := s.db.WithContext(ctx).Raw(`
SELECT COALESCE(SUM(pps.share_cents), 0)
FROM payment_payroll_shares pps
INNER JOIN payments ON payments.id = pps.payment_id AND payments.deleted_at IS NULL
WHERE pps.deleted_at IS NULL
  AND payments.status = ?
  AND payments.paid_at IS NOT NULL
  AND payments.paid_at >= ? AND payments.paid_at < ?
`, models.PaymentStatusPaid, start, endEx).Scan(&sum).Error; err != nil {
		return 0, err
	}
	return sum, nil
}

// sumAllAccrualSharesInPeriod totals monthly advisor accruals from school-enrollment students in the period.
func (s *PayrollService) sumAllAccrualSharesInPeriod(ctx context.Context, year, month int) (int64, error) {
	var students []models.Student
	if err := s.db.WithContext(ctx).
		Where("advisor_id IS NOT NULL AND enrollment_billing_mode = ? AND status = ?",
			models.EnrollmentBillingSchoolEnrollment, models.StudentStatusActive).
		Find(&students).Error; err != nil {
		return 0, err
	}
	var sum int64
	for i := range students {
		sum += models.AdvisorAccrualDueForPeriod(&students[i], year, month)
	}
	return sum, nil
}

func (s *PayrollService) sumPaidPaymentsInPeriod(ctx context.Context, year, month int) (int64, error) {
	start, endEx := payrollPeriodBounds(year, month)
	var sum int64
	if err := s.db.WithContext(ctx).Model(&models.Payment{}).
		Where("status = ?", models.PaymentStatusPaid).
		Where("paid_at IS NOT NULL").
		Where("paid_at >= ? AND paid_at < ?", start, endEx).
		Select("COALESCE(SUM(amount_cents), 0)").
		Scan(&sum).Error; err != nil {
		return 0, err
	}
	return sum, nil
}

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

	monthIndex := s.payrollMonthIndexInYear(ctx, year, month)
	if r.CompensationKind != models.CompNetRevenue && !r.RolePaysInPayrollMonth(monthIndex) {
		return PayrollCompensationBreakdown{
			CompensationKind: r.CompensationKind,
			StudentsCount:    0,
		}, nil
	}

	variableFromShares, err := s.sumUserSharesInPeriod(ctx, userID, year, month)
	if err != nil {
		return PayrollCompensationBreakdown{}, err
	}
	accrualShares, err := s.sumUserAccrualSharesInPeriod(ctx, userID, year, month)
	if err != nil {
		return PayrollCompensationBreakdown{}, err
	}
	variableFromShares += accrualShares
	studentsCount, err := s.countStudentsForUserInPeriod(ctx, userID, year, month)
	if err != nil {
		return PayrollCompensationBreakdown{}, err
	}
	accrualStudents, err := s.countAccrualStudentsForUserInPeriod(ctx, userID, year, month)
	if err != nil {
		return PayrollCompensationBreakdown{}, err
	}
	studentsCount += accrualStudents

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
	case models.CompNetRevenue:
		// NET_REVENUE (مدیرکل): مجموع پرداخت‌های ماه − سهم‌های تخصیص‌یافته به نقش‌ها/مشاور (و اقساط ماهانه قرارداد)
		receipts, err := s.sumPaidPaymentsInPeriod(ctx, year, month)
		if err != nil {
			return PayrollCompensationBreakdown{}, err
		}
		roleShares, err := s.sumAllPaymentPayrollSharesInPeriod(ctx, year, month)
		if err != nil {
			return PayrollCompensationBreakdown{}, err
		}
		accruals, err := s.sumAllAccrualSharesInPeriod(ctx, year, month)
		if err != nil {
			return PayrollCompensationBreakdown{}, err
		}
		net := receipts - roleShares - accruals
		if net < 0 {
			net = 0
		}
		out.BaseSalaryCents = 0
		out.VariableSalaryCents = net
		out.StudentsCount = 0
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

	// A payslip for this (user, period) may already exist but be SOFT-DELETED — e.g.
	// archived by a fiscal-year close. The unique index idx_payroll_user_period does not
	// include deleted_at, so a plain INSERT collides with that archived row and fails with
	// a duplicate-key error (surfaced as "failed to ensure payroll entries"). Revive the
	// archived row in place instead of inserting a duplicate. No live data is lost: the row
	// was already logically deleted, and closed-year history is kept in the fiscal-year export.
	var soft models.PayrollEntry
	softErr := s.db.WithContext(ctx).Unscoped().
		Where("user_id = ? AND period_year = ? AND period_month = ? AND deleted_at IS NOT NULL",
			p.UserID, p.PeriodYear, p.PeriodMonth).
		First(&soft).Error
	if softErr == nil {
		updates := map[string]interface{}{
			"deleted_at":            gorm.Expr("NULL"),
			"base_salary_cents":     p.BaseSalaryCents,
			"variable_salary_cents": p.VariableSalaryCents,
			"total_salary_cents":    total,
			"students_count":        p.StudentsCount,
			"status":                p.Status,
			"paid_at":               gorm.Expr("NULL"),
		}
		if p.Status == models.PayrollStatusPaid {
			updates["paid_at"] = time.Now()
		}
		if err := s.db.WithContext(ctx).Unscoped().
			Model(&models.PayrollEntry{}).
			Where("id = ?", soft.ID).
			Updates(updates).Error; err != nil {
			return nil, err
		}
		var revived models.PayrollEntry
		if err := s.db.WithContext(ctx).Preload("User.Role").First(&revived, soft.ID).Error; err != nil {
			return &soft, nil
		}
		return &revived, nil
	}
	if !errors.Is(softErr, gorm.ErrRecordNotFound) {
		return nil, softErr
	}

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

// RecalculateAllPendingEntriesForPeriod recomputes base/variable/total for every PENDING payroll row
// in the given calendar month (local time). Call after payment_payroll_shares change so حقوق matches پرداخت‌ها.
// NET_REVENUE (مدیرکل) rows are updated last so shares from other users are already fresh.
func (s *PayrollService) RecalculateAllPendingEntriesForPeriod(ctx context.Context, year, month int) error {
	if year < 1 || month < 1 || month > 12 {
		return nil
	}
	var entries []models.PayrollEntry
	if err := s.db.WithContext(ctx).Preload("User.Role").
		Where("period_year = ? AND period_month = ? AND status = ?", year, month, models.PayrollStatusPending).
		Find(&entries).Error; err != nil {
		return err
	}
	var firstPass, lastPass []uint
	for _, e := range entries {
		if e.User.Role != nil && e.User.Role.CompensationKind == models.CompNetRevenue {
			lastPass = append(lastPass, e.ID)
		} else {
			firstPass = append(firstPass, e.ID)
		}
	}
	recalc := func(ids []uint) error {
		for _, id := range ids {
			if _, err := s.UpdateEntry(ctx, id, UpdateEntryParams{RecalculateFromRoleRules: true}); err != nil {
				return err
			}
		}
		return nil
	}
	if err := recalc(firstPass); err != nil {
		return err
	}
	return recalc(lastPass)
}

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
	PaidAt                   *time.Time
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
	if p.PaidAt != nil {
		entry.PaidAt = p.PaidAt
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
	// Do not Save(entry): nested Preload("User.Role") still triggers association writes on some GORM versions (INSERT roles/users).
	if err := s.db.WithContext(ctx).Model(&models.PayrollEntry{}).Where("id = ?", entry.ID).Updates(map[string]interface{}{
		"base_salary_cents":     entry.BaseSalaryCents,
		"variable_salary_cents": entry.VariableSalaryCents,
		"total_salary_cents":    entry.TotalSalaryCents,
		"students_count":        entry.StudentsCount,
		"status":                entry.Status,
		"paid_at":               entry.PaidAt,
	}).Error; err != nil {
		return nil, err
	}
	return s.GetEntryByID(ctx, entry.ID)
}

// AdvisorOpsRow is one staff member (with RBAC role) and their assigned-student ops stats for a month.
type AdvisorOpsRow struct {
	UserID               uint
	FirstName            string
	LastName             string
	RoleID               uint
	RoleCode             string
	RoleName             string
	StudentsTotal        int
	StudentsSchool       int // enrollment_billing_mode = SCHOOL_ENROLLMENT
	StudentsPrivate      int // MONTHLY / SINGLE_SESSION / empty
	StudentsOnline       int // delivery_mode = ONLINE
	StudentsInPerson     int // delivery_mode = IN_PERSON
	PaidCountThisMonth   int // students with ≥1 PAID payment in period
	UnpaidCountThisMonth int // active students with 0 PAID payments in period
	ExpectedTotalCents   int64
	PaidTotalCents       int64 // lifetime PAID sum for assigned students
	RemainingCents       int64
	SalaryTotalCents     int64  // payslip total for period if any
	SalaryStatus         string // PAID / PENDING / ""
}

// AdvisorOpsStudentRow is a drill-down student under one advisor.
type AdvisorOpsStudentRow struct {
	StudentID             uint
	FirstName             string
	LastName              string
	DeliveryMode          string
	EnrollmentBillingMode string
	EnrollmentAmountCents int64
	PaidTotalCents        int64
	RemainingBalanceCents int64
	HasPaidThisMonth      bool
}

func periodBounds(year, month int) (from, to time.Time) {
	loc := time.Local
	from = time.Date(year, time.Month(month), 1, 0, 0, 0, 0, loc)
	to = from.AddDate(0, 1, 0)
	return from, to
}

// ListAdvisorOps returns ops stats for users who advise at least one ACTIVE student.
// scopeUser: when set, only that user is returned (if they have students).
func (s *PayrollService) ListAdvisorOps(ctx context.Context, year, month int, scopeUser *uint) ([]AdvisorOpsRow, error) {
	from, to := periodBounds(year, month)

	type advID struct {
		AdvisorID uint
	}
	var advIDs []advID
	q := s.db.WithContext(ctx).Model(&models.Student{}).
		Select("DISTINCT advisor_id").
		Where("status = ? AND advisor_id IS NOT NULL", models.StudentStatusActive)
	if scopeUser != nil {
		q = q.Where("advisor_id = ?", *scopeUser)
	}
	if err := q.Scan(&advIDs).Error; err != nil {
		return nil, err
	}
	if len(advIDs) == 0 {
		return []AdvisorOpsRow{}, nil
	}
	ids := make([]uint, len(advIDs))
	for i, a := range advIDs {
		ids[i] = a.AdvisorID
	}

	var users []models.User
	if err := s.db.WithContext(ctx).Preload("Role").Where("id IN ?", ids).Find(&users).Error; err != nil {
		return nil, err
	}
	userByID := make(map[uint]models.User, len(users))
	for i := range users {
		userByID[users[i].ID] = users[i]
	}

	var students []models.Student
	sq := s.db.WithContext(ctx).
		Where("status = ? AND advisor_id IN ?", models.StudentStatusActive, ids)
	if err := sq.Find(&students).Error; err != nil {
		return nil, err
	}

	studentIDs := make([]uint, len(students))
	byAdvisor := make(map[uint][]models.Student)
	for i, st := range students {
		studentIDs[i] = st.ID
		if st.AdvisorID == nil {
			continue
		}
		byAdvisor[*st.AdvisorID] = append(byAdvisor[*st.AdvisorID], st)
	}

	// Students with ≥1 PAID payment in this calendar month.
	paidThisMonth := map[uint]bool{}
	if len(studentIDs) > 0 {
		type row struct {
			StudentID uint
		}
		var rows []row
		if err := s.db.WithContext(ctx).Model(&models.Payment{}).
			Select("DISTINCT student_id").
			Where("student_id IN ? AND status = ? AND paid_at >= ? AND paid_at < ?",
				studentIDs, models.PaymentStatusPaid, from, to).
			Scan(&rows).Error; err != nil {
			return nil, err
		}
		for _, r := range rows {
			paidThisMonth[r.StudentID] = true
		}
	}

	// Lifetime PAID totals per student.
	paidLifetime := map[uint]int64{}
	if len(studentIDs) > 0 {
		type row struct {
			StudentID uint
			PaidSum   int64
		}
		var rows []row
		if err := s.db.WithContext(ctx).Model(&models.Payment{}).
			Select("student_id, COALESCE(SUM(amount_cents), 0) AS paid_sum").
			Where("student_id IN ? AND status = ?", studentIDs, models.PaymentStatusPaid).
			Group("student_id").
			Scan(&rows).Error; err != nil {
			return nil, err
		}
		for _, r := range rows {
			paidLifetime[r.StudentID] = r.PaidSum
		}
	}

	// Payslips for the period (salary column).
	type payRow struct {
		UserID           uint
		TotalSalaryCents int64
		Status           string
	}
	var pays []payRow
	pq := s.db.WithContext(ctx).Model(&models.PayrollEntry{}).
		Select("user_id, total_salary_cents, status").
		Where("period_year = ? AND period_month = ? AND user_id IN ?", year, month, ids)
	_ = pq.Scan(&pays)
	salaryByUser := map[uint]payRow{}
	for _, p := range pays {
		salaryByUser[p.UserID] = p
	}

	out := make([]AdvisorOpsRow, 0, len(ids))
	for _, uid := range ids {
		u, ok := userByID[uid]
		if !ok {
			continue
		}
		sts := byAdvisor[uid]
		row := AdvisorOpsRow{
			UserID:    u.ID,
			FirstName: u.FirstName,
			LastName:  u.LastName,
			RoleID:    u.RoleID,
		}
		if u.Role != nil {
			row.RoleCode = u.Role.Code
			row.RoleName = u.Role.Name
		}
		for _, st := range sts {
			row.StudentsTotal++
			if st.EnrollmentBillingMode == models.EnrollmentBillingSchoolEnrollment {
				row.StudentsSchool++
			} else {
				row.StudentsPrivate++
			}
			switch st.DeliveryMode {
			case models.DeliveryModeOnline:
				row.StudentsOnline++
			case models.DeliveryModeInPerson:
				row.StudentsInPerson++
			}
			enroll := EffectiveEnrollmentCents(&st)
			row.ExpectedTotalCents += enroll
			paid := paidLifetime[st.ID]
			row.PaidTotalCents += paid
			if paidThisMonth[st.ID] {
				row.PaidCountThisMonth++
			} else {
				row.UnpaidCountThisMonth++
			}
		}
		row.RemainingCents = row.ExpectedTotalCents - row.PaidTotalCents
		if sal, ok := salaryByUser[uid]; ok {
			row.SalaryTotalCents = sal.TotalSalaryCents
			row.SalaryStatus = sal.Status
		}
		out = append(out, row)
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].RoleName != out[j].RoleName {
			return out[i].RoleName < out[j].RoleName
		}
		if out[i].LastName != out[j].LastName {
			return out[i].LastName < out[j].LastName
		}
		return out[i].FirstName < out[j].FirstName
	})
	return out, nil
}

// ListAdvisorOpsStudents returns active students for one advisor with billing fields.
func (s *PayrollService) ListAdvisorOpsStudents(ctx context.Context, advisorID uint, year, month int, scopeUser *uint) ([]AdvisorOpsStudentRow, error) {
	if scopeUser != nil && *scopeUser != advisorID {
		return nil, errors.New("forbidden")
	}
	from, to := periodBounds(year, month)

	var students []models.Student
	if err := s.db.WithContext(ctx).
		Where("status = ? AND advisor_id = ?", models.StudentStatusActive, advisorID).
		Order("last_name ASC, first_name ASC").
		Find(&students).Error; err != nil {
		return nil, err
	}
	if len(students) == 0 {
		return []AdvisorOpsStudentRow{}, nil
	}
	ids := make([]uint, len(students))
	for i, st := range students {
		ids[i] = st.ID
	}

	paidThisMonth := map[uint]bool{}
	type sidRow struct{ StudentID uint }
	var monthRows []sidRow
	_ = s.db.WithContext(ctx).Model(&models.Payment{}).
		Select("DISTINCT student_id").
		Where("student_id IN ? AND status = ? AND paid_at >= ? AND paid_at < ?",
			ids, models.PaymentStatusPaid, from, to).
		Scan(&monthRows)
	for _, r := range monthRows {
		paidThisMonth[r.StudentID] = true
	}

	paidLife := map[uint]int64{}
	type sumRow struct {
		StudentID uint
		PaidSum   int64
	}
	var sums []sumRow
	_ = s.db.WithContext(ctx).Model(&models.Payment{}).
		Select("student_id, COALESCE(SUM(amount_cents), 0) AS paid_sum").
		Where("student_id IN ? AND status = ?", ids, models.PaymentStatusPaid).
		Group("student_id").
		Scan(&sums)
	for _, r := range sums {
		paidLife[r.StudentID] = r.PaidSum
	}

	out := make([]AdvisorOpsStudentRow, 0, len(students))
	for _, st := range students {
		enroll := EffectiveEnrollmentCents(&st)
		paid := paidLife[st.ID]
		mode := string(st.EnrollmentBillingMode)
		if mode == "" {
			mode = string(models.EnrollmentBillingMonthly)
		}
		out = append(out, AdvisorOpsStudentRow{
			StudentID:             st.ID,
			FirstName:             st.FirstName,
			LastName:              st.LastName,
			DeliveryMode:          string(st.DeliveryMode),
			EnrollmentBillingMode: mode,
			EnrollmentAmountCents: enroll,
			PaidTotalCents:        paid,
			RemainingBalanceCents: enroll - paid,
			HasPaidThisMonth:      paidThisMonth[st.ID],
		})
	}
	return out, nil
}
