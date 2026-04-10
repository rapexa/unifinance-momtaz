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
}

func NewDashboardHandler(service *services.DashboardService, payments *services.PaymentService) *DashboardHandler {
	return &DashboardHandler{service: service, payments: payments}
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load dashboard KPIs"})
		return
	}

	payments, err := h.service.GetRecentPayments(ctx, recentLimit, scope)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load recent payments"})
		return
	}

	alerts, err := h.service.GetDebtAlerts(ctx, alertsLimit, scope)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load debt alerts"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load recent payments"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load debt alerts"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load revenue trend"})
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
