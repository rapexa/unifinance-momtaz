package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/middleware"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// ExpenseHandler exposes cost centers (مراکز هزینه) and expenses (هزینه‌ها).
type ExpenseHandler struct {
	service *services.ExpenseService
}

func NewExpenseHandler(service *services.ExpenseService) *ExpenseHandler {
	return &ExpenseHandler{service: service}
}

type CostCenterDTO struct {
	ID          uint   `json:"id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Description string `json:"description,omitempty"`
	IsSystem    bool   `json:"is_system"`
	IsActive    bool   `json:"is_active"`
	SortOrder   int    `json:"sort_order"`
	// RecurringAmountCents / DueDay: optional monthly amount due on a Jalali day (e.g. rent).
	RecurringAmountCents int64 `json:"recurring_amount_cents"`
	DueDay               int   `json:"due_day"`
}

type CostCenterTotalDTO struct {
	CostCenterDTO
	MonthCents  int64 `json:"month_cents"`
	ToDateCents int64 `json:"to_date_cents"`
	MonthCount  int64 `json:"month_count"`
}

type ExpenseLineDTO struct {
	ID               uint      `json:"id"`
	Kind             string    `json:"kind"`
	CostCenterID     uint      `json:"cost_center_id"`
	CostCenterName   string    `json:"cost_center_name"`
	AmountCents      int64     `json:"amount_cents"`
	PaidAt           time.Time `json:"paid_at"`
	Description      string    `json:"description,omitempty"`
	BankAccountID    *uint     `json:"bank_account_id,omitempty"`
	BankAccountTitle string    `json:"bank_account_title,omitempty"`
	UserID           uint      `json:"user_id,omitempty"`
	UserName         string    `json:"user_name,omitempty"`
}

func toCostCenterDTO(c models.CostCenter) CostCenterDTO {
	return CostCenterDTO{
		ID: c.ID, Name: c.Name, Kind: c.Kind, Description: c.Description,
		IsSystem: c.IsSystem, IsActive: c.IsActive, SortOrder: c.SortOrder,
		RecurringAmountCents: c.RecurringAmountCents, DueDay: c.DueDay,
	}
}

func (h *ExpenseHandler) writeError(c *gin.Context, err error) {
	switch err {
	case services.ErrCostCenterNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "مرکز هزینه یافت نشد"})
	case services.ErrCostCenterNameRequired:
		c.JSON(http.StatusBadRequest, gin.H{"error": "نام مرکز هزینه الزامی است"})
	case services.ErrCostCenterSystem:
		c.JSON(http.StatusForbidden, gin.H{"error": "مرکز هزینه «حقوق و دستمزد» سیستمی است و حذف نمی‌شود"})
	case services.ErrCostCenterInUse:
		c.JSON(http.StatusConflict, gin.H{"error": "برای این مرکز هزینه، هزینه ثبت شده است؛ ابتدا هزینه‌ها را حذف یا مرکز را غیرفعال کنید"})
	case services.ErrExpenseNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "هزینه یافت نشد"})
	case services.ErrExpenseInvalidAmount:
		c.JSON(http.StatusBadRequest, gin.H{"error": "مبلغ هزینه باید بیشتر از صفر باشد"})
	case services.ErrExpenseSalaryCenter:
		c.JSON(http.StatusBadRequest, gin.H{"error": "پرداخت حقوق را از بخش پرداخت به مشاوران و کارکنان ثبت کنید"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در پردازش هزینه"})
	}
}

func periodFromQuery(c *gin.Context) (int, int, bool) {
	dy, dm := services.DefaultPeriod(time.Now())
	year := parseIntWithDefault(c.Query("year"), dy)
	month := parseIntWithDefault(c.Query("month"), dm)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ماه نامعتبر است؛ باید بین ۱ تا ۱۲ باشد"})
		return 0, 0, false
	}
	return year, month, true
}

// Summary handles GET /expenses/summary?year&month
func (h *ExpenseHandler) Summary(c *gin.Context) {
	// Org-wide outflows (incl. every staff payout) are for unscoped admins only.
	if !requireAdmin(c) {
		return
	}
	year, month, ok := periodFromQuery(c)
	if !ok {
		return
	}
	sum, err := h.service.Summary(c.Request.Context(), year, month)
	if err != nil {
		h.writeError(c, err)
		return
	}
	centers := make([]CostCenterTotalDTO, len(sum.Centers))
	for i, r := range sum.Centers {
		centers[i] = CostCenterTotalDTO{
			CostCenterDTO: toCostCenterDTO(r.CostCenter),
			MonthCents:    r.MonthCents,
			ToDateCents:   r.ToDateCents,
			MonthCount:    r.MonthCount,
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"period_year":          sum.PeriodYear,
		"period_month":         sum.PeriodMonth,
		"centers":              centers,
		"salary_month_cents":   sum.SalaryMonthCents,
		"salary_to_date_cents": sum.SalaryToDateCents,
		"other_month_cents":    sum.OtherMonthCents,
		"other_to_date_cents":  sum.OtherToDateCents,
		"total_month_cents":    sum.TotalMonthCents,
		"total_to_date_cents":  sum.TotalToDateCents,
	})
}

// Lines handles GET /expenses?year&month&cost_center_id&scope=month|to_date
func (h *ExpenseHandler) Lines(c *gin.Context) {
	// Org-wide outflows (incl. every staff payout) are for unscoped admins only.
	if !requireAdmin(c) {
		return
	}
	year, month, ok := periodFromQuery(c)
	if !ok {
		return
	}
	var centerID uint
	if raw := c.Query("cost_center_id"); raw != "" {
		v, err := strconv.ParseUint(raw, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "مرکز هزینه نامعتبر است"})
			return
		}
		centerID = uint(v)
	}
	lines, err := h.service.Lines(c.Request.Context(), year, month, centerID, c.Query("scope") == "to_date")
	if err != nil {
		h.writeError(c, err)
		return
	}
	out := make([]ExpenseLineDTO, len(lines))
	var total int64
	for i, l := range lines {
		out[i] = ExpenseLineDTO(l)
		total += l.AmountCents
	}
	c.JSON(http.StatusOK, gin.H{"data": out, "total_cents": total})
}

type costCenterRequest struct {
	Name                 string `json:"name" binding:"required,max=120"`
	Description          string `json:"description" binding:"max=500"`
	IsActive             *bool  `json:"is_active"`
	SortOrder            int    `json:"sort_order"`
	RecurringAmountCents int64  `json:"recurring_amount_cents" binding:"gte=0"`
	DueDay               int    `json:"due_day" binding:"gte=0,lte=31"`
}

func (r costCenterRequest) input() services.CostCenterInput {
	active := true
	if r.IsActive != nil {
		active = *r.IsActive
	}
	return services.CostCenterInput{
		Name: r.Name, Description: r.Description, IsActive: active, SortOrder: r.SortOrder,
		RecurringAmountCents: r.RecurringAmountCents, DueDay: r.DueDay,
	}
}

// ListCostCenters handles GET /cost-centers
func (h *ExpenseHandler) ListCostCenters(c *gin.Context) {
	rows, err := h.service.ListCostCenters(c.Request.Context())
	if err != nil {
		h.writeError(c, err)
		return
	}
	out := make([]CostCenterDTO, len(rows))
	for i, r := range rows {
		out[i] = toCostCenterDTO(r)
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// CreateCostCenter handles POST /cost-centers
func (h *ExpenseHandler) CreateCostCenter(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}
	var req costCenterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeBindError(c, err)
		return
	}
	row, err := h.service.CreateCostCenter(c.Request.Context(), req.input())
	if err != nil {
		h.writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toCostCenterDTO(*row))
}

// UpdateCostCenter handles PUT /cost-centers/:id
func (h *ExpenseHandler) UpdateCostCenter(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}
	var req costCenterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeBindError(c, err)
		return
	}
	row, err := h.service.UpdateCostCenter(c.Request.Context(), uint(id), req.input())
	if err != nil {
		h.writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toCostCenterDTO(*row))
}

// DeleteCostCenter handles DELETE /cost-centers/:id
func (h *ExpenseHandler) DeleteCostCenter(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}
	if err := h.service.DeleteCostCenter(c.Request.Context(), uint(id)); err != nil {
		h.writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

type expenseRequest struct {
	CostCenterID  uint   `json:"cost_center_id" binding:"required"`
	AmountCents   int64  `json:"amount_cents" binding:"required"`
	PaidAtStr     string `json:"paid_at"`
	Description   string `json:"description" binding:"max=500"`
	BankAccountID *uint  `json:"bank_account_id"`
}

func (h *ExpenseHandler) expenseInput(c *gin.Context) (services.ExpenseInput, bool) {
	var req expenseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeBindError(c, err)
		return services.ExpenseInput{}, false
	}
	paidAt := time.Now()
	if strings.TrimSpace(req.PaidAtStr) != "" {
		t, err := parseOptionalDate(req.PaidAtStr)
		if err != nil || t == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "تاریخ پرداخت نامعتبر است"})
			return services.ExpenseInput{}, false
		}
		paidAt = time.Date(t.Year(), t.Month(), t.Day(), 12, 0, 0, 0, time.Local)
	}
	in := services.ExpenseInput{
		CostCenterID:  req.CostCenterID,
		AmountCents:   req.AmountCents,
		PaidAt:        paidAt,
		Description:   req.Description,
		BankAccountID: req.BankAccountID,
	}
	if v, ok := c.Get(middleware.ContextUserIDKey); ok {
		if id, ok := v.(uint); ok && id > 0 {
			in.CreatedByID = &id
		}
	}
	return in, true
}

// CreateExpense handles POST /expenses
func (h *ExpenseHandler) CreateExpense(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}
	in, ok := h.expenseInput(c)
	if !ok {
		return
	}
	row, err := h.service.CreateExpense(c.Request.Context(), in)
	if err != nil {
		h.writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": row.ID})
}

// UpdateExpense handles PUT /expenses/:id
func (h *ExpenseHandler) UpdateExpense(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}
	in, ok := h.expenseInput(c)
	if !ok {
		return
	}
	if _, err := h.service.UpdateExpense(c.Request.Context(), uint(id), in); err != nil {
		h.writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

// DeleteExpense handles DELETE /expenses/:id
func (h *ExpenseHandler) DeleteExpense(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}
	if err := h.service.DeleteExpense(c.Request.Context(), uint(id)); err != nil {
		h.writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
