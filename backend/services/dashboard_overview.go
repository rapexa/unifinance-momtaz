package services

import (
	"context"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/pkg/jalali"
	"gorm.io/gorm"
)

// OverviewService builds the finance dashboard (داشبورد مالی) for admins.
type OverviewService struct {
	db        *gorm.DB
	finance   *FinanceService
	reminders *ReminderService
	payroll   *PayrollService
}

func NewOverviewService(db *gorm.DB, finance *FinanceService, reminders *ReminderService, payroll *PayrollService) *OverviewService {
	return &OverviewService{db: db, finance: finance, reminders: reminders, payroll: payroll}
}

// OverviewKPI is a dashboard card value with the previous month and a 6-month sparkline.
type OverviewKPI struct {
	Value    int64
	Previous int64
	HasPrev  bool
	Spark    []int64
}

// UpcomingDue is one payment expected in the coming days.
type UpcomingDue struct {
	Kind        string // STUDENT (receivable) | SALARY | EXPENSE (payable)
	Title       string
	Subtitle    string
	DueDate     time.Time
	DaysLeft    int
	AmountCents int64
	StudentID   uint
}

// Transaction is one recent money movement.
type Transaction struct {
	Kind         string // RECEIPT | PAYOUT | EXPENSE
	ID           uint
	Date         time.Time
	Title        string
	Category     string
	Counterparty string
	AmountCents  int64 // positive = in, negative = out
	Status       string
}

// DashboardOverview is everything the finance dashboard shows.
type DashboardOverview struct {
	PeriodYear  int
	PeriodMonth int

	Cash     OverviewKPI
	Income   OverviewKPI
	Expenses OverviewKPI
	Profit   OverviewKPI
	Overdue  OverviewKPI

	OverdueCount  int
	PendingCount  int
	PendingCents  int64
	PayrollCount  int
	PayrollCents  int64
	CashInCents   int64
	CashOutCents  int64
	PrevCashIn    int64
	PrevCashOut   int64
	Aging         [3]int64
	ActiveStudent int64
	Registrations int64

	Series   []PnLPoint
	Upcoming []UpcomingDue
	Recent   []Transaction
}

// Build computes the overview for a period key (default: current month).
func (s *OverviewService) Build(ctx context.Context, year, month int, now time.Time) (*DashboardOverview, error) {
	out := &DashboardOverview{PeriodYear: year, PeriodMonth: month}
	start, end := PeriodBounds(year, month)

	// 6-month series ending at the period.
	fy, fm := PeriodAdd(year, month, -5)
	series, err := s.finance.Series(ctx, fy, fm, year, month)
	if err != nil {
		return nil, err
	}
	out.Series = series
	for _, p := range series {
		out.Income.Spark = append(out.Income.Spark, p.IncomeCents)
		out.Expenses.Spark = append(out.Expenses.Spark, p.OutflowCents)
		out.Profit.Spark = append(out.Profit.Spark, p.ProfitCents)
	}
	cur := series[len(series)-1]
	out.Income.Value, out.Expenses.Value, out.Profit.Value = cur.IncomeCents, cur.OutflowCents, cur.ProfitCents
	out.CashInCents, out.CashOutCents = cur.IncomeCents, cur.OutflowCents
	if len(series) > 1 {
		prev := series[len(series)-2]
		out.Income.Previous, out.Expenses.Previous, out.Profit.Previous = prev.IncomeCents, prev.OutflowCents, prev.ProfitCents
		out.Income.HasPrev, out.Expenses.HasPrev, out.Profit.HasPrev = true, true, true
		out.PrevCashIn, out.PrevCashOut = prev.IncomeCents, prev.OutflowCents
	}

	// Cash & bank: opening balances + everything received − paid, at each month end.
	var opening int64
	if err := s.db.WithContext(ctx).Model(&models.BankAccount{}).
		Select("COALESCE(SUM(opening_balance_cents), 0)").Scan(&opening).Error; err != nil {
		return nil, err
	}
	cashAt := func(t time.Time) (int64, error) {
		f, err := s.finance.Figures(ctx, time.Time{}, t)
		return opening + f.ProfitCents, err
	}
	for _, p := range series {
		_, e := PeriodBounds(p.Year, p.Month)
		if e.After(now) {
			e = now
		}
		v, err := cashAt(e)
		if err != nil {
			return nil, err
		}
		out.Cash.Spark = append(out.Cash.Spark, v)
	}
	out.Cash.Value = out.Cash.Spark[len(out.Cash.Spark)-1]
	if prevCash, err := cashAt(start); err == nil {
		out.Cash.Previous, out.Cash.HasPrev = prevCash, true
	}

	// Receivables from the debtor engine (overdue now and upcoming within 30 days).
	debtors, err := s.reminders.Debtors(ctx, now, 30)
	if err != nil {
		return nil, err
	}
	for _, d := range debtors {
		if d.OverdueCents > 0 {
			out.Overdue.Value += d.OverdueCents
			out.OverdueCount++
			for i := range out.Aging {
				out.Aging[i] += d.Aging[i]
			}
		}
		if d.NextDueDate != nil {
			out.Upcoming = append(out.Upcoming, UpcomingDue{
				Kind:        "STUDENT",
				Title:       "قسط/شهریه " + d.Name,
				Subtitle:    d.AdvisorName,
				DueDate:     *d.NextDueDate,
				DaysLeft:    d.DaysUntilDue,
				AmountCents: d.NextDueCents,
				StudentID:   d.StudentID,
			})
		}
	}
	// Overdue is a point-in-time figure (as of now); there is no reliable "previous month" value.

	// Pending invoices not yet overdue.
	var pend struct {
		N   int64
		Sum int64
	}
	if err := s.db.WithContext(ctx).Model(&models.Payment{}).
		Select("COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS sum").
		Where("status = ?", models.PaymentStatusPending).Scan(&pend).Error; err != nil {
		return nil, err
	}
	out.PendingCount, out.PendingCents = int(pend.N), pend.Sum

	// Salaries still owed to staff.
	var staffIDs []uint
	if err := s.db.WithContext(ctx).Raw(`
SELECT DISTINCT user_id FROM (
  SELECT user_id FROM payroll_entries WHERE deleted_at IS NULL
  UNION SELECT user_id FROM staff_payouts WHERE deleted_at IS NULL
) t`).Scan(&staffIDs).Error; err != nil {
		return nil, err
	}
	cy, cm := DefaultPeriod(now)
	balances, err := s.payroll.StaffBalancesForPeriod(ctx, staffIDs, cy, cm)
	if err != nil {
		return nil, err
	}
	for _, b := range balances {
		if b.ClosingCents > 0 {
			out.PayrollCount++
			out.PayrollCents += b.ClosingCents
		}
	}
	if out.PayrollCents > 0 {
		payday := nextPayday(now, s.reminders.orgPaydayDay(ctx))
		out.Upcoming = append(out.Upcoming, UpcomingDue{
			Kind:        "SALARY",
			Title:       "پرداخت حقوق کارکنان",
			Subtitle:    "مانده حقوق " + faDigits(strconv.Itoa(out.PayrollCount)) + " نفر",
			DueDate:     payday,
			DaysLeft:    daysBetween(now, payday),
			AmountCents: out.PayrollCents,
		})
	}

	// Recurring expenses (rent, ...) not yet covered this month.
	if err := s.appendRecurringDues(ctx, now, out); err != nil {
		return nil, err
	}
	sort.SliceStable(out.Upcoming, func(i, j int) bool { return out.Upcoming[i].DueDate.Before(out.Upcoming[j].DueDate) })
	if len(out.Upcoming) > 8 {
		out.Upcoming = out.Upcoming[:8]
	}

	if err := s.db.WithContext(ctx).Model(&models.Student{}).
		Where("status = ?", models.StudentStatusActive).Count(&out.ActiveStudent).Error; err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).Model(&models.Student{}).
		Where("created_at >= ? AND created_at < ?", start, end).Count(&out.Registrations).Error; err != nil {
		return nil, err
	}

	recent, err := s.recentTransactions(ctx, 8)
	if err != nil {
		return nil, err
	}
	out.Recent = recent
	return out, nil
}

func (s *OverviewService) appendRecurringDues(ctx context.Context, now time.Time, out *DashboardOverview) error {
	var centers []models.CostCenter
	if err := s.db.WithContext(ctx).
		Where("is_active = ? AND kind = ? AND recurring_amount_cents > 0", true, models.CostCenterKindGeneral).
		Find(&centers).Error; err != nil {
		return err
	}
	if len(centers) == 0 {
		return nil
	}
	cy, cm := DefaultPeriod(now)
	start, end := PeriodBounds(cy, cm)
	jy, jm := jalali.JalaliFromKey(cy, cm)
	for _, c := range centers {
		var paid int64
		if err := s.db.WithContext(ctx).Model(&models.Expense{}).
			Where("cost_center_id = ? AND paid_at >= ? AND paid_at < ?", c.ID, start, end).
			Select("COALESCE(SUM(amount_cents), 0)").Scan(&paid).Error; err != nil {
			return err
		}
		day := c.DueDay
		if day < 1 {
			day = 1
		}
		due := jalali.DateOf(jy, jm, day, now.Location())
		amount := c.RecurringAmountCents - paid
		if amount <= 0 {
			ny, nm := jy, jm+1
			if nm > 12 {
				ny, nm = ny+1, 1
			}
			due = jalali.DateOf(ny, nm, day, now.Location())
			amount = c.RecurringAmountCents
		}
		out.Upcoming = append(out.Upcoming, UpcomingDue{
			Kind:        "EXPENSE",
			Title:       "پرداخت " + c.Name,
			Subtitle:    "هزینه ماهانه",
			DueDate:     due,
			DaysLeft:    daysBetween(now, due),
			AmountCents: amount,
		})
	}
	return nil
}

// recentTransactions merges student payments, staff payouts and expenses (newest first).
func (s *OverviewService) recentTransactions(ctx context.Context, limit int) ([]Transaction, error) {
	var out []Transaction

	var payments []models.Payment
	if err := s.db.WithContext(ctx).Preload("Student").
		Where("student_id IS NOT NULL").
		Order("COALESCE(paid_at, created_at) DESC, id DESC").Limit(limit).Find(&payments).Error; err != nil {
		return nil, err
	}
	for _, p := range payments {
		date := p.CreatedAt
		if p.PaidAt != nil {
			date = *p.PaidAt
		}
		name := ""
		if p.Student != nil {
			name = strings.TrimSpace(p.Student.FirstName + " " + p.Student.LastName)
		}
		title := strings.TrimSpace(p.Description)
		if title == "" {
			title = "دریافت از دانش‌آموز"
		}
		out = append(out, Transaction{
			Kind: "RECEIPT", ID: p.ID, Date: date, Title: title, Category: "شهریه دانش‌آموز",
			Counterparty: name, AmountCents: p.AmountCents, Status: string(p.Status),
		})
	}

	var payouts []models.StaffPayout
	if err := s.db.WithContext(ctx).Preload("User").
		Order("paid_at DESC, id DESC").Limit(limit).Find(&payouts).Error; err != nil {
		return nil, err
	}
	for _, p := range payouts {
		title := strings.TrimSpace(p.Note)
		if title == "" {
			title = "پرداخت حقوق"
		}
		out = append(out, Transaction{
			Kind: "PAYOUT", ID: p.ID, Date: p.PaidAt, Title: title, Category: "حقوق و دستمزد",
			Counterparty: strings.TrimSpace(p.User.FirstName + " " + p.User.LastName),
			AmountCents:  -p.AmountCents, Status: string(models.PaymentStatusPaid),
		})
	}

	var expenses []models.Expense
	if err := s.db.WithContext(ctx).Preload("CostCenter").
		Order("paid_at DESC, id DESC").Limit(limit).Find(&expenses).Error; err != nil {
		return nil, err
	}
	for _, e := range expenses {
		cat := ""
		if e.CostCenter != nil {
			cat = e.CostCenter.Name
		}
		title := strings.TrimSpace(e.Description)
		if title == "" {
			title = "پرداخت " + cat
		}
		out = append(out, Transaction{
			Kind: "EXPENSE", ID: e.ID, Date: e.PaidAt, Title: title, Category: cat,
			AmountCents: -e.AmountCents, Status: string(models.PaymentStatusPaid),
		})
	}

	sort.SliceStable(out, func(i, j int) bool { return out[i].Date.After(out[j].Date) })
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}
