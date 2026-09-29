package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/middleware"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// DashboardHandler exposes read-only dashboard aggregation endpoints.
type DashboardHandler struct {
	service  *services.DashboardService
	payments *services.PaymentService
	overview *services.OverviewService
}

func NewDashboardHandler(service *services.DashboardService, payments *services.PaymentService, overview *services.OverviewService) *DashboardHandler {
	return &DashboardHandler{service: service, payments: payments, overview: overview}
}

func toKPIDTO(k services.OverviewKPI) gin.H {
	spark := k.Spark
	if spark == nil {
		spark = []int64{}
	}
	out := gin.H{"value_cents": k.Value, "spark_cents": spark}
	if k.HasPrev {
		out["previous_cents"] = k.Previous
	}
	return out
}

// GetOverview handles GET /dashboard/overview?year&month — the finance dashboard (admins only):
// cash, income, expenses, profit, receivables, cash flow, upcoming dues and recent transactions.
func (h *DashboardHandler) GetOverview(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}
	year, month, ok := periodFromQuery(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	_, _ = h.payments.PromotePendingPastDueToOverdue(ctx)
	o, err := h.overview.Build(ctx, year, month, time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت داشبورد مالی"})
		return
	}

	series := make([]gin.H, len(o.Series))
	for i, p := range o.Series {
		series[i] = gin.H{
			"year": p.Year, "month": p.Month,
			"income_cents": p.IncomeCents, "outflow_cents": p.OutflowCents, "profit_cents": p.ProfitCents,
		}
	}
	upcoming := make([]gin.H, len(o.Upcoming))
	for i, u := range o.Upcoming {
		upcoming[i] = gin.H{
			"kind": u.Kind, "title": u.Title, "subtitle": u.Subtitle, "due_date": u.DueDate,
			"days_left": u.DaysLeft, "amount_cents": u.AmountCents, "student_id": u.StudentID,
		}
	}
	recent := make([]gin.H, len(o.Recent))
	for i, t := range o.Recent {
		recent[i] = gin.H{
			"kind": t.Kind, "id": t.ID, "date": t.Date, "title": t.Title, "category": t.Category,
			"counterparty": t.Counterparty, "amount_cents": t.AmountCents, "status": t.Status,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"period_year":  o.PeriodYear,
		"period_month": o.PeriodMonth,
		"kpis": gin.H{
			"cash":     toKPIDTO(o.Cash),
			"income":   toKPIDTO(o.Income),
			"expenses": toKPIDTO(o.Expenses),
			"profit":   toKPIDTO(o.Profit),
			"overdue":  toKPIDTO(o.Overdue),
		},
		"action": gin.H{
			"overdue_count": o.OverdueCount, "overdue_cents": o.Overdue.Value,
			"pending_count": o.PendingCount, "pending_cents": o.PendingCents,
			"payroll_count": o.PayrollCount, "payroll_cents": o.PayrollCents,
		},
		"cash_flow": gin.H{
			"in_cents": o.CashInCents, "out_cents": o.CashOutCents, "net_cents": o.CashInCents - o.CashOutCents,
			"prev_in_cents": o.PrevCashIn, "prev_out_cents": o.PrevCashOut, "prev_net_cents": o.PrevCashIn - o.PrevCashOut,
		},
		"aging": gin.H{
			"overdue_cents": o.Overdue.Value,
			"d1_30_cents":   o.Aging[0], "d31_60_cents": o.Aging[1], "d60_plus_cents": o.Aging[2],
		},
		"students": gin.H{"active": o.ActiveStudent, "registrations": o.Registrations},
		"series":   series,
		"upcoming": upcoming,
		"recent":   recent,
	})
}

// --- Swagger DTOs for dashboard responses ---

// DashboardKPIsDTO mirrors services.DashboardKPIs for Swagger docs.
type DashboardKPIsDTO struct {
	TotalRevenueCents             int64 `json:"total_revenue_cents"`
	PendingDebtCents              int64 `json:"pending_debt_cents"`
	OverdueDebtCents              int64 `json:"overdue_debt_cents"`
	ActiveStudents                int64 `json:"active_students"`
	StudentRegistrationsThisMonth int64 `json:"student_registrations_this_month"`
	MonthlyPayrollCents           int64 `json:"monthly_payroll_cents"`
	// StudentDebtCents: sum of active students' remaining enrollment debt (matches student list).
	StudentDebtCents int64 `json:"student_debt_cents"`
}

// DebtAlertDTO represents a single debt alert item.
type DebtAlertDTO struct {
	StudentID   uint   `json:"student_id"`
	StudentName string `json:"student_name"`
	AmountCents int64  `json:"amount_cents"`
	DaysOverdue int    `json:"days_overdue"`
}

// DashboardSummaryResponse aggregates KPIs, recent payments and debt alerts.
type DashboardSummaryResponse struct {
	KPIs           DashboardKPIsDTO `json:"kpis"`
	RecentPayments []PaymentDTO     `json:"recent_payments"`
	DebtAlerts     []DebtAlertDTO   `json:"debt_alerts"`
}

// RevenueTrendPointDTO describes a single point on the revenue vs payroll chart.
type RevenueTrendPointDTO struct {
	Year         int   `json:"year"`
	Month        int   `json:"month"`
	RevenueCents int64 `json:"revenue_cents"`
	PayrollCents int64 `json:"payroll_cents"`
}

// GetSummary handles GET /dashboard/summary
// @Summary      Dashboard summary
// @Description  High-level KPIs, recent payments and debt alerts for the dashboard widgets
// @Tags         dashboard
// @Security     BearerAuth
// @Produce      json
// @Param        recent_limit  query     int  false "Number of recent payments to include" default(5)
// @Param        alerts_limit  query     int  false "Number of debt alerts to include" default(5)
// @Success      200           {object}  DashboardSummaryResponse
// @Failure      401           {object}  map[string]string
// @Failure      500           {object}  map[string]string
// @Router       /dashboard/summary [get]
func (h *DashboardHandler) GetSummary(c *gin.Context) {
	ctx := c.Request.Context()
	_, _ = h.payments.PromotePendingPastDueToOverdue(ctx)
	now := time.Now()

	recentLimit := parsePositiveIntDefault(c.Query("recent_limit"), 5, 1, 50)
	alertsLimit := parsePositiveIntDefault(c.Query("alerts_limit"), 5, 1, 50)

	scope := middleware.DataScopeUserID(c)
	kpis, err := h.service.GetKPIs(ctx, now, scope)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت شاخص‌های داشبورد"})
		return
	}

	payments, err := h.service.GetRecentPayments(ctx, recentLimit, scope)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت پرداخت‌های اخیر"})
		return
	}

	alerts, err := h.service.GetDebtAlerts(ctx, alertsLimit, scope)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت هشدار بدهی‌ها"})
		return
	}

	studentDebt, err := h.payments.SumActiveStudentDebtCents(ctx, scope)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت شاخص‌های داشبورد"})
		return
	}

	// Map service structs to DTOs
	kpiDTO := DashboardKPIsDTO{
		TotalRevenueCents:             kpis.TotalRevenueCents,
		PendingDebtCents:              kpis.PendingDebtCents,
		OverdueDebtCents:              kpis.OverdueDebtCents,
		ActiveStudents:                kpis.ActiveStudents,
		StudentRegistrationsThisMonth: kpis.StudentRegistrationsThisMonth,
		MonthlyPayrollCents:           kpis.MonthlyPayrollCents,
		StudentDebtCents:              studentDebt,
	}

	paymentDTOs := toPaymentDTOSlice(payments)

	alertDTOs := make([]DebtAlertDTO, len(alerts))
	for i, a := range alerts {
		alertDTOs[i] = DebtAlertDTO{
			StudentID:   a.StudentID,
			StudentName: a.StudentName,
			AmountCents: a.AmountCents,
			DaysOverdue: a.DaysOverdue,
		}
	}

	c.JSON(http.StatusOK, DashboardSummaryResponse{
		KPIs:           kpiDTO,
		RecentPayments: paymentDTOs,
		DebtAlerts:     alertDTOs,
	})
}

// GetRecentPayments handles GET /dashboard/recent-payments
// @Summary      Recent payments
// @Description  List of the most recent payments for the dashboard table
// @Tags         dashboard
// @Security     BearerAuth
// @Produce      json
// @Param        limit  query     int  false "Number of recent payments to return" default(5)
// @Success      200    {array}   PaymentDTO
// @Failure      401    {object}  map[string]string
// @Failure      500    {object}  map[string]string
// @Router       /dashboard/recent-payments [get]
func (h *DashboardHandler) GetRecentPayments(c *gin.Context) {
	ctx := c.Request.Context()
	_, _ = h.payments.PromotePendingPastDueToOverdue(ctx)
	limit := parsePositiveIntDefault(c.Query("limit"), 5, 1, 50)

	payments, err := h.service.GetRecentPayments(ctx, limit, middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت پرداخت‌های اخیر"})
		return
	}

	c.JSON(http.StatusOK, toPaymentDTOSlice(payments))
}

// GetDebtAlerts handles GET /dashboard/debt-alerts
// @Summary      Debt alerts
// @Description  List of overdue payment alerts for the dashboard
// @Tags         dashboard
// @Security     BearerAuth
// @Produce      json
// @Param        limit  query     int  false "Number of alerts to return" default(5)
// @Success      200    {array}   DebtAlertDTO
// @Failure      401    {object}  map[string]string
// @Failure      500    {object}  map[string]string
// @Router       /dashboard/debt-alerts [get]
func (h *DashboardHandler) GetDebtAlerts(c *gin.Context) {
	ctx := c.Request.Context()
	_, _ = h.payments.PromotePendingPastDueToOverdue(ctx)
	limit := parsePositiveIntDefault(c.Query("limit"), 5, 1, 50)

	alerts, err := h.service.GetDebtAlerts(ctx, limit, middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت هشدار بدهی‌ها"})
		return
	}

	out := make([]DebtAlertDTO, len(alerts))
	for i, a := range alerts {
		out[i] = DebtAlertDTO{
			StudentID:   a.StudentID,
			StudentName: a.StudentName,
			AmountCents: a.AmountCents,
			DaysOverdue: a.DaysOverdue,
		}
	}

	c.JSON(http.StatusOK, out)
}

// GetRevenueTrend handles GET /dashboard/revenue-trend
// @Summary      Revenue vs payroll trend
// @Description  Monthly aggregated revenue (payments) and payroll amounts for charts
// @Tags         dashboard
// @Security     BearerAuth
// @Produce      json
// @Param        months  query     int  false "How many recent months to include (including current)" default(6)
// @Success      200     {array}   RevenueTrendPointDTO
// @Failure      401     {object}  map[string]string
// @Failure      500     {object}  map[string]string
// @Router       /dashboard/revenue-trend [get]
func (h *DashboardHandler) GetRevenueTrend(c *gin.Context) {
	ctx := c.Request.Context()
	now := time.Now()
	months := parsePositiveIntDefault(c.Query("months"), 6, 1, 24)

	points, err := h.service.GetRevenueTrend(ctx, months, now, middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت روند درآمد"})
		return
	}

	out := make([]RevenueTrendPointDTO, len(points))
	for i, p := range points {
		out[i] = RevenueTrendPointDTO{
			Year:         p.Year,
			Month:        p.Month,
			RevenueCents: p.RevenueCents,
			PayrollCents: p.PayrollCents,
		}
	}

	c.JSON(http.StatusOK, out)
}

// parsePositiveIntDefault parses a string into an int with sensible defaults and bounds.
func parsePositiveIntDefault(raw string, def, min, max int) int {
	if raw == "" {
		return def
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < min {
		return def
	}
	if v > max {
		return max
	}
	return v
}
