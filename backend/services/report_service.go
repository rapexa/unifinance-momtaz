package services

import (
	"context"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// RevenuePoint represents a single point in a revenue time series.
type RevenuePoint struct {
	Year         int   `json:"year"`
	Month        int   `json:"month"`
	RevenueCents int64 `json:"revenue_cents"`
}

// PayrollPoint represents a single point in a payroll time series.
type PayrollPoint struct {
	Year          int   `json:"year"`
	Month         int   `json:"month"`
	PayrollCents  int64 `json:"payroll_cents"`
}

// AdvisorDebt aggregates student debts per advisor (for reports).
type AdvisorDebt struct {
	AdvisorID   uint   `json:"advisor_id"`
	AdvisorName string `json:"advisor_name"`
	DebtCents   int64  `json:"debt_cents"`
}

// ReportSummary holds high-level metrics for the reports summary cards.
type ReportSummary struct {
	TotalRevenueCents int64 `json:"total_revenue_cents"`
	TotalPayrollCents int64 `json:"total_payroll_cents"`
	TotalDebtCents    int64 `json:"total_debt_cents"`
	NetProfitCents    int64 `json:"net_profit_cents"`
}

// ReportService provides analytics and reporting queries.
type ReportService struct {
	db *gorm.DB
}

func NewReportService(db *gorm.DB) *ReportService {
	return &ReportService{db: db}
}

// GetRevenueSeries returns monthly revenue between two inclusive months (YYYY-MM).
func (s *ReportService) GetRevenueSeries(ctx context.Context, from, to time.Time) ([]RevenuePoint, error) {
	loc := from.Location()
	// Normalize to first day.
	start := time.Date(from.Year(), from.Month(), 1, 0, 0, 0, 0, loc)
	end := time.Date(to.Year(), to.Month(), 1, 0, 0, 0, 0, loc).AddDate(0, 1, 0)

	points := []RevenuePoint{}
	cursor := start
	for cursor.Before(end) {
		y, m, _ := cursor.Date()
		next := cursor.AddDate(0, 1, 0)

		var revenue int64
		if err := s.db.WithContext(ctx).
			Model(&models.Payment{}).
			Where("status = ? AND paid_at >= ? AND paid_at < ?", models.PaymentStatusPaid, cursor, next).
			Select("COALESCE(SUM(amount_cents), 0)").
			Scan(&revenue).Error; err != nil {
			return nil, err
		}

		points = append(points, RevenuePoint{
			Year:         y,
			Month:        int(m),
			RevenueCents: revenue,
		})

		cursor = next
	}

	return points, nil
}

// GetPayrollSeries returns monthly payroll between two inclusive months (YYYY-MM).
func (s *ReportService) GetPayrollSeries(ctx context.Context, from, to time.Time) ([]PayrollPoint, error) {
	loc := from.Location()
	start := time.Date(from.Year(), from.Month(), 1, 0, 0, 0, 0, loc)
	end := time.Date(to.Year(), to.Month(), 1, 0, 0, 0, 0, loc).AddDate(0, 1, 0)

	points := []PayrollPoint{}
	cursor := start
	for cursor.Before(end) {
		y, m, _ := cursor.Date()

		var payroll int64
		if err := s.db.WithContext(ctx).
			Model(&models.PayrollEntry{}).
			Where("period_year = ? AND period_month = ?", y, int(m)).
			Select("COALESCE(SUM(total_salary_cents), 0)").
			Scan(&payroll).Error; err != nil {
			return nil, err
		}

		points = append(points, PayrollPoint{
			Year:         y,
			Month:        int(m),
			PayrollCents: payroll,
		})

		cursor = cursor.AddDate(0, 1, 0)
	}

	return points, nil
}

// GetAdvisorDebts aggregates student balances per advisor (only debts, BalanceCents < 0).
func (s *ReportService) GetAdvisorDebts(ctx context.Context, month time.Time) ([]AdvisorDebt, error) {
	// For now, we use the current student BalanceCents snapshot, not a historical value.
	type row struct {
		AdvisorID  uint
		FirstName  string
		LastName   string
		DebtCents  int64
	}

	var rows []row
	if err := s.db.WithContext(ctx).
		Model(&models.Student{}).
		Joins("JOIN users ON users.id = students.advisor_id").
		Where("students.balance_cents < 0").
		Select("students.advisor_id AS advisor_id, users.first_name, users.last_name, COALESCE(SUM(-students.balance_cents), 0) AS debt_cents").
		Group("students.advisor_id, users.first_name, users.last_name").
		Order("debt_cents DESC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	out := make([]AdvisorDebt, len(rows))
	for i, r := range rows {
		out[i] = AdvisorDebt{
			AdvisorID:   r.AdvisorID,
			AdvisorName: r.FirstName + " " + r.LastName,
			DebtCents:   r.DebtCents,
		}
	}
	return out, nil
}

// GetSummary computes summary cards (revenue, payroll, debts, net profit) for a given month range.
func (s *ReportService) GetSummary(ctx context.Context, from, to time.Time) (ReportSummary, error) {
	var revenue int64
	if err := s.db.WithContext(ctx).
		Model(&models.Payment{}).
		Where("status = ? AND paid_at >= ? AND paid_at < ?", models.PaymentStatusPaid, from, to).
		Select("COALESCE(SUM(amount_cents), 0)").
		Scan(&revenue).Error; err != nil {
		return ReportSummary{}, err
	}

	var payroll int64
	startYear, startMonth, _ := from.Date()
	endYear, endMonth, _ := to.Date()

	// Sum only PAID payroll across months in [from, to).
	if err := s.db.WithContext(ctx).
		Model(&models.PayrollEntry{}).
		Where(
			"(period_year > ? OR (period_year = ? AND period_month >= ?)) AND (period_year < ? OR (period_year = ? AND period_month <= ?)) AND status = ?",
			startYear, startYear, int(startMonth),
			endYear, endYear, int(endMonth),
			models.PayrollStatusPaid,
		).
		Select("COALESCE(SUM(total_salary_cents), 0)").
		Scan(&payroll).Error; err != nil {
		return ReportSummary{}, err
	}

	// Debt from students (snapshot).
	var debt int64
	if err := s.db.WithContext(ctx).
		Model(&models.Student{}).
		Where("balance_cents < 0").
		Select("COALESCE(SUM(-balance_cents), 0)").
		Scan(&debt).Error; err != nil {
		return ReportSummary{}, err
	}

	net := revenue - payroll - debt

	return ReportSummary{
		TotalRevenueCents: revenue,
		TotalPayrollCents: payroll,
		TotalDebtCents:    debt,
		NetProfitCents:    net,
	}, nil
}

