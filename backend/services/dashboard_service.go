package services

import (
	"context"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/access"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"gorm.io/gorm"
)

// DashboardKPIs holds the high-level metrics shown on the dashboard KPI cards.
type DashboardKPIs struct {
	TotalRevenueCents             int64
	PendingDebtCents              int64
	OverdueDebtCents              int64
	ActiveStudents                int64
	StudentRegistrationsThisMonth int64
	MonthlyPayrollCents           int64
}

// DebtAlert represents a single overdue debt alert item.
type DebtAlert struct {
	StudentID   uint
	StudentName string
	AmountCents int64
	DaysOverdue int
}

// MonthlyRevenuePoint represents aggregated monthly revenue and payroll amounts.
type MonthlyRevenuePoint struct {
	Year         int
	Month        int
	RevenueCents int64
	PayrollCents int64
}

// DashboardService provides aggregated data for the dashboard widgets.
type DashboardService struct {
	db          *gorm.DB
	paymentRepo repositories.PaymentRepository
}

func NewDashboardService(db *gorm.DB, paymentRepo repositories.PaymentRepository) *DashboardService {
	return &DashboardService{
		db:          db,
		paymentRepo: paymentRepo,
	}
}

func (s *DashboardService) paymentsQueryScoped(ctx context.Context, scopeUser *uint) *gorm.DB {
	q := s.db.WithContext(ctx).Model(&models.Payment{})
	if scopeUser == nil {
		return q
	}
	uid := *scopeUser
	return q.Joins("INNER JOIN students ON students.id = payments.student_id").
		Where(access.PaymentJoinStudentVisibleSQL(), uid, uid)
}

func (s *DashboardService) studentsQueryScoped(ctx context.Context, scopeUser *uint) *gorm.DB {
	q := s.db.WithContext(ctx).Model(&models.Student{})
	if scopeUser == nil {
		return q
	}
	return access.ScopeStudentRows(q, *scopeUser)
}

// GetKPIs returns high-level KPI metrics for the current month.
func (s *DashboardService) GetKPIs(ctx context.Context, now time.Time, scopeUser *uint) (DashboardKPIs, error) {
	loc := now.Location()
	year, month, _ := now.Date()
	firstOfMonth := time.Date(year, month, 1, 0, 0, 0, 0, loc)

	var (
		totalRevenue           int64
		pendingDebt            int64
		overdueDebt            int64
		activeStudents         int64
		registrationsThisMonth int64
		monthlyPayroll         int64
	)

	pq := func() *gorm.DB { return s.paymentsQueryScoped(ctx, scopeUser) }

	// Total revenue for current month (paid payments).
	if err := pq().
		Where("payments.status = ? AND payments.paid_at >= ?", models.PaymentStatusPaid, firstOfMonth).
		Select("COALESCE(SUM(payments.amount_cents), 0)").
		Scan(&totalRevenue).Error; err != nil {
		return DashboardKPIs{}, err
	}

	// Pending debts (PENDING status).
	if err := pq().
		Where("payments.status = ?", models.PaymentStatusPending).
		Select("COALESCE(SUM(payments.amount_cents), 0)").
		Scan(&pendingDebt).Error; err != nil {
		return DashboardKPIs{}, err
	}

	// Overdue debts (OVERDUE status).
	if err := pq().
		Where("payments.status = ?", models.PaymentStatusOverdue).
		Select("COALESCE(SUM(payments.amount_cents), 0)").
		Scan(&overdueDebt).Error; err != nil {
		return DashboardKPIs{}, err
	}

	sq := func() *gorm.DB { return s.studentsQueryScoped(ctx, scopeUser) }

	// Active students count.
	if err := sq().
		Where("students.status = ?", models.StudentStatusActive).
		Count(&activeStudents).Error; err != nil {
		return DashboardKPIs{}, err
	}

	// Student registrations in current month.
	if err := sq().
		Where("students.created_at >= ?", firstOfMonth).
		Count(&registrationsThisMonth).Error; err != nil {
		return DashboardKPIs{}, err
	}

	// Monthly payroll paid (only PAID status) for current period.
	payrollQ := s.db.WithContext(ctx).Model(&models.PayrollEntry{}).
		Where("period_year = ? AND period_month = ? AND status = ?", year, int(month), models.PayrollStatusPaid)
	if scopeUser != nil {
		payrollQ = payrollQ.Where("user_id = ?", *scopeUser)
	}
	if err := payrollQ.
		Select("COALESCE(SUM(total_salary_cents), 0)").
		Scan(&monthlyPayroll).Error; err != nil {
		return DashboardKPIs{}, err
	}

	return DashboardKPIs{
		TotalRevenueCents:             totalRevenue,
		PendingDebtCents:              pendingDebt,
		OverdueDebtCents:              overdueDebt,
		ActiveStudents:                activeStudents,
		StudentRegistrationsThisMonth: registrationsThisMonth,
		MonthlyPayrollCents:           monthlyPayroll,
	}, nil
}

// GetRecentPayments returns the N most recent payments (for dashboard and /payments page).
func (s *DashboardService) GetRecentPayments(ctx context.Context, limit int, scopeUser *uint) ([]models.Payment, error) {
	if limit <= 0 {
		limit = 5
	}
	return s.paymentRepo.ListRecent(ctx, limit, scopeUser)
}

// GetDebtAlerts returns a list of overdue debt alerts limited by the given size.
func (s *DashboardService) GetDebtAlerts(ctx context.Context, limit int, scopeUser *uint) ([]DebtAlert, error) {
	if limit <= 0 {
		limit = 5
	}

	now := time.Now()

	type row struct {
		StudentID   uint
		FirstName   string
		LastName    string
		AmountCents int64
		DueDate     *time.Time
	}

	var rows []row
	q := s.db.WithContext(ctx).
		Model(&models.Payment{}).
		Joins("JOIN students ON students.id = payments.student_id")
	if scopeUser != nil {
		uid := *scopeUser
		q = q.Where(access.PaymentJoinStudentVisibleSQL(), uid, uid)
	}
	if err := q.
		Where("payments.status = ? AND payments.due_date IS NOT NULL AND payments.due_date < ?", models.PaymentStatusOverdue, now).
		Order("payments.due_date ASC").
		Limit(limit).
		Select("payments.student_id, students.first_name, students.last_name, payments.amount_cents, payments.due_date").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	alerts := make([]DebtAlert, 0, len(rows))
	for _, r := range rows {
		if r.DueDate == nil {
			continue
		}
		days := int(now.Sub(*r.DueDate).Hours() / 24)
		if days < 0 {
			days = 0
		}
		alerts = append(alerts, DebtAlert{
			StudentID:   r.StudentID,
			StudentName: r.FirstName + " " + r.LastName,
			AmountCents: r.AmountCents,
			DaysOverdue: days,
		})
	}

	return alerts, nil
}

// GetRevenueTrend returns monthly revenue (payments) and payroll aggregates
// for the last N months, including the current month.
func (s *DashboardService) GetRevenueTrend(ctx context.Context, months int, now time.Time, scopeUser *uint) ([]MonthlyRevenuePoint, error) {
	if months <= 0 {
		months = 6
	}

	loc := now.Location()
	year, month, _ := now.Date()

	points := make([]MonthlyRevenuePoint, 0, months)

	for i := months - 1; i >= 0; i-- {
		// Walk backwards month by month.
		t := time.Date(year, month, 1, 0, 0, 0, 0, loc).AddDate(0, -i, 0)
		y, m, _ := t.Date()
		start := time.Date(y, m, 1, 0, 0, 0, 0, loc)
		end := start.AddDate(0, 1, 0)

		var revenue int64
		rq := s.paymentsQueryScoped(ctx, scopeUser).
			Where("payments.status = ? AND payments.paid_at >= ? AND payments.paid_at < ?", models.PaymentStatusPaid, start, end).
			Select("COALESCE(SUM(payments.amount_cents), 0)")
		if err := rq.Scan(&revenue).Error; err != nil {
			return nil, err
		}

		var payroll int64
		payrollQ := s.db.WithContext(ctx).
			Model(&models.PayrollEntry{}).
			Where("period_year = ? AND period_month = ?", y, int(m))
		if scopeUser != nil {
			payrollQ = payrollQ.Where("user_id = ?", *scopeUser)
		}
		if err := payrollQ.
			Select("COALESCE(SUM(total_salary_cents), 0)").
			Scan(&payroll).Error; err != nil {
			return nil, err
		}

		points = append(points, MonthlyRevenuePoint{
			Year:         y,
			Month:        int(m),
			RevenueCents: revenue,
			PayrollCents: payroll,
		})
	}

	return points, nil
}
