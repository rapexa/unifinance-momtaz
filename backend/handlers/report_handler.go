package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// ReportSummaryDTO mirrors services.ReportSummary for Swagger.
type ReportSummaryDTO struct {
	TotalRevenueCents  int64 `json:"total_revenue_cents"`
	TotalPayrollCents  int64 `json:"total_payroll_cents"`
	TotalExpensesCents int64 `json:"total_expenses_cents"`
	TotalDebtCents     int64 `json:"total_debt_cents"`
	NetProfitCents     int64 `json:"net_profit_cents"`
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
	finance *services.FinanceService
}

func NewReportHandler(service *services.ReportService, finance *services.FinanceService) *ReportHandler {
	return &ReportHandler{service: service, finance: finance}
}

// PnLFiguresDTO is one column of the profit & loss.
type PnLFiguresDTO struct {
	IncomeCents   int64 `json:"income_cents"`
	SalaryCents   int64 `json:"salary_cents"`
	ExpensesCents int64 `json:"expenses_cents"`
	OutflowCents  int64 `json:"outflow_cents"`
	ProfitCents   int64 `json:"profit_cents"`
}

func toPnLFiguresDTO(f services.PnLFigures) PnLFiguresDTO {
	return PnLFiguresDTO{
		IncomeCents:   f.IncomeCents,
		SalaryCents:   f.SalaryCents,
		ExpensesCents: f.ExpensesCents,
		OutflowCents:  f.OutflowCents,
		ProfitCents:   f.ProfitCents,
	}
}

// GetPnL handles GET /reports/pnl?year&month — this month vs. to date, plus debts.
func (h *ReportHandler) GetPnL(c *gin.Context) {
	year, month, ok := periodFromQuery(c)
	if !ok {
		return
	}
	pnl, err := h.finance.PnL(c.Request.Context(), year, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در محاسبه سود و زیان"})
		return
	}
	var toDateFrom *string
	if !pnl.ToDateFrom.IsZero() {
		s := pnl.ToDateFrom.Format("2006-01-02")
		toDateFrom = &s
	}
	c.JSON(http.StatusOK, gin.H{
		"period_year":  pnl.PeriodYear,
		"period_month": pnl.PeriodMonth,
		"to_date_from": toDateFrom,
		"month":        toPnLFiguresDTO(pnl.Month),
		"to_date":      toPnLFiguresDTO(pnl.ToDate),
		"debts": gin.H{
			"student_due_cents":   pnl.Debts.StudentDueCents,
			"student_total_cents": pnl.Debts.StudentTotalCents,
			"student_debtors":     pnl.Debts.StudentDebtors,
			"staff_payable_cents": pnl.Debts.StaffPayableCents,
			"staff_credit_cents":  pnl.Debts.StaffCreditCents,
		},
	})
}

// GetPnLSeries handles GET /reports/pnl/series?from=YYYY-MM&to=YYYY-MM (period keys).
func (h *ReportHandler) GetPnLSeries(c *gin.Context) {
	from, to, ok := parseMonthRangeOrDefault(c)
	if !ok {
		return
	}
	fy, fm := services.PeriodOf(from)
	ty, tm := services.PeriodOf(to.Add(-time.Second))
	points, err := h.finance.Series(c.Request.Context(), fy, fm, ty, tm)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت روند سود و زیان"})
		return
	}
	out := make([]gin.H, len(points))
	for i, p := range points {
		out[i] = gin.H{
			"year":           p.Year,
			"month":          p.Month,
			"income_cents":   p.IncomeCents,
			"salary_cents":   p.SalaryCents,
			"expenses_cents": p.ExpensesCents,
			"outflow_cents":  p.OutflowCents,
			"profit_cents":   p.ProfitCents,
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت خلاصه گزارش‌ها"})
		return
	}

	dto := ReportSummaryDTO{
		TotalRevenueCents:  summary.TotalRevenueCents,
		TotalPayrollCents:  summary.TotalPayrollCents,
		TotalExpensesCents: summary.TotalExpensesCents,
		TotalDebtCents:     summary.TotalDebtCents,
		NetProfitCents:     summary.NetProfitCents,
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت نمودار درآمد"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت نمودار حقوق"})
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

// GetPaidPaymentsDetail handles GET /reports/revenue/payments
// @Router /reports/revenue/payments [get]
func (h *ReportHandler) GetPaidPaymentsDetail(c *gin.Context) {
	from, to, ok := parseMonthRangeOrDefault(c)
	if !ok {
		return
	}
	rows, err := h.service.GetPaidPaymentsDetail(c.Request.Context(), from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت جزئیات پرداخت‌ها"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

// GetRevenueByStudent handles GET /reports/revenue/by-student
// @Router /reports/revenue/by-student [get]
func (h *ReportHandler) GetRevenueByStudent(c *gin.Context) {
	from, to, ok := parseMonthRangeOrDefault(c)
	if !ok {
		return
	}
	rows, err := h.service.GetRevenueByStudent(c.Request.Context(), from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت درآمد به تفکیک دانش‌آموز"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

// GetPayrollLines handles GET /reports/payroll/lines
// @Router /reports/payroll/lines [get]
func (h *ReportHandler) GetPayrollLines(c *gin.Context) {
	from, to, ok := parseMonthRangeOrDefault(c)
	if !ok {
		return
	}
	rows, err := h.service.GetPayrollLinesInRange(c.Request.Context(), from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت جزئیات حقوق"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

// GetPayrollByUser handles GET /reports/payroll/by-user
// @Router /reports/payroll/by-user [get]
func (h *ReportHandler) GetPayrollByUser(c *gin.Context) {
	from, to, ok := parseMonthRangeOrDefault(c)
	if !ok {
		return
	}
	rows, err := h.service.GetPayrollByUser(c.Request.Context(), from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت حقوق به تفکیک کارمند"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

// GetStudentDebts handles GET /reports/debts/students
// @Router /reports/debts/students [get]
func (h *ReportHandler) GetStudentDebts(c *gin.Context) {
	rows, err := h.service.GetStudentDebtsDetail(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت بدهی دانش‌آموزان"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "فرمت ماه نامعتبر است"})
		return
	}

	debts, err := h.service.GetAdvisorDebts(c.Request.Context(), now)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت بدهی مشاوران"})
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

// parseMonthRangeOrDefault parses from/to period keys (YYYY-MM, see pkg/jalali) and returns the
// exact Jalali bounds [start of "from" month, end of "to" month). Defaults to the current month.
func parseMonthRangeOrDefault(c *gin.Context) (time.Time, time.Time, bool) {
	dy, dm := services.DefaultPeriod(time.Now())
	def := fmt.Sprintf("%04d-%02d", dy, dm)
	fromStr := c.DefaultQuery("from", def)
	toStr := c.DefaultQuery("to", def)

	fromMonth, err := time.Parse("2006-01", fromStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "تاریخ شروع نامعتبر است"})
		return time.Time{}, time.Time{}, false
	}
	toMonth, err := time.Parse("2006-01", toStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "تاریخ پایان نامعتبر است"})
		return time.Time{}, time.Time{}, false
	}
	if toMonth.Before(fromMonth) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "تاریخ پایان باید بعد از شروع باشد"})
		return time.Time{}, time.Time{}, false
	}
	from, _ := services.PeriodBounds(fromMonth.Year(), int(fromMonth.Month()))
	_, to := services.PeriodBounds(toMonth.Year(), int(toMonth.Month()))
	return from, to, true
}
