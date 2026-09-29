package services

import (
	"context"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/access"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// FinanceService computes cash-basis profit & loss, debts and balances for reports and the
// dashboard. Income = PAID student payments; outflows = staff payouts (salary) + expenses.
type FinanceService struct {
	db       *gorm.DB
	payments *PaymentService
	payroll  *PayrollService
}

func NewFinanceService(db *gorm.DB, payments *PaymentService, payroll *PayrollService) *FinanceService {
	return &FinanceService{db: db, payments: payments, payroll: payroll}
}

// PnLFigures is one column of the profit & loss (a month, or to date).
type PnLFigures struct {
	IncomeCents   int64 // درآمد: پرداخت‌های دانش‌آموزان
	SalaryCents   int64 // حقوق پرداختی
	ExpensesCents int64 // سایر هزینه‌ها (اجاره و ...)
	OutflowCents  int64 // حقوق + هزینه‌ها
	ProfitCents   int64 // سود = درآمد − حقوق − هزینه‌ها
}

// DebtFigures are open balances at a point in time.
type DebtFigures struct {
	// Student debt due through the selected month (fees/installments that should have been paid).
	StudentDueCents int64
	// Student debt over whole contracts (includes future installments of annual contracts).
	StudentTotalCents int64
	StudentDebtors    int64
	// What the organization still owes staff (sum of positive staff balances).
	StaffPayableCents int64
	// Staff overpaid by the organization (sum of negative staff balances).
	StaffCreditCents int64
}

// PnLSummary is the reports header: this month vs. to date, plus debts.
type PnLSummary struct {
	PeriodYear  int
	PeriodMonth int
	ToDateFrom  time.Time
	Month       PnLFigures
	ToDate      PnLFigures
	Debts       DebtFigures
}

// PnLPoint is one month of the P&L series.
type PnLPoint struct {
	Year  int
	Month int
	PnLFigures
}

// fiscalStart returns the open fiscal year start, or zero time when none is open.
func (s *FinanceService) fiscalStart(ctx context.Context) time.Time {
	var fy models.FiscalYear
	if err := s.db.WithContext(ctx).Where("status = ?", models.FiscalYearOpen).
		Order("start_date ASC").First(&fy).Error; err == nil {
		return fy.StartDate
	}
	return time.Time{}
}

// Figures computes income and outflows in [from, to).
func (s *FinanceService) Figures(ctx context.Context, from, to time.Time) (PnLFigures, error) {
	var f PnLFigures
	if err := s.db.WithContext(ctx).Model(&models.Payment{}).
		Where("status = ? AND paid_at >= ? AND paid_at < ?", models.PaymentStatusPaid, from, to).
		Select("COALESCE(SUM(amount_cents), 0)").Scan(&f.IncomeCents).Error; err != nil {
		return f, err
	}
	if err := s.db.WithContext(ctx).Model(&models.StaffPayout{}).
		Where("paid_at >= ? AND paid_at < ?", from, to).
		Select("COALESCE(SUM(amount_cents), 0)").Scan(&f.SalaryCents).Error; err != nil {
		return f, err
	}
	if err := s.db.WithContext(ctx).Model(&models.Expense{}).
		Where("paid_at >= ? AND paid_at < ?", from, to).
		Select("COALESCE(SUM(amount_cents), 0)").Scan(&f.ExpensesCents).Error; err != nil {
		return f, err
	}
	f.OutflowCents = f.SalaryCents + f.ExpensesCents
	f.ProfitCents = f.IncomeCents - f.OutflowCents
	return f, nil
}

// Debts returns student receivables (as of asOf) and staff balances at the end of (year, month).
func (s *FinanceService) Debts(ctx context.Context, year, month int, asOf time.Time) (DebtFigures, error) {
	var d DebtFigures
	rows, err := s.payments.ActiveStudentBalances(ctx, nil, asOf)
	if err != nil {
		return d, err
	}
	for _, r := range rows {
		if r.Balance.MonthRemainingCents > 0 {
			d.StudentDueCents += r.Balance.MonthRemainingCents
		}
		if r.Balance.TotalRemainingCents > 0 {
			d.StudentTotalCents += r.Balance.TotalRemainingCents
			d.StudentDebtors++
		}
	}
	if s.payroll != nil {
		var userIDs []uint
		if err := s.db.WithContext(ctx).Raw(`
SELECT DISTINCT user_id FROM (
  SELECT user_id FROM payroll_entries WHERE deleted_at IS NULL
  UNION SELECT user_id FROM staff_payouts WHERE deleted_at IS NULL
) t`).Scan(&userIDs).Error; err != nil {
			return d, err
		}
		balances, err := s.payroll.StaffBalancesForPeriod(ctx, userIDs, year, month)
		if err != nil {
			return d, err
		}
		for _, b := range balances {
			if b.ClosingCents > 0 {
				d.StaffPayableCents += b.ClosingCents
			} else {
				d.StaffCreditCents += -b.ClosingCents
			}
		}
	}
	return d, nil
}

// PnL returns the month and to-date P&L for a period key and the open balances.
func (s *FinanceService) PnL(ctx context.Context, year, month int) (*PnLSummary, error) {
	start, end := PeriodBounds(year, month)
	since := s.fiscalStart(ctx)
	out := &PnLSummary{PeriodYear: year, PeriodMonth: month, ToDateFrom: since}
	var err error
	if out.Month, err = s.Figures(ctx, start, end); err != nil {
		return nil, err
	}
	if out.ToDate, err = s.Figures(ctx, since, end); err != nil {
		return nil, err
	}
	asOf := time.Now()
	if end.Before(asOf) {
		asOf = end.Add(-time.Second)
	}
	if out.Debts, err = s.Debts(ctx, year, month, asOf); err != nil {
		return nil, err
	}
	return out, nil
}

// Series returns the P&L for each month key in [from, to] (inclusive).
func (s *FinanceService) Series(ctx context.Context, fromY, fromM, toY, toM int) ([]PnLPoint, error) {
	out := []PnLPoint{}
	for y, m := fromY, fromM; PeriodIndex(y, m) <= PeriodIndex(toY, toM); y, m = PeriodAdd(y, m, 1) {
		start, end := PeriodBounds(y, m)
		f, err := s.Figures(ctx, start, end)
		if err != nil {
			return nil, err
		}
		out = append(out, PnLPoint{Year: y, Month: m, PnLFigures: f})
		if len(out) > 120 {
			break
		}
	}
	return out, nil
}

// CashBalance is the organization's cash & bank position: opening balances of all accounts
// plus every PAID student payment minus every staff payout and expense.
func (s *FinanceService) CashBalance(ctx context.Context) (int64, error) {
	var opening int64
	if err := s.db.WithContext(ctx).Model(&models.BankAccount{}).
		Select("COALESCE(SUM(opening_balance_cents), 0)").Scan(&opening).Error; err != nil {
		return 0, err
	}
	f, err := s.Figures(ctx, time.Time{}, time.Now().AddDate(100, 0, 0))
	if err != nil {
		return 0, err
	}
	return opening + f.ProfitCents, nil
}

// StudentBalanceRow is one active student with their schedule balance.
type StudentBalanceRow struct {
	Student models.Student
	Balance StudentBalance
}

// ActiveStudentBalances returns every ACTIVE student (optionally scoped) with balances as of asOf.
func (s *PaymentService) ActiveStudentBalances(ctx context.Context, scopeUser *uint, asOf time.Time) ([]StudentBalanceRow, error) {
	var students []models.Student
	q := s.db.WithContext(ctx).
		Preload("Enrollments", "status = ?", models.EnrollmentStatusActive).
		Preload("Advisor").
		Where("students.status = ?", models.StudentStatusActive)
	if scopeUser != nil {
		q = access.ScopeStudentRows(q, *scopeUser)
	}
	if err := q.Find(&students).Error; err != nil {
		return nil, err
	}
	if len(students) == 0 {
		return nil, nil
	}
	ids := make([]uint, len(students))
	for i := range students {
		ids[i] = students[i].ID
	}
	paid, open, err := s.PaymentTotalsByStudentIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make([]StudentBalanceRow, len(students))
	for i := range students {
		st := &students[i]
		out[i] = StudentBalanceRow{Student: *st, Balance: StudentBalanceAt(st, paid[st.ID], open[st.ID], asOf)}
	}
	return out, nil
}
