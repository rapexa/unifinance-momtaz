package services

import (
	"context"
	"fmt"
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
	Year         int   `json:"year"`
	Month        int   `json:"month"`
	PayrollCents int64 `json:"payroll_cents"`
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

// PaidPaymentDetail is one PAID payment row for reports (دریافتی‌ها / پرداخت دانش‌آموز).
type PaidPaymentDetail struct {
	ID          uint       `json:"id"`
	PaidAt      *time.Time `json:"paid_at"`
	AmountCents int64      `json:"amount_cents"`
	Method      string     `json:"method"`
	StudentID   uint       `json:"student_id"`
	StudentName string     `json:"student_name"`
	Description string     `json:"description,omitempty"`
	AdvisorName string     `json:"advisor_name,omitempty"`
}

// RevenueByStudent aggregates paid amounts per student in a period.
type RevenueByStudent struct {
	StudentID    uint   `json:"student_id"`
	StudentName  string `json:"student_name"`
	TotalCents   int64  `json:"total_cents"`
	PaymentCount int64  `json:"payment_count"`
	AdvisorName  string `json:"advisor_name,omitempty"`
}

// PayrollLineDetail is one payroll entry in a period (کی چقدر حقوق).
type PayrollLineDetail struct {
	UserID              uint       `json:"user_id"`
	UserName            string     `json:"user_name"`
	RoleCode            string     `json:"role_code,omitempty"`
	PeriodYear          int        `json:"period_year"`
	PeriodMonth         int        `json:"period_month"`
	BaseSalaryCents     int64      `json:"base_salary_cents"`
	VariableSalaryCents int64      `json:"variable_salary_cents"`
	TotalSalaryCents    int64      `json:"total_salary_cents"`
	Status              string     `json:"status"`
	PaidAt              *time.Time `json:"paid_at,omitempty"`
}

// StudentDebtDetail is a debtor student row (بدهکار).
type StudentDebtDetail struct {
	StudentID    uint   `json:"student_id"`
	StudentName  string `json:"student_name"`
	BalanceCents int64  `json:"balance_cents"` // negative
	AdvisorName  string `json:"advisor_name,omitempty"`
}

// PayrollByUserSummary aggregates payroll per employee in a period.
type PayrollByUserSummary struct {
	UserID       uint   `json:"user_id"`
	UserName     string `json:"user_name"`
	RoleCode     string `json:"role_code,omitempty"`
	TotalCents   int64  `json:"total_cents"`
	PaidCents    int64  `json:"paid_cents"`
	PendingCents int64  `json:"pending_cents"`
	EntryCount   int64  `json:"entry_count"`
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
		AdvisorID uint
		FirstName string
		LastName  string
		DebtCents int64
	}

	var rows []row
	if err := s.db.WithContext(ctx).
		Model(&models.Student{}).
		Joins("LEFT JOIN users ON users.id = students.advisor_id").
		Where("students.balance_cents < 0").
		Select(`COALESCE(students.advisor_id, 0) AS advisor_id,
			COALESCE(users.first_name, '') AS first_name,
			COALESCE(users.last_name, '') AS last_name,
			COALESCE(SUM(-students.balance_cents), 0) AS debt_cents`).
		Group("students.advisor_id, users.first_name, users.last_name").
		Order("debt_cents DESC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	out := make([]AdvisorDebt, len(rows))
	for i, r := range rows {
		name := (r.FirstName + " " + r.LastName)
		if r.AdvisorID == 0 || name == " " {
			name = "بدون مشاور"
		}
		out[i] = AdvisorDebt{
			AdvisorID:   r.AdvisorID,
			AdvisorName: name,
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

// monthRangeKeys returns inclusive-exclusive month indices for SQL: [fromKey, toKey).
func monthRangeKeys(from, to time.Time) (fromKey, toKey int) {
	fromKey = from.Year()*12 + int(from.Month())
	toKey = to.Year()*12 + int(to.Month())
	return fromKey, toKey
}

// GetPaidPaymentsDetail lists all PAID payments in [from, to) by paid_at.
func (s *ReportService) GetPaidPaymentsDetail(ctx context.Context, from, to time.Time) ([]PaidPaymentDetail, error) {
	var rows []models.Payment
	if err := s.db.WithContext(ctx).
		Preload("Student").
		Preload("Student.Advisor").
		Where("status = ? AND paid_at IS NOT NULL AND paid_at >= ? AND paid_at < ?",
			models.PaymentStatusPaid, from, to).
		Order("paid_at DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]PaidPaymentDetail, 0, len(rows))
	for i := range rows {
		p := &rows[i]
		name := fmt.Sprintf("%s %s", p.Student.FirstName, p.Student.LastName)
		var adv string
		if p.Student.Advisor != nil {
			adv = fmt.Sprintf("%s %s", p.Student.Advisor.FirstName, p.Student.Advisor.LastName)
		}
		out = append(out, PaidPaymentDetail{
			ID:          p.ID,
			PaidAt:      p.PaidAt,
			AmountCents: p.AmountCents,
			Method:      string(p.Method),
			StudentID:   p.StudentID,
			StudentName: name,
			Description: p.Description,
			AdvisorName: adv,
		})
	}
	return out, nil
}

// GetRevenueByStudent aggregates PAID payments per student in [from, to).
func (s *ReportService) GetRevenueByStudent(ctx context.Context, from, to time.Time) ([]RevenueByStudent, error) {
	type agg struct {
		StudentID    uint
		TotalCents   int64
		PaymentCount int64
	}
	var aggs []agg
	if err := s.db.WithContext(ctx).
		Model(&models.Payment{}).
		Select("student_id, SUM(amount_cents) AS total_cents, COUNT(*) AS payment_count").
		Where("status = ? AND paid_at IS NOT NULL AND paid_at >= ? AND paid_at < ?",
			models.PaymentStatusPaid, from, to).
		Group("student_id").
		Order("total_cents DESC").
		Scan(&aggs).Error; err != nil {
		return nil, err
	}
	if len(aggs) == 0 {
		return nil, nil
	}
	ids := make([]uint, len(aggs))
	for i, a := range aggs {
		ids[i] = a.StudentID
	}
	var students []models.Student
	if err := s.db.WithContext(ctx).
		Preload("Advisor").
		Where("id IN ?", ids).
		Find(&students).Error; err != nil {
		return nil, err
	}
	byID := make(map[uint]models.Student, len(students))
	for i := range students {
		byID[students[i].ID] = students[i]
	}
	out := make([]RevenueByStudent, 0, len(aggs))
	for _, a := range aggs {
		st := byID[a.StudentID]
		name := fmt.Sprintf("%s %s", st.FirstName, st.LastName)
		var adv string
		if st.Advisor != nil {
			adv = fmt.Sprintf("%s %s", st.Advisor.FirstName, st.Advisor.LastName)
		}
		out = append(out, RevenueByStudent{
			StudentID:    a.StudentID,
			StudentName:  name,
			TotalCents:   a.TotalCents,
			PaymentCount: a.PaymentCount,
			AdvisorName:  adv,
		})
	}
	return out, nil
}

// GetPayrollLinesInRange returns payroll entries whose (period_year, period_month) falls in [from, to) month range.
func (s *ReportService) GetPayrollLinesInRange(ctx context.Context, from, to time.Time) ([]PayrollLineDetail, error) {
	fromKey, toKey := monthRangeKeys(from, to)
	var entries []models.PayrollEntry
	if err := s.db.WithContext(ctx).
		Preload("User").
		Preload("User.Role").
		Where("(period_year * 12 + period_month) >= ? AND (period_year * 12 + period_month) < ?", fromKey, toKey).
		Order("period_year DESC, period_month DESC, user_id").
		Find(&entries).Error; err != nil {
		return nil, err
	}
	out := make([]PayrollLineDetail, 0, len(entries))
	for i := range entries {
		e := &entries[i]
		uname := fmt.Sprintf("%s %s", e.User.FirstName, e.User.LastName)
		var role string
		if e.User.Role != nil {
			role = e.User.Role.Code
		}
		out = append(out, PayrollLineDetail{
			UserID:              e.UserID,
			UserName:            uname,
			RoleCode:            role,
			PeriodYear:          e.PeriodYear,
			PeriodMonth:         e.PeriodMonth,
			BaseSalaryCents:     e.BaseSalaryCents,
			VariableSalaryCents: e.VariableSalaryCents,
			TotalSalaryCents:    e.TotalSalaryCents,
			Status:              string(e.Status),
			PaidAt:              e.PaidAt,
		})
	}
	return out, nil
}

// GetPayrollByUser aggregates total payroll per user in the month range (all statuses).
func (s *ReportService) GetPayrollByUser(ctx context.Context, from, to time.Time) ([]PayrollByUserSummary, error) {
	fromKey, toKey := monthRangeKeys(from, to)
	type agg struct {
		UserID  uint
		Total   int64
		Paid    int64
		Pending int64
		Cnt     int64
	}
	var aggs []agg
	// MySQL: conditional sum
	if err := s.db.WithContext(ctx).
		Model(&models.PayrollEntry{}).
		Select(`user_id,
			COALESCE(SUM(total_salary_cents), 0) AS total,
			COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_salary_cents ELSE 0 END), 0) AS paid,
			COALESCE(SUM(CASE WHEN status = 'PENDING' THEN total_salary_cents ELSE 0 END), 0) AS pending,
			COUNT(*) AS cnt`).
		Where("(period_year * 12 + period_month) >= ? AND (period_year * 12 + period_month) < ?", fromKey, toKey).
		Group("user_id").
		Order("total DESC").
		Scan(&aggs).Error; err != nil {
		return nil, err
	}
	if len(aggs) == 0 {
		return nil, nil
	}
	ids := make([]uint, len(aggs))
	for i, a := range aggs {
		ids[i] = a.UserID
	}
	var users []models.User
	if err := s.db.WithContext(ctx).Preload("Role").Where("id IN ?", ids).Find(&users).Error; err != nil {
		return nil, err
	}
	byID := make(map[uint]models.User, len(users))
	for i := range users {
		byID[users[i].ID] = users[i]
	}
	out := make([]PayrollByUserSummary, 0, len(aggs))
	for _, a := range aggs {
		u := byID[a.UserID]
		uname := fmt.Sprintf("%s %s", u.FirstName, u.LastName)
		var role string
		if u.Role != nil {
			role = u.Role.Code
		}
		out = append(out, PayrollByUserSummary{
			UserID:       a.UserID,
			UserName:     uname,
			RoleCode:     role,
			TotalCents:   a.Total,
			PaidCents:    a.Paid,
			PendingCents: a.Pending,
			EntryCount:   a.Cnt,
		})
	}
	return out, nil
}

// GetStudentDebtsDetail lists students with negative balance (جزئیات بدهی).
func (s *ReportService) GetStudentDebtsDetail(ctx context.Context) ([]StudentDebtDetail, error) {
	var students []models.Student
	if err := s.db.WithContext(ctx).
		Preload("Advisor").
		Where("balance_cents < 0").
		Order("balance_cents ASC").
		Find(&students).Error; err != nil {
		return nil, err
	}
	out := make([]StudentDebtDetail, 0, len(students))
	for i := range students {
		st := &students[i]
		name := fmt.Sprintf("%s %s", st.FirstName, st.LastName)
		var adv string
		if st.Advisor != nil {
			adv = fmt.Sprintf("%s %s", st.Advisor.FirstName, st.Advisor.LastName)
		}
		out = append(out, StudentDebtDetail{
			StudentID:    st.ID,
			StudentName:  name,
			BalanceCents: st.BalanceCents,
			AdvisorName:  adv,
		})
	}
	return out, nil
}
