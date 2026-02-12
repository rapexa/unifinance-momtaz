package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// ReportSummaryDTO mirrors services.ReportSummary for Swagger.
type ReportSummaryDTO struct {
	TotalRevenueCents int64 `json:"total_revenue_cents"`
	TotalPayrollCents int64 `json:"total_payroll_cents"`
	TotalDebtCents    int64 `json:"total_debt_cents"`
	NetProfitCents    int64 `json:"net_profit_cents"`
}

// RevenuePointDTO mirrors services.RevenuePoint for Swagger.
type RevenuePointDTO struct {
	Year         int   `json:"year"`
	Month        int   `json:"month"`
	RevenueCents int64 `json:"revenue_cents"`
}

// PayrollPointDTO mirrors services.PayrollPoint for Swagger.
type PayrollPointDTO struct {
	Year         int   `json:"year"`
	Month        int   `json:"month"`
	PayrollCents int64 `json:"payroll_cents"`
}

// AdvisorDebtDTO mirrors services.AdvisorDebt for Swagger.
type AdvisorDebtDTO struct {
	AdvisorID   uint   `json:"advisor_id"`
	AdvisorName string `json:"advisor_name"`
	DebtCents   int64  `json:"debt_cents"`
}

// ReportHandler exposes reporting endpoints.
type ReportHandler struct {
	service *services.ReportService
}

func NewReportHandler(service *services.ReportService) *ReportHandler {
	return &ReportHandler{service: service}
}

// GetSummary handles GET /reports/summary
// @Summary      Reports summary
// @Description  High-level financial summary (revenue, payroll, debts, net profit) over a month range (admin only)
// @Tags         reports
// @Security     BearerAuth
// @Produce      json
// @Param        from  query     string  false "Start month (YYYY-MM), default: current month"
// @Param        to    query     string  false "End month (YYYY-MM), default: current month"
// @Success      200   {object}  ReportSummaryDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /reports/summary [get]
func (h *ReportHandler) GetSummary(c *gin.Context) {
	from, to, ok := parseMonthRangeOrDefault(c)
	if !ok {
		// parseMonthRangeOrDefault already responded with error
		return
	}

	summary, err := h.service.GetSummary(c.Request.Context(), from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load reports summary"})
		return
	}

	dto := ReportSummaryDTO{
		TotalRevenueCents: summary.TotalRevenueCents,
		TotalPayrollCents: summary.TotalPayrollCents,
		TotalDebtCents:    summary.TotalDebtCents,
		NetProfitCents:    summary.NetProfitCents,
	}
	c.JSON(http.StatusOK, dto)
}

// GetRevenueSeries handles GET /reports/revenue
// @Summary      Revenue series
// @Description  Monthly revenue series between two months (admin only)
// @Tags         reports
// @Security     BearerAuth
// @Produce      json
// @Param        from  query     string  false "Start month (YYYY-MM), default: current month"
// @Param        to    query     string  false "End month (YYYY-MM), default: current month"
// @Success      200   {array}   RevenuePointDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /reports/revenue [get]
func (h *ReportHandler) GetRevenueSeries(c *gin.Context) {
	from, to, ok := parseMonthRangeOrDefault(c)
	if !ok {
		return
	}

	points, err := h.service.GetRevenueSeries(c.Request.Context(), from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load revenue series"})
		return
	}

	out := make([]RevenuePointDTO, len(points))
	for i, p := range points {
		out[i] = RevenuePointDTO{
			Year:         p.Year,
			Month:        p.Month,
			RevenueCents: p.RevenueCents,
		}
	}
	c.JSON(http.StatusOK, out)
}

// GetPayrollSeries handles GET /reports/payroll
// @Summary      Payroll series
// @Description  Monthly payroll series between two months (admin only)
// @Tags         reports
// @Security     BearerAuth
// @Produce      json
// @Param        from  query     string  false "Start month (YYYY-MM), default: current month"
// @Param        to    query     string  false "End month (YYYY-MM), default: current month"
// @Success      200   {array}   PayrollPointDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /reports/payroll [get]
func (h *ReportHandler) GetPayrollSeries(c *gin.Context) {
	from, to, ok := parseMonthRangeOrDefault(c)
	if !ok {
		return
	}

	points, err := h.service.GetPayrollSeries(c.Request.Context(), from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load payroll series"})
		return
	}

	out := make([]PayrollPointDTO, len(points))
	for i, p := range points {
		out[i] = PayrollPointDTO{
			Year:         p.Year,
			Month:        p.Month,
			PayrollCents: p.PayrollCents,
		}
	}
	c.JSON(http.StatusOK, out)
}

// GetDebtsByAdvisor handles GET /reports/debts
// @Summary      Debts by advisor
// @Description  Aggregated student debts per advisor (admin only)
// @Tags         reports
// @Security     BearerAuth
// @Produce      json
// @Param        month  query     string  false "Month (YYYY-MM), currently only used for UI; data is based on current balances"
// @Success      200    {array}   AdvisorDebtDTO
// @Failure      400    {object}  map[string]string
// @Failure      401    {object}  map[string]string
// @Failure      403    {object}  map[string]string
// @Failure      500    {object}  map[string]string
// @Router       /reports/debts [get]
func (h *ReportHandler) GetDebtsByAdvisor(c *gin.Context) {
	// We currently ignore the month and use the live balances snapshot.
	now := time.Now()
	monthStr := c.DefaultQuery("month", now.Format("2006-01"))
	if _, err := time.Parse("2006-01", monthStr); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month; expected YYYY-MM"})
		return
	}

	debts, err := h.service.GetAdvisorDebts(c.Request.Context(), now)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load advisor debts"})
		return
	}

	out := make([]AdvisorDebtDTO, len(debts))
	for i, d := range debts {
		out[i] = AdvisorDebtDTO{
			AdvisorID:   d.AdvisorID,
			AdvisorName: d.AdvisorName,
			DebtCents:   d.DebtCents,
		}
	}
	c.JSON(http.StatusOK, out)
}

// parseMonthRangeOrDefault parses from/to in YYYY-MM format, defaults to current month if empty.
func parseMonthRangeOrDefault(c *gin.Context) (time.Time, time.Time, bool) {
	now := time.Now()
	loc := now.Location()

	fromStr := c.DefaultQuery("from", now.Format("2006-01"))
	toStr := c.DefaultQuery("to", now.Format("2006-01"))

	fromMonth, err := time.ParseInLocation("2006-01", fromStr, loc)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid from; expected YYYY-MM"})
		return time.Time{}, time.Time{}, false
	}
	toMonth, err := time.ParseInLocation("2006-01", toStr, loc)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid to; expected YYYY-MM"})
		return time.Time{}, time.Time{}, false
	}

	if toMonth.Before(fromMonth) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "to must be greater than or equal to from"})
		return time.Time{}, time.Time{}, false
	}

	// convert months to [fromMonth, toMonthEndExclusive)
	from := time.Date(fromMonth.Year(), fromMonth.Month(), 1, 0, 0, 0, 0, loc)
	to := time.Date(toMonth.Year(), toMonth.Month(), 1, 0, 0, 0, 0, loc).AddDate(0, 1, 0)

	return from, to, true
}

