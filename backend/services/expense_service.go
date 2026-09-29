package services

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

var (
	ErrCostCenterNotFound     = errors.New("cost center not found")
	ErrCostCenterNameRequired = errors.New("cost center name is required")
	ErrCostCenterSystem       = errors.New("system cost center cannot be changed")
	ErrCostCenterInUse        = errors.New("cost center has expenses")
	ErrExpenseNotFound        = errors.New("expense not found")
	ErrExpenseInvalidAmount   = errors.New("expense amount must be positive")
	ErrExpenseSalaryCenter    = errors.New("salary is recorded as staff payouts")
)

// ExpenseService manages cost centers (مراکز هزینه) and expenses (هزینه‌ها).
// The built-in SALARY cost center is backed by staff payouts, so salary paid and other
// expenses are reported side by side without double entry.
type ExpenseService struct {
	db *gorm.DB
}

func NewExpenseService(db *gorm.DB) *ExpenseService {
	return &ExpenseService{db: db}
}

// CostCenterTotal is one cost center with its paid totals.
type CostCenterTotal struct {
	models.CostCenter
	MonthCents  int64
	ToDateCents int64
	MonthCount  int64
}

// ExpenseSummary aggregates cost centers for a period and up to its end ("تا کنون").
type ExpenseSummary struct {
	PeriodYear        int
	PeriodMonth       int
	Centers           []CostCenterTotal
	SalaryMonthCents  int64
	SalaryToDateCents int64
	OtherMonthCents   int64
	OtherToDateCents  int64
	TotalMonthCents   int64
	TotalToDateCents  int64
}

// ExpenseLine is one outflow row for drill-down (expense or staff payout).
type ExpenseLine struct {
	ID               uint
	Kind             string // EXPENSE | PAYOUT
	CostCenterID     uint
	CostCenterName   string
	AmountCents      int64
	PaidAt           time.Time
	Description      string
	BankAccountID    *uint
	BankAccountTitle string
	UserID           uint
	UserName         string
}

// toDateStart is the first day counted in "to date" figures: the open fiscal year's start,
// or the beginning of time when no fiscal year is open.
func (s *ExpenseService) toDateStart(ctx context.Context) time.Time {
	var fy models.FiscalYear
	if err := s.db.WithContext(ctx).Where("status = ?", models.FiscalYearOpen).
		Order("start_date ASC").First(&fy).Error; err == nil {
		return fy.StartDate
	}
	return time.Time{}
}

// OutflowTotals returns salary payouts and other expenses in [from, to).
func (s *ExpenseService) OutflowTotals(ctx context.Context, from, to time.Time) (salary, other int64, err error) {
	if err = s.db.WithContext(ctx).Model(&models.StaffPayout{}).
		Where("paid_at >= ? AND paid_at < ?", from, to).
		Select("COALESCE(SUM(amount_cents), 0)").Scan(&salary).Error; err != nil {
		return
	}
	err = s.db.WithContext(ctx).Model(&models.Expense{}).
		Where("paid_at >= ? AND paid_at < ?", from, to).
		Select("COALESCE(SUM(amount_cents), 0)").Scan(&other).Error
	return
}

// Summary returns per-cost-center totals for the month and from the fiscal-year start
// through the end of that month.
func (s *ExpenseService) Summary(ctx context.Context, year, month int) (*ExpenseSummary, error) {
	start, end := PeriodBounds(year, month)
	since := s.toDateStart(ctx)

	var centers []models.CostCenter
	if err := s.db.WithContext(ctx).Order("sort_order ASC, id ASC").Find(&centers).Error; err != nil {
		return nil, err
	}
	type agg struct {
		CostCenterID uint
		Total        int64
		Cnt          int64
	}
	sumBy := func(from time.Time) (map[uint]agg, error) {
		var rows []agg
		if err := s.db.WithContext(ctx).Model(&models.Expense{}).
			Select("cost_center_id, COALESCE(SUM(amount_cents), 0) AS total, COUNT(*) AS cnt").
			Where("paid_at >= ? AND paid_at < ?", from, end).
			Group("cost_center_id").Scan(&rows).Error; err != nil {
			return nil, err
		}
		m := make(map[uint]agg, len(rows))
		for _, r := range rows {
			m[r.CostCenterID] = r
		}
		return m, nil
	}
	monthAgg, err := sumBy(start)
	if err != nil {
		return nil, err
	}
	toDateAgg, err := sumBy(since)
	if err != nil {
		return nil, err
	}
	salaryMonth, _, err := s.OutflowTotals(ctx, start, end)
	if err != nil {
		return nil, err
	}
	salaryToDate, _, err := s.OutflowTotals(ctx, since, end)
	if err != nil {
		return nil, err
	}
	var salaryMonthCount int64
	if err := s.db.WithContext(ctx).Model(&models.StaffPayout{}).
		Where("paid_at >= ? AND paid_at < ?", start, end).Count(&salaryMonthCount).Error; err != nil {
		return nil, err
	}

	out := &ExpenseSummary{PeriodYear: year, PeriodMonth: month, SalaryMonthCents: salaryMonth, SalaryToDateCents: salaryToDate}
	for _, c := range centers {
		row := CostCenterTotal{CostCenter: c}
		if c.Kind == models.CostCenterKindSalary {
			row.MonthCents, row.ToDateCents, row.MonthCount = salaryMonth, salaryToDate, salaryMonthCount
		} else {
			row.MonthCents = monthAgg[c.ID].Total
			row.MonthCount = monthAgg[c.ID].Cnt
			row.ToDateCents = toDateAgg[c.ID].Total
			out.OtherMonthCents += row.MonthCents
			out.OtherToDateCents += row.ToDateCents
		}
		if !c.IsActive && row.ToDateCents == 0 {
			continue
		}
		out.Centers = append(out.Centers, row)
	}
	out.TotalMonthCents = out.SalaryMonthCents + out.OtherMonthCents
	out.TotalToDateCents = out.SalaryToDateCents + out.OtherToDateCents
	return out, nil
}

// Lines lists outflows of one cost center (or all when costCenterID is 0) for the month,
// or from the fiscal-year start through the month's end when toDate is true.
func (s *ExpenseService) Lines(ctx context.Context, year, month int, costCenterID uint, toDate bool) ([]ExpenseLine, error) {
	start, end := PeriodBounds(year, month)
	if toDate {
		start = s.toDateStart(ctx)
	}
	includeSalary := costCenterID == 0
	var salaryCenter models.CostCenter
	if err := s.db.WithContext(ctx).Where("kind = ?", models.CostCenterKindSalary).First(&salaryCenter).Error; err == nil {
		if costCenterID == salaryCenter.ID {
			includeSalary = true
		}
	}

	out := []ExpenseLine{}
	if costCenterID == 0 || costCenterID != salaryCenter.ID {
		var rows []models.Expense
		q := s.db.WithContext(ctx).Preload("CostCenter").Preload("BankAccount").
			Where("paid_at >= ? AND paid_at < ?", start, end)
		if costCenterID != 0 {
			q = q.Where("cost_center_id = ?", costCenterID)
		}
		if err := q.Order("paid_at DESC, id DESC").Find(&rows).Error; err != nil {
			return nil, err
		}
		for _, e := range rows {
			line := ExpenseLine{
				ID: e.ID, Kind: "EXPENSE", CostCenterID: e.CostCenterID, AmountCents: e.AmountCents,
				PaidAt: e.PaidAt, Description: e.Description, BankAccountID: e.BankAccountID,
			}
			if e.CostCenter != nil {
				line.CostCenterName = e.CostCenter.Name
			}
			if e.BankAccount != nil {
				line.BankAccountTitle = e.BankAccount.Title
			}
			out = append(out, line)
		}
	}
	if includeSalary {
		var rows []models.StaffPayout
		if err := s.db.WithContext(ctx).Preload("User").Preload("BankAccount").
			Where("paid_at >= ? AND paid_at < ?", start, end).
			Order("paid_at DESC, id DESC").Find(&rows).Error; err != nil {
			return nil, err
		}
		for _, p := range rows {
			line := ExpenseLine{
				ID: p.ID, Kind: "PAYOUT", CostCenterID: salaryCenter.ID, CostCenterName: salaryCenter.Name,
				AmountCents: p.AmountCents, PaidAt: p.PaidAt, Description: p.Note, BankAccountID: p.BankAccountID,
				UserID: p.UserID, UserName: strings.TrimSpace(p.User.FirstName + " " + p.User.LastName),
			}
			if p.BankAccount != nil {
				line.BankAccountTitle = p.BankAccount.Title
			}
			out = append(out, line)
		}
	}
	return out, nil
}

// ---- cost centers ----

func (s *ExpenseService) ListCostCenters(ctx context.Context) ([]models.CostCenter, error) {
	var rows []models.CostCenter
	err := s.db.WithContext(ctx).Order("sort_order ASC, id ASC").Find(&rows).Error
	return rows, err
}

// CostCenterInput is the editable part of a cost center.
type CostCenterInput struct {
	Name        string
	Description string
	IsActive    bool
	SortOrder   int
}

func (s *ExpenseService) CreateCostCenter(ctx context.Context, in CostCenterInput) (*models.CostCenter, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, ErrCostCenterNameRequired
	}
	c := models.CostCenter{Name: name, Kind: models.CostCenterKindGeneral, Description: strings.TrimSpace(in.Description), IsActive: true, SortOrder: in.SortOrder}
	if err := s.db.WithContext(ctx).Create(&c).Error; err != nil {
		return nil, err
	}
	if !in.IsActive {
		if err := s.db.WithContext(ctx).Model(&c).Update("is_active", false).Error; err != nil {
			return nil, err
		}
		c.IsActive = false
	}
	return &c, nil
}

func (s *ExpenseService) UpdateCostCenter(ctx context.Context, id uint, in CostCenterInput) (*models.CostCenter, error) {
	var c models.CostCenter
	if err := s.db.WithContext(ctx).First(&c, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCostCenterNotFound
		}
		return nil, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, ErrCostCenterNameRequired
	}
	c.Name = name
	c.Description = strings.TrimSpace(in.Description)
	c.SortOrder = in.SortOrder
	if !c.IsSystem {
		c.IsActive = in.IsActive
	}
	if err := s.db.WithContext(ctx).Save(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

// DeleteCostCenter removes a cost center that has no expenses (system center is kept).
func (s *ExpenseService) DeleteCostCenter(ctx context.Context, id uint) error {
	var c models.CostCenter
	if err := s.db.WithContext(ctx).First(&c, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCostCenterNotFound
		}
		return err
	}
	if c.IsSystem {
		return ErrCostCenterSystem
	}
	var n int64
	if err := s.db.WithContext(ctx).Unscoped().Model(&models.Expense{}).Where("cost_center_id = ?", id).Count(&n).Error; err != nil {
		return err
	}
	if n > 0 {
		return ErrCostCenterInUse
	}
	return s.db.WithContext(ctx).Unscoped().Delete(&models.CostCenter{}, id).Error
}

// ---- expenses ----

// ExpenseInput is the editable part of an expense.
type ExpenseInput struct {
	CostCenterID  uint
	AmountCents   int64
	PaidAt        time.Time
	Description   string
	BankAccountID *uint
	CreatedByID   *uint
}

func (s *ExpenseService) validate(ctx context.Context, in ExpenseInput) error {
	if in.AmountCents <= 0 {
		return ErrExpenseInvalidAmount
	}
	var c models.CostCenter
	if err := s.db.WithContext(ctx).First(&c, in.CostCenterID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCostCenterNotFound
		}
		return err
	}
	if c.Kind == models.CostCenterKindSalary {
		return ErrExpenseSalaryCenter
	}
	return nil
}

func (s *ExpenseService) CreateExpense(ctx context.Context, in ExpenseInput) (*models.Expense, error) {
	if err := s.validate(ctx, in); err != nil {
		return nil, err
	}
	e := models.Expense{
		CostCenterID: in.CostCenterID, AmountCents: in.AmountCents, PaidAt: in.PaidAt,
		Description: strings.TrimSpace(in.Description), CreatedByID: in.CreatedByID,
	}
	if in.BankAccountID != nil && *in.BankAccountID > 0 {
		e.BankAccountID = in.BankAccountID
	}
	if err := s.db.WithContext(ctx).Create(&e).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *ExpenseService) UpdateExpense(ctx context.Context, id uint, in ExpenseInput) (*models.Expense, error) {
	var e models.Expense
	if err := s.db.WithContext(ctx).First(&e, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrExpenseNotFound
		}
		return nil, err
	}
	if err := s.validate(ctx, in); err != nil {
		return nil, err
	}
	e.CostCenterID = in.CostCenterID
	e.AmountCents = in.AmountCents
	e.PaidAt = in.PaidAt
	e.Description = strings.TrimSpace(in.Description)
	e.BankAccountID = nil
	if in.BankAccountID != nil && *in.BankAccountID > 0 {
		e.BankAccountID = in.BankAccountID
	}
	e.CostCenter = nil
	e.BankAccount = nil
	if err := s.db.WithContext(ctx).Save(&e).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *ExpenseService) DeleteExpense(ctx context.Context, id uint) error {
	res := s.db.WithContext(ctx).Delete(&models.Expense{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrExpenseNotFound
	}
	return nil
}
