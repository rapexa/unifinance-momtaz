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

// PayrollHandler exposes payroll-related endpoints.
type PayrollHandler struct {
	service *services.PayrollService
}

func NewPayrollHandler(service *services.PayrollService) *PayrollHandler {
	return &PayrollHandler{service: service}
}

// PayrollSummaryDTO mirrors services.PayrollSummary for Swagger docs.
type PayrollSummaryDTO struct {
	PeriodYear         int   `json:"period_year"`
	PeriodMonth        int   `json:"period_month"`
	TotalBaseCents     int64 `json:"total_base_cents"`
	TotalVariableCents int64 `json:"total_variable_cents"`
	TotalPaidCents     int64 `json:"total_paid_cents"`
	TotalPendingCents  int64 `json:"total_pending_cents"`
	// Cash paid to staff in this month (payouts).
	TotalPaidOutCents int64 `json:"total_paid_out_cents"`
	// Σ positive month-end balances (organization still owes staff).
	TotalOutstandingCents int64 `json:"total_outstanding_cents"`
	// Σ negative month-end balances (staff overpaid, owe the organization).
	TotalCreditCents int64 `json:"total_credit_cents"`
}

// PayrollEntryDTO is the public representation of a payroll entry row.
type PayrollEntryDTO struct {
	ID                  uint       `json:"id"`
	UserID              uint       `json:"user_id"`
	UserFirstName       string     `json:"user_first_name"`
	UserLastName        string     `json:"user_last_name"`
	UserRole            string     `json:"user_role"`
	PeriodYear          int        `json:"period_year"`
	PeriodMonth         int        `json:"period_month"`
	BaseSalaryCents     int64      `json:"base_salary_cents"`
	VariableSalaryCents int64      `json:"variable_salary_cents"`
	TotalSalaryCents    int64      `json:"total_salary_cents"`
	StudentsCount       int        `json:"students_count"`
	StudentsCountScope  string     `json:"students_count_scope"`
	Status              string     `json:"status"`
	PaidAt              *time.Time `json:"paid_at,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	ManualOverride      bool       `json:"manual_override"`

	// Running settlement balance (positive = organization owes staff, negative = staff owes).
	OpeningCents     int64 `json:"opening_cents"`      // مانده از ماه قبل
	PaidOutCents     int64 `json:"paid_out_cents"`     // پرداختی این ماه
	MonthBalanceCents int64 `json:"month_balance_cents"` // مانده ماه = حقوق این ماه − پرداختی این ماه
	ClosingCents     int64 `json:"closing_cents"`      // مانده کل در پایان ماه
	BalanceCents     int64 `json:"balance_cents"`      // مانده کل امروز
}

// PayrollSchemeDTO represents the salary scheme per role (from Role model).
type PayrollSchemeDTO struct {
	ID               uint   `json:"id"`
	RoleID           uint   `json:"role_id"`
	RoleCode         string `json:"role_code"`
	RoleName         string `json:"role_name"`
	CompensationKind string `json:"compensation_kind"`
	FixedCents       *int64 `json:"fixed_cents,omitempty"`
	IsActive         bool   `json:"is_active"`
}

func toPayrollEntryDTO(e *models.PayrollEntry) PayrollEntryDTO {
	dto := PayrollEntryDTO{
		ID:                  e.ID,
		UserID:              e.UserID,
		PeriodYear:          e.PeriodYear,
		PeriodMonth:         e.PeriodMonth,
		BaseSalaryCents:     e.BaseSalaryCents,
		VariableSalaryCents: e.VariableSalaryCents,
		TotalSalaryCents:    e.TotalSalaryCents,
		StudentsCount:       e.StudentsCount,
		StudentsCountScope:  string(models.StudentsCountScopeAssigned),
		Status:              string(e.Status),
		PaidAt:              e.PaidAt,
		CreatedAt:           e.CreatedAt,
		ManualOverride:      e.ManualOverride,
	}
	if e.User.ID != 0 {
		dto.UserFirstName = e.User.FirstName
		dto.UserLastName = e.User.LastName
		if e.User.Role != nil {
			dto.UserRole = e.User.Role.Code
			if e.User.Role.HasOrgStudentsCountView() {
				dto.StudentsCountScope = string(models.StudentsCountScopeOrgTotal)
			}
		}
	}
	return dto
}

func applyStudentCountResults(dtos []PayrollEntryDTO, counts map[uint]services.StudentCountResult) {
	for i := range dtos {
		if sc, ok := counts[dtos[i].UserID]; ok {
			dtos[i].StudentsCount = sc.Count
			dtos[i].StudentsCountScope = string(sc.Scope)
		}
	}
}

func (h *PayrollHandler) enrichPayrollEntryDTO(c *gin.Context, dto PayrollEntryDTO) PayrollEntryDTO {
	if counts, err := h.service.ResolveStudentsCountsByUserIDs(c.Request.Context(), []uint{dto.UserID}); err == nil {
		if sc, ok := counts[dto.UserID]; ok {
			dto.StudentsCount = sc.Count
			dto.StudentsCountScope = string(sc.Scope)
		}
	}
	dtos := []PayrollEntryDTO{dto}
	h.applyBalances(c, dtos)
	return dtos[0]
}

// applyBalances fills running settlement columns for entries of one period.
func (h *PayrollHandler) applyBalances(c *gin.Context, dtos []PayrollEntryDTO) {
	if len(dtos) == 0 {
		return
	}
	ids := make([]uint, 0, len(dtos))
	seen := map[uint]struct{}{}
	for _, d := range dtos {
		if _, ok := seen[d.UserID]; !ok {
			seen[d.UserID] = struct{}{}
			ids = append(ids, d.UserID)
		}
	}
	balances, err := h.service.StaffBalancesForPeriod(c.Request.Context(), ids, dtos[0].PeriodYear, dtos[0].PeriodMonth)
	if err != nil {
		return
	}
	for i := range dtos {
		b, ok := balances[dtos[i].UserID]
		if !ok || dtos[i].PeriodYear != dtos[0].PeriodYear || dtos[i].PeriodMonth != dtos[0].PeriodMonth {
			continue
		}
		dtos[i].OpeningCents = b.OpeningCents
		dtos[i].PaidOutCents = b.PaidCents
		dtos[i].MonthBalanceCents = b.AccruedCents - b.PaidCents
		dtos[i].ClosingCents = b.ClosingCents
		dtos[i].BalanceCents = b.BalanceCents
	}
}

func toPayrollEntryDTOSlice(entries []models.PayrollEntry) []PayrollEntryDTO {
	out := make([]PayrollEntryDTO, len(entries))
	for i, e := range entries {
		out[i] = toPayrollEntryDTO(&e)
	}
	return out
}

func toPayrollSchemeDTOSlice(roles []models.Role) []PayrollSchemeDTO {
	out := make([]PayrollSchemeDTO, 0, len(roles))
	for _, r := range roles {
		dto := PayrollSchemeDTO{
			ID:               r.ID,
			RoleID:           r.ID,
			RoleCode:         r.Code,
			RoleName:         r.Name,
			CompensationKind: string(r.CompensationKind),
			FixedCents:       r.FixedCents,
			IsActive:         true,
		}
		out = append(out, dto)
	}
	return out
}

// GetSummary handles GET /payroll/summary
// @Summary      Payroll monthly summary
// @Description  Aggregated payroll metrics (base, variable, paid, pending) for a given period (admin only)
// @Tags         payroll
// @Security     BearerAuth
// @Produce      json
// @Param        year   query     int  false "Period year (default: current year)"
// @Param        month  query     int  false "Period month (1-12, default: current month)"
// @Success      200    {object}  PayrollSummaryDTO
// @Failure      400    {object}  map[string]string
// @Failure      401    {object}  map[string]string
// @Failure      403    {object}  map[string]string
// @Failure      500    {object}  map[string]string
// @Router       /payroll/summary [get]
func (h *PayrollHandler) GetSummary(c *gin.Context) {
	now := time.Now()
	defaultYear, defaultMonth := services.DefaultPeriod(now)

	year := parseIntWithDefault(c.Query("year"), defaultYear)
	month := parseIntWithDefault(c.Query("month"), defaultMonth)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ماه نامعتبر است؛ باید بین ۱ تا ۱۲ باشد"})
		return
	}

	scope := middleware.DataScopeUserID(c)
	if scope != nil {
		_ = h.service.EnsureEntryForUserPeriod(c.Request.Context(), *scope, year, month)
	} else {
		_ = h.service.EnsureEntriesForPeriod(c.Request.Context(), year, month)
	}

	summary, err := h.service.GetMonthlySummary(c.Request.Context(), year, month, scope)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بارگذاری خلاصه حقوق"})
		return
	}

	dto := PayrollSummaryDTO{
		PeriodYear:         summary.PeriodYear,
		PeriodMonth:        summary.PeriodMonth,
		TotalBaseCents:     summary.TotalBaseCents,
		TotalVariableCents: summary.TotalVariableCents,
		TotalPaidCents:     summary.TotalPaidCents,
		TotalPendingCents:  summary.TotalPendingCents,

		TotalPaidOutCents:     summary.TotalPaidOutCents,
		TotalOutstandingCents: summary.TotalOutstandingCents,
		TotalCreditCents:      summary.TotalCreditCents,
	}
	c.JSON(http.StatusOK, dto)
}

// RecalculatePeriod handles POST /payroll/recalculate-period
// Ensures payslip rows exist for the month, then recomputes every PENDING entry from rules + payments.
// NET_REVENUE (مدیرکل) entries are recalculated last after payment shares are applied to other roles.
func (h *PayrollHandler) RecalculatePeriod(c *gin.Context) {
	if middleware.DataScopeUserID(c) != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "بازمحاسبه کلی فقط برای مدیر کل مجاز است"})
		return
	}
	now := time.Now()
	dy, dm := services.DefaultPeriod(now)
	year := parseIntWithDefault(c.Query("year"), dy)
	month := parseIntWithDefault(c.Query("month"), dm)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ماه نامعتبر است؛ باید بین ۱ تا ۱۲ باشد"})
		return
	}
	if err := h.service.EnsureEntriesForPeriod(c.Request.Context(), year, month); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در آماده‌سازی فیش‌های حقوقی"})
		return
	}
	if err := h.service.RecalculateEntriesForPeriod(c.Request.Context(), year, month); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بازمحاسبه حقوق"})
		return
	}
	// Bring every month of every active staff ledger up to date (late payments, missing months).
	if err := h.service.SyncAllStaffLedgers(c.Request.Context(), year, month); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بازمحاسبه مانده حساب کارکنان"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "year": year, "month": month})
}

// PreviewCompensation handles GET /payroll/preview
// @Summary      Preview payroll from role rules
// @Description  Computes base/variable/students for a user and period without saving
// @Tags         payroll
// @Security     BearerAuth
// @Produce      json
// @Param        user_id  query     int  true  "User ID"
// @Param        year     query     int  false "Period year (default: current)"
// @Param        month    query     int  false "Period month 1-12 (default: current)"
// @Success      200      {object}  map[string]interface{}
// @Router       /payroll/preview [get]
func (h *PayrollHandler) PreviewCompensation(c *gin.Context) {
	userIDStr := c.Query("user_id")
	if userIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه کاربر الزامی است"})
		return
	}
	uid64, err := strconv.ParseUint(userIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه کاربر نامعتبر است"})
		return
	}
	now := time.Now()
	dy, dm := services.DefaultPeriod(now)
	year := parseIntWithDefault(c.Query("year"), dy)
	month := parseIntWithDefault(c.Query("month"), dm)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ماه نامعتبر است؛ باید بین ۱ تا ۱۲ باشد"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil && uint(uid64) != *scope {
		c.JSON(http.StatusForbidden, gin.H{"error": "دسترسی مجاز نیست"})
		return
	}

	br, err := h.service.ComputeCompensationForUser(c.Request.Context(), uint(uid64), year, month)
	if err != nil {
		switch err {
		case services.ErrPayrollUserNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "کاربر یافت نشد"})
		case services.ErrPayrollNoRole:
			c.JSON(http.StatusBadRequest, gin.H{"error": "کاربر نقش ندارد"})
		case services.ErrPayrollInvalidRoleCompensation:
			c.JSON(http.StatusBadRequest, gin.H{"error": "تنظیمات حقوق نقش ناقص است"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در محاسبه حقوق"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"base_salary_cents":     br.BaseSalaryCents,
		"variable_salary_cents": br.VariableSalaryCents,
		"students_count":        br.StudentsCount,
		"students_count_scope":  string(br.StudentsCountScope),
		"compensation_kind":     string(br.CompensationKind),
		"period_year":           year,
		"period_month":          month,
	})
}

// ListEntries handles GET /payroll/entries
// @Summary      List payroll entries
// @Description  Paginated list of payroll entries for a period (admin only)
// @Tags         payroll
// @Security     BearerAuth
// @Produce      json
// @Param        year        query     int     false "Period year (default: current year)"
// @Param        month       query     int     false "Period month (1-12, default: current month)"
// @Param        page        query     int     false "Page number (1-based)" default(1)
// @Param        page_size   query     int     false "Page size" default(20)
// @Param        status      query     string  false "Status filter (PAID or PENDING)"
// @Param        user_id     query     int     false "Filter by user ID"
// @Success      200         {object}  map[string]interface{}
// @Failure      400         {object}  map[string]string
// @Failure      401         {object}  map[string]string
// @Failure      403         {object}  map[string]string
// @Failure      500         {object}  map[string]string
// @Router       /payroll/entries [get]
func (h *PayrollHandler) ListEntries(c *gin.Context) {
	now := time.Now()
	defaultYear, defaultMonth := services.DefaultPeriod(now)

	year := parseIntWithDefault(c.Query("year"), defaultYear)
	month := parseIntWithDefault(c.Query("month"), defaultMonth)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ماه نامعتبر است؛ باید بین ۱ تا ۱۲ باشد"})
		return
	}

	scope := middleware.DataScopeUserID(c)
	if scope != nil {
		_ = h.service.EnsureEntryForUserPeriod(c.Request.Context(), *scope, year, month)
	} else {
		_ = h.service.EnsureEntriesForPeriod(c.Request.Context(), year, month)
	}

	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "20")
	status := c.DefaultQuery("status", "")
	userIDStr := c.DefaultQuery("user_id", "")

	page, err := strconv.Atoi(pageStr)
	if err != nil || page <= 0 {
		page = 1
	}
	pageSize, err := strconv.Atoi(pageSizeStr)
	if err != nil || pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	offset := (page - 1) * pageSize

	var userID *uint
	if scope := middleware.DataScopeUserID(c); scope != nil {
		userID = scope
	} else if userIDStr != "" {
		id64, err := strconv.ParseUint(userIDStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه کاربر نامعتبر است"})
			return
		}
		id := uint(id64)
		userID = &id
	}

	entries, total, err := h.service.ListEntries(c.Request.Context(), year, month, pageSize, offset, status, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت لیست فیش‌های حقوقی"})
		return
	}

	dtos := toPayrollEntryDTOSlice(entries)
	userIDs := make([]uint, 0, len(entries))
	seen := make(map[uint]struct{}, len(entries))
	for _, e := range entries {
		if _, ok := seen[e.UserID]; ok {
			continue
		}
		seen[e.UserID] = struct{}{}
		userIDs = append(userIDs, e.UserID)
	}
	if counts, err := h.service.ResolveStudentsCountsByUserIDs(c.Request.Context(), userIDs); err == nil {
		applyStudentCountResults(dtos, counts)
	}
	h.applyBalances(c, dtos)
	totalPages := int((total + int64(pageSize) - 1) / int64(pageSize))

	c.JSON(http.StatusOK, gin.H{
		"data": dtos,
		"meta": gin.H{
			"current_page": page,
			"page_size":    pageSize,
			"total_items":  total,
			"total_pages":  totalPages,
		},
	})
}

// GetSchemes handles GET /payroll/schemes
// @Summary      List payroll schemes
// @Description  List active salary schemes per role (admin only)
// @Tags         payroll
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}   PayrollSchemeDTO
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /payroll/schemes [get]
func (h *PayrollHandler) GetSchemes(c *gin.Context) {
	schemes, err := h.service.GetSchemes(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بارگذاری طرح‌های حقوق"})
		return
	}
	c.JSON(http.StatusOK, toPayrollSchemeDTOSlice(schemes))
}

// parseIntWithDefault parses an int or falls back to default on error/empty.
func parseIntWithDefault(raw string, def int) int {
	if raw == "" {
		return def
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return def
	}
	return v
}

// createPayrollEntryRequest is the body for POST /payroll/entries.
type createPayrollEntryRequest struct {
	UserID              uint   `json:"user_id" binding:"required"`
	PeriodYear          int    `json:"period_year" binding:"required"`
	PeriodMonth         int    `json:"period_month" binding:"required,min=1,max=12"`
	ApplyRoleRules      bool   `json:"apply_role_rules"`
	BaseSalaryCents     *int64 `json:"base_salary_cents"`
	VariableSalaryCents *int64 `json:"variable_salary_cents"`
	StudentsCount       *int   `json:"students_count"`
	Status              string `json:"status" binding:"required,oneof=PAID PENDING"`
}

// CreateEntry handles POST /payroll/entries
// @Summary      Create payroll entry
// @Description  Register a new payslip for an employee (admin only)
// @Tags         payroll
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  createPayrollEntryRequest  true  "Entry data"
// @Success      201   {object}  PayrollEntryDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /payroll/entries [post]
func (h *PayrollHandler) CreateEntry(c *gin.Context) {
	var req createPayrollEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "درخواست نامعتبر است"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil && req.UserID != *scope {
		c.JSON(http.StatusForbidden, gin.H{"error": "دسترسی مجاز نیست"})
		return
	}

	status := models.PayrollStatus(req.Status)
	params := services.CreateEntryParams{
		UserID:         req.UserID,
		PeriodYear:     req.PeriodYear,
		PeriodMonth:    req.PeriodMonth,
		ApplyRoleRules: req.ApplyRoleRules,
		Status:         status,
	}

	if req.ApplyRoleRules {
		// Base / variable / students_count filled in service from Role + payments.
	} else {
		if req.BaseSalaryCents == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "وقتی قوانین نقش اعمال نمی‌شود، مبلغ پایه حقوق الزامی است"})
			return
		}
		params.BaseSalaryCents = *req.BaseSalaryCents
		params.ManualOverride = true
		if req.VariableSalaryCents != nil {
			params.VariableSalaryCents = *req.VariableSalaryCents
		}
		if req.StudentsCount != nil {
			params.StudentsCount = *req.StudentsCount
			params.StudentsCountSet = true
		}
	}

	entry, err := h.service.CreateEntry(c.Request.Context(), params)
	if err != nil {
		switch err {
		case services.ErrPayrollUserNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "کاربر یافت نشد"})
		case services.ErrPayrollNoRole:
			c.JSON(http.StatusBadRequest, gin.H{"error": "کاربر نقش ندارد"})
		case services.ErrPayrollInvalidRoleCompensation:
			c.JSON(http.StatusBadRequest, gin.H{"error": "تنظیمات حقوق نقش ناقص است؛ نقش را اصلاح کنید"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در ایجاد فیش حقوقی"})
		}
		return
	}

	c.JSON(http.StatusCreated, h.enrichPayrollEntryDTO(c, toPayrollEntryDTO(entry)))
}

// GetEntry handles GET /payroll/entries/:id
// @Summary      Get payroll entry
// @Description  Get a single payslip by ID (admin only)
// @Tags         payroll
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      int  true  "Entry ID"
// @Success      200  {object}  PayrollEntryDTO
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /payroll/entries/{id} [get]
func (h *PayrollHandler) GetEntry(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	entry, err := h.service.GetEntryByID(c.Request.Context(), uint(id))
	if err != nil {
		if err == services.ErrPayrollEntryNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "فیش حقوقی یافت نشد"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت فیش حقوقی"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil && entry.UserID != *scope {
		c.JSON(http.StatusNotFound, gin.H{"error": "فیش حقوقی یافت نشد"})
		return
	}

	dto := h.enrichPayrollEntryDTO(c, toPayrollEntryDTO(entry))
	c.JSON(http.StatusOK, dto)
}

// updatePayrollEntryRequest is the body for PUT /payroll/entries/:id.
type updatePayrollEntryRequest struct {
	RecalculateFromRoleRules bool    `json:"recalculate_from_role_rules"`
	BaseSalaryCents          *int64  `json:"base_salary_cents" binding:"omitempty,min=0"`
	VariableSalaryCents      *int64  `json:"variable_salary_cents" binding:"omitempty,min=0"`
	StudentsCount            *int    `json:"students_count" binding:"omitempty,min=0"`
	Status                   *string `json:"status" binding:"omitempty,oneof=PAID PENDING"`
	PaidAtStr                *string `json:"paid_at" binding:"omitempty"`
}

// UpdateEntry handles PUT /payroll/entries/:id
// @Summary      Update payroll entry
// @Description  Update an existing payslip (admin only)
// @Tags         payroll
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path      int  true "Entry ID"
// @Param        body  body      updatePayrollEntryRequest true "Fields to update"
// @Success      200   {object}  PayrollEntryDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      404   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /payroll/entries/{id} [put]
func (h *PayrollHandler) UpdateEntry(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	var req updatePayrollEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "درخواست نامعتبر است"})
		return
	}

	existing, err := h.service.GetEntryByID(c.Request.Context(), uint(id))
	if err != nil {
		if err == services.ErrPayrollEntryNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "فیش حقوقی یافت نشد"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت فیش حقوقی"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil && existing.UserID != *scope {
		c.JSON(http.StatusNotFound, gin.H{"error": "فیش حقوقی یافت نشد"})
		return
	}

	params := services.UpdateEntryParams{
		RecalculateFromRoleRules: req.RecalculateFromRoleRules,
	}
	if req.BaseSalaryCents != nil {
		params.BaseSalaryCents = req.BaseSalaryCents
	}
	if req.VariableSalaryCents != nil {
		params.VariableSalaryCents = req.VariableSalaryCents
	}
	if req.StudentsCount != nil {
		params.StudentsCount = req.StudentsCount
	}
	if req.Status != nil {
		st := models.PayrollStatus(*req.Status)
		params.Status = &st
	}
	if req.PaidAtStr != nil {
		t, err := parseOptionalDate(*req.PaidAtStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "تاریخ پرداخت نامعتبر است"})
			return
		}
		params.PaidAt = t
	}

	entry, err := h.service.UpdateEntry(c.Request.Context(), uint(id), params)
	if err != nil {
		if err == services.ErrPayrollEntryNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "فیش حقوقی یافت نشد"})
			return
		}
		switch err {
		case services.ErrPayrollUserNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "کاربر یافت نشد"})
		case services.ErrPayrollNoRole:
			c.JSON(http.StatusBadRequest, gin.H{"error": "کاربر نقش ندارد"})
		case services.ErrPayrollInvalidRoleCompensation:
			c.JSON(http.StatusBadRequest, gin.H{"error": "تنظیمات حقوق نقش ناقص است"})
		case services.ErrPayrollEntryPaidLocked:
			c.JSON(http.StatusConflict, gin.H{"error": "فیش پرداخت‌شده قفل است؛ ابتدا آن را به «در انتظار» برگردانید"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در به‌روزرسانی فیش حقوقی"})
		}
		return
	}

	c.JSON(http.StatusOK, h.enrichPayrollEntryDTO(c, toPayrollEntryDTO(entry)))
}

type markPaidRequest struct {
	PaidAtStr string `json:"paid_at" binding:"omitempty"` // YYYY-MM-DD؛ پیش‌فرض امروز
}

// MarkPaid handles POST /payroll/entries/:id/mark-paid
func (h *PayrollHandler) MarkPaid(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه فیش نامعتبر است"})
		return
	}
	existing, err := h.service.GetEntryByID(c.Request.Context(), uint(id))
	if err != nil {
		if err == services.ErrPayrollEntryNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "فیش حقوقی یافت نشد"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت فیش حقوقی"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil && existing.UserID != *scope {
		c.JSON(http.StatusNotFound, gin.H{"error": "فیش حقوقی یافت نشد"})
		return
	}

	var req markPaidRequest
	_ = c.ShouldBindJSON(&req)
	paidAt := time.Now()
	if strings.TrimSpace(req.PaidAtStr) != "" {
		t, err := parseOptionalDate(req.PaidAtStr)
		if err != nil || t == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "تاریخ پرداخت نامعتبر است"})
			return
		}
		paidAt = *t
	}

	entry, err := h.service.MarkPaid(c.Request.Context(), uint(id), paidAt)
	if err != nil {
		switch err {
		case services.ErrPayrollEntryNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "فیش حقوقی یافت نشد"})
		case services.ErrPayrollAlreadyPaid:
			c.JSON(http.StatusConflict, gin.H{"error": "مبلغی برای تسویه این فیش باقی نمانده است"})
		case services.ErrPayrollForbidden:
			c.JSON(http.StatusForbidden, gin.H{"error": "ثبت پرداخت فقط برای مدیر مجاز است"})
		case services.ErrPayrollEntryPaidLocked:
			c.JSON(http.StatusConflict, gin.H{"error": "فیش پرداخت‌شده قفل است"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در ثبت پرداخت فیش"})
		}
		return
	}
	c.JSON(http.StatusOK, h.enrichPayrollEntryDTO(c, toPayrollEntryDTO(entry)))
}

// MarkPending handles POST /payroll/entries/:id/mark-pending
func (h *PayrollHandler) MarkPending(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه فیش نامعتبر است"})
		return
	}
	existing, err := h.service.GetEntryByID(c.Request.Context(), uint(id))
	if err != nil {
		if err == services.ErrPayrollEntryNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "فیش حقوقی یافت نشد"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت فیش حقوقی"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil && existing.UserID != *scope {
		c.JSON(http.StatusNotFound, gin.H{"error": "فیش حقوقی یافت نشد"})
		return
	}

	entry, err := h.service.MarkPending(c.Request.Context(), uint(id))
	if err != nil {
		switch err {
		case services.ErrPayrollEntryNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "فیش حقوقی یافت نشد"})
		case services.ErrPayrollNotPaid:
			c.JSON(http.StatusBadRequest, gin.H{"error": "این فیش پرداخت‌شده نیست"})
		case services.ErrPayslipHasNoPayout:
			c.JSON(http.StatusConflict, gin.H{"error": "این فیش با پرداخت‌های ثبت‌شده در «تسویه با کارمند» تسویه شده است؛ برای برگشت، همان پرداخت را حذف کنید"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بازگرداندن فیش به حالت در انتظار"})
		}
		return
	}
	c.JSON(http.StatusOK, h.enrichPayrollEntryDTO(c, toPayrollEntryDTO(entry)))
}

type AdvisorOpsDTO struct {
	UserID               uint   `json:"user_id"`
	FirstName            string `json:"first_name"`
	LastName             string `json:"last_name"`
	RoleID               uint   `json:"role_id"`
	RoleCode             string `json:"role_code"`
	RoleName             string `json:"role_name"`
	StudentsTotal        int    `json:"students_total"`
	StudentsSchool       int    `json:"students_school"`
	StudentsPrivate      int    `json:"students_private"`
	StudentsOnline       int    `json:"students_online"`
	StudentsInPerson     int    `json:"students_in_person"`
	PaidCountThisMonth   int    `json:"paid_count_this_month"`
	UnpaidCountThisMonth int    `json:"unpaid_count_this_month"`
	ExpectedTotalCents   int64  `json:"expected_total_cents"`
	PaidTotalCents       int64  `json:"paid_total_cents"`
	RemainingCents       int64  `json:"remaining_cents"`
	SalaryTotalCents     int64  `json:"salary_total_cents"`
	SalaryStatus         string `json:"salary_status,omitempty"`
}

type AdvisorOpsStudentDTO struct {
	StudentID             uint   `json:"student_id"`
	FirstName             string `json:"first_name"`
	LastName              string `json:"last_name"`
	DeliveryMode          string `json:"delivery_mode,omitempty"`
	EnrollmentBillingMode string `json:"enrollment_billing_mode"`
	RegistrationChannel   string `json:"registration_channel"`
	SchoolName            string `json:"school_name,omitempty"`
	EnrollmentAmountCents int64  `json:"enrollment_amount_cents"`
	PaidTotalCents        int64  `json:"paid_total_cents"`
	RemainingBalanceCents int64  `json:"remaining_balance_cents"`
	HasPaidThisMonth      bool   `json:"has_paid_this_month"`
}

type AdvisorOpsSalaryDTO struct {
	ID                  uint       `json:"id"`
	PeriodYear          int        `json:"period_year"`
	PeriodMonth         int        `json:"period_month"`
	BaseSalaryCents     int64      `json:"base_salary_cents"`
	VariableSalaryCents int64      `json:"variable_salary_cents"`
	TotalSalaryCents    int64      `json:"total_salary_cents"`
	StudentsCount       int        `json:"students_count"`
	StudentsCountScope  string     `json:"students_count_scope,omitempty"`
	Status              string     `json:"status"`
	PaidAt              *time.Time `json:"paid_at,omitempty"`
}

type AdvisorOpsPaymentDTO struct {
	ID          uint       `json:"id"`
	StudentID   uint       `json:"student_id"`
	StudentName string     `json:"student_name"`
	AmountCents int64      `json:"amount_cents"`
	Status      string     `json:"status"`
	PaidAt      *time.Time `json:"paid_at,omitempty"`
	Description string     `json:"description,omitempty"`
}

type StaffPayoutDTO struct {
	ID             uint      `json:"id"`
	AmountCents    int64     `json:"amount_cents"`
	PaidAt         time.Time `json:"paid_at"`
	Note           string    `json:"note,omitempty"`
	Source         string    `json:"source,omitempty"`
	PayrollEntryID *uint     `json:"payroll_entry_id,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// StaffLedgerMonthDTO is one month of the running staff balance.
type StaffLedgerMonthDTO struct {
	PeriodYear          int        `json:"period_year"`
	PeriodMonth         int        `json:"period_month"`
	EntryID             *uint      `json:"entry_id,omitempty"`
	BaseSalaryCents     int64      `json:"base_salary_cents"`
	VariableSalaryCents int64      `json:"variable_salary_cents"`
	OpeningCents        int64      `json:"opening_cents"`
	AccruedCents        int64      `json:"accrued_cents"`
	PaidCents           int64      `json:"paid_cents"`
	MonthBalanceCents   int64      `json:"month_balance_cents"`
	ClosingCents        int64      `json:"closing_cents"`
	Settled             bool       `json:"settled"`
	SettledAt           *time.Time `json:"settled_at,omitempty"`
}

func toStaffLedgerMonthDTO(m services.StaffLedgerMonth) StaffLedgerMonthDTO {
	return StaffLedgerMonthDTO{
		PeriodYear:          m.PeriodYear,
		PeriodMonth:         m.PeriodMonth,
		EntryID:             m.EntryID,
		BaseSalaryCents:     m.BaseSalaryCents,
		VariableSalaryCents: m.VariableSalaryCents,
		OpeningCents:        m.OpeningCents,
		AccruedCents:        m.AccruedCents,
		PaidCents:           m.PaidCents,
		MonthBalanceCents:   m.AccruedCents - m.PaidCents,
		ClosingCents:        m.ClosingCents,
		Settled:             m.Settled,
		SettledAt:           m.SettledAt,
	}
}

type StaffSettlementDTO struct {
	AccruedTotalCents int64            `json:"accrued_total_cents"`
	PaidOutTotalCents int64            `json:"paid_out_total_cents"`
	BalanceCents      int64            `json:"balance_cents"`
	Payouts           []StaffPayoutDTO `json:"payouts"`
}

type createStaffPayoutRequest struct {
	AmountCents int64  `json:"amount_cents" binding:"required"`
	PaidAtStr   string `json:"paid_at" binding:"omitempty"`
	Note        string `json:"note" binding:"omitempty"`
}

type AdvisorOpsUserDetailDTO struct {
	UserID               uint                   `json:"user_id"`
	FirstName            string                 `json:"first_name"`
	LastName             string                 `json:"last_name"`
	RoleCode             string                 `json:"role_code"`
	RoleName             string                 `json:"role_name"`
	StudentsTotal        int                    `json:"students_total"`
	StudentsCountScope   string                 `json:"students_count_scope"`
	PaymentsCount        int64                  `json:"payments_count"`
	PaymentsTotalCents   int64                  `json:"payments_total_cents"`
	SalariesCount        int                    `json:"salaries_count"`
	SalariesPaidCount    int                    `json:"salaries_paid_count"`
	SalariesTotalCents   int64                  `json:"salaries_total_cents"`
	SalariesPaidCents    int64                  `json:"salaries_paid_cents"`
	ExpectedTotalCents   int64                  `json:"expected_total_cents"`
	StudentsPaidTotal    int64                  `json:"students_paid_total_cents"`
	RemainingCents       int64                  `json:"remaining_cents"`
	Students             []AdvisorOpsStudentDTO `json:"students"`
	Salaries             []AdvisorOpsSalaryDTO  `json:"salaries"`
	Payments             []AdvisorOpsPaymentDTO `json:"payments"`
}

// ListAdvisorOps handles GET /payroll/advisor-ops
func (h *PayrollHandler) ListAdvisorOps(c *gin.Context) {
	now := time.Now()
	dy, dm := services.DefaultPeriod(now)
	year := parseIntWithDefault(c.Query("year"), dy)
	month := parseIntWithDefault(c.Query("month"), dm)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ماه نامعتبر است؛ باید بین ۱ تا ۱۲ باشد"})
		return
	}
	rows, err := h.service.ListAdvisorOps(c.Request.Context(), year, month, middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بارگذاری حساب‌کتاب مشاوران"})
		return
	}
	out := make([]AdvisorOpsDTO, len(rows))
	for i, r := range rows {
		out[i] = AdvisorOpsDTO{
			UserID:               r.UserID,
			FirstName:            r.FirstName,
			LastName:             r.LastName,
			RoleID:               r.RoleID,
			RoleCode:             r.RoleCode,
			RoleName:             r.RoleName,
			StudentsTotal:        r.StudentsTotal,
			StudentsSchool:       r.StudentsSchool,
			StudentsPrivate:      r.StudentsPrivate,
			StudentsOnline:       r.StudentsOnline,
			StudentsInPerson:     r.StudentsInPerson,
			PaidCountThisMonth:   r.PaidCountThisMonth,
			UnpaidCountThisMonth: r.UnpaidCountThisMonth,
			ExpectedTotalCents:   r.ExpectedTotalCents,
			PaidTotalCents:       r.PaidTotalCents,
			RemainingCents:       r.RemainingCents,
			SalaryTotalCents:     r.SalaryTotalCents,
			SalaryStatus:         r.SalaryStatus,
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"period_year":  year,
		"period_month": month,
		"data":         out,
	})
}

// ListAdvisorOpsStudents handles GET /payroll/advisor-ops/:user_id/students
func (h *PayrollHandler) ListAdvisorOpsStudents(c *gin.Context) {
	uid, err := strconv.ParseUint(c.Param("user_id"), 10, 64)
	if err != nil || uid == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه کاربر نامعتبر است"})
		return
	}
	now := time.Now()
	dy, dm := services.DefaultPeriod(now)
	year := parseIntWithDefault(c.Query("year"), dy)
	month := parseIntWithDefault(c.Query("month"), dm)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ماه نامعتبر است؛ باید بین ۱ تا ۱۲ باشد"})
		return
	}
	rows, err := h.service.ListAdvisorOpsStudents(c.Request.Context(), uint(uid), year, month, middleware.DataScopeUserID(c))
	if err != nil {
		if err == services.ErrPayrollForbidden {
			c.JSON(http.StatusForbidden, gin.H{"error": "دسترسی مجاز نیست"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بارگذاری دانش‌آموزان"})
		return
	}
	out := make([]AdvisorOpsStudentDTO, len(rows))
	for i, r := range rows {
		out[i] = AdvisorOpsStudentDTO{
			StudentID:             r.StudentID,
			FirstName:             r.FirstName,
			LastName:              r.LastName,
			DeliveryMode:          r.DeliveryMode,
			EnrollmentBillingMode: r.EnrollmentBillingMode,
			RegistrationChannel:   r.RegistrationChannel,
			SchoolName:            r.SchoolName,
			EnrollmentAmountCents: r.EnrollmentAmountCents,
			PaidTotalCents:        r.PaidTotalCents,
			RemainingBalanceCents: r.RemainingBalanceCents,
			HasPaidThisMonth:      r.HasPaidThisMonth,
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// GetAdvisorOpsUserDetail handles GET /payroll/advisor-ops/:user_id/detail
func (h *PayrollHandler) GetAdvisorOpsUserDetail(c *gin.Context) {
	uid, err := strconv.ParseUint(c.Param("user_id"), 10, 64)
	if err != nil || uid == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه کاربر نامعتبر است"})
		return
	}
	now := time.Now()
	dy, dm := services.DefaultPeriod(now)
	year := parseIntWithDefault(c.Query("year"), dy)
	month := parseIntWithDefault(c.Query("month"), dm)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ماه نامعتبر است؛ باید بین ۱ تا ۱۲ باشد"})
		return
	}
	detail, err := h.service.GetAdvisorOpsUserDetail(c.Request.Context(), uint(uid), year, month, middleware.DataScopeUserID(c))
	if err != nil {
		if err == services.ErrPayrollForbidden {
			c.JSON(http.StatusForbidden, gin.H{"error": "دسترسی مجاز نیست"})
			return
		}
		if err == services.ErrPayrollUserNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "کاربر یافت نشد"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بارگذاری جزئیات کاربر"})
		return
	}
	students := make([]AdvisorOpsStudentDTO, len(detail.Students))
	for i, r := range detail.Students {
		students[i] = AdvisorOpsStudentDTO{
			StudentID:             r.StudentID,
			FirstName:             r.FirstName,
			LastName:              r.LastName,
			DeliveryMode:          r.DeliveryMode,
			EnrollmentBillingMode: r.EnrollmentBillingMode,
			RegistrationChannel:   r.RegistrationChannel,
			SchoolName:            r.SchoolName,
			EnrollmentAmountCents: r.EnrollmentAmountCents,
			PaidTotalCents:        r.PaidTotalCents,
			RemainingBalanceCents: r.RemainingBalanceCents,
			HasPaidThisMonth:      r.HasPaidThisMonth,
		}
	}
	salaries := make([]AdvisorOpsSalaryDTO, len(detail.Salaries))
	scopeStr := string(models.StudentsCountScopeAssigned)
	kpiCount := detail.StudentsTotal
	if sc, err := h.service.ResolveStudentsCountForUser(c.Request.Context(), uint(uid)); err == nil {
		scopeStr = string(sc.Scope)
		if sc.Scope == models.StudentsCountScopeOrgTotal {
			kpiCount = sc.Count
		}
	}
	for i, r := range detail.Salaries {
		salaries[i] = AdvisorOpsSalaryDTO{
			ID:                  r.ID,
			PeriodYear:          r.PeriodYear,
			PeriodMonth:         r.PeriodMonth,
			BaseSalaryCents:     r.BaseSalaryCents,
			VariableSalaryCents: r.VariableSalaryCents,
			TotalSalaryCents:    r.TotalSalaryCents,
			StudentsCount:       r.StudentsCount,
			StudentsCountScope:  scopeStr,
			Status:              r.Status,
			PaidAt:              r.PaidAt,
		}
	}
	payments := make([]AdvisorOpsPaymentDTO, len(detail.Payments))
	for i, r := range detail.Payments {
		payments[i] = AdvisorOpsPaymentDTO{
			ID:          r.ID,
			StudentID:   r.StudentID,
			StudentName: r.StudentName,
			AmountCents: r.AmountCents,
			Status:      r.Status,
			PaidAt:      r.PaidAt,
			Description: r.Description,
		}
	}
	c.JSON(http.StatusOK, AdvisorOpsUserDetailDTO{
		UserID:             detail.UserID,
		FirstName:          detail.FirstName,
		LastName:           detail.LastName,
		RoleCode:           detail.RoleCode,
		RoleName:           detail.RoleName,
		StudentsTotal:      kpiCount,
		StudentsCountScope: scopeStr,
		PaymentsCount:      detail.PaymentsCount,
		PaymentsTotalCents: detail.PaymentsTotalCents,
		SalariesCount:      detail.SalariesCount,
		SalariesPaidCount:  detail.SalariesPaidCount,
		SalariesTotalCents: detail.SalariesTotalCents,
		SalariesPaidCents:  detail.SalariesPaidCents,
		ExpectedTotalCents: detail.ExpectedTotalCents,
		StudentsPaidTotal:  detail.StudentsPaidTotal,
		RemainingCents:     detail.RemainingCents,
		Students:           students,
		Salaries:           salaries,
		Payments:           payments,
	})
}

type paymentShareLineDTO struct {
	ShareID               uint       `json:"share_id"`
	PaymentID             uint       `json:"payment_id"`
	StudentID             uint       `json:"student_id"`
	StudentName           string     `json:"student_name"`
	EnrollmentBillingMode string     `json:"enrollment_billing_mode"`
	Kind                  string     `json:"kind"`
	ShareCents            int64      `json:"share_cents"`
	BasisAmountCents      int64      `json:"basis_amount_cents"`
	PaymentAmountCents    int64      `json:"payment_amount_cents"`
	PaidAt                *time.Time `json:"paid_at,omitempty"`
}

type accrualShareLineDTO struct {
	StudentID               uint   `json:"student_id"`
	StudentName             string `json:"student_name"`
	EnrollmentBillingMode   string `json:"enrollment_billing_mode"`
	EnrollmentAmountCents   int64  `json:"enrollment_amount_cents"`
	ContractShareTotalCents int64  `json:"contract_share_total_cents"`
	ShareCents              int64  `json:"share_cents"`
	AccrualMonthIndex       int    `json:"accrual_month_index"`
	AccrualMonthsTotal      int    `json:"accrual_months_total"`
	RemainingMonths         int    `json:"remaining_months"`
	Label                   string `json:"label"`
}

type compensationBreakdownDTO struct {
	UserID              uint                   `json:"user_id"`
	PeriodYear          int                    `json:"period_year"`
	PeriodMonth         int                    `json:"period_month"`
	BaseSalaryCents     int64                  `json:"base_salary_cents"`
	VariableSalaryCents int64                  `json:"variable_salary_cents"`
	TotalSalaryCents    int64                  `json:"total_salary_cents"`
	PaymentSharesCents  int64                  `json:"payment_shares_cents"`
	AccrualSharesCents  int64                  `json:"accrual_shares_cents"`
	StudentsCount       int                    `json:"students_count"`
	StudentsCountScope  string                 `json:"students_count_scope"`
	CompensationKind    string                 `json:"compensation_kind"`
	PaymentShareLines   []paymentShareLineDTO  `json:"payment_share_lines"`
	AccrualShareLines   []accrualShareLineDTO  `json:"accrual_share_lines"`
	EntryID             *uint                  `json:"entry_id,omitempty"`
	EntryStatus         string                 `json:"entry_status,omitempty"`
	EntryLocked         bool                   `json:"entry_locked"`
}

func toCompensationBreakdownDTO(d services.CompensationBreakdownDetail) compensationBreakdownDTO {
	pay := make([]paymentShareLineDTO, len(d.PaymentShareLines))
	for i, r := range d.PaymentShareLines {
		pay[i] = paymentShareLineDTO{
			ShareID:               r.ShareID,
			PaymentID:             r.PaymentID,
			StudentID:             r.StudentID,
			StudentName:           r.StudentName,
			EnrollmentBillingMode: r.EnrollmentBillingMode,
			Kind:                  r.Kind,
			ShareCents:            r.ShareCents,
			BasisAmountCents:      r.BasisAmountCents,
			PaymentAmountCents:    r.PaymentAmountCents,
			PaidAt:                r.PaidAt,
		}
	}
	acc := make([]accrualShareLineDTO, len(d.AccrualShareLines))
	for i, r := range d.AccrualShareLines {
		acc[i] = accrualShareLineDTO{
			StudentID:               r.StudentID,
			StudentName:             r.StudentName,
			EnrollmentBillingMode:   r.EnrollmentBillingMode,
			EnrollmentAmountCents:   r.EnrollmentAmountCents,
			ContractShareTotalCents: r.ContractShareTotalCents,
			ShareCents:              r.ShareCents,
			AccrualMonthIndex:       r.AccrualMonthIndex,
			AccrualMonthsTotal:      r.AccrualMonthsTotal,
			RemainingMonths:         r.RemainingMonths,
			Label:                   r.Label,
		}
	}
	return compensationBreakdownDTO{
		UserID:              d.UserID,
		PeriodYear:          d.PeriodYear,
		PeriodMonth:         d.PeriodMonth,
		BaseSalaryCents:     d.BaseSalaryCents,
		VariableSalaryCents: d.VariableSalaryCents,
		TotalSalaryCents:    d.TotalSalaryCents,
		PaymentSharesCents:  d.PaymentSharesCents,
		AccrualSharesCents:  d.AccrualSharesCents,
		StudentsCount:       d.StudentsCount,
		StudentsCountScope:  string(d.StudentsCountScope),
		CompensationKind:    string(d.CompensationKind),
		PaymentShareLines:   pay,
		AccrualShareLines:   acc,
		EntryID:             d.EntryID,
		EntryStatus:         d.EntryStatus,
		EntryLocked:         d.EntryLocked,
	}
}

func (h *PayrollHandler) writePayrollComputeError(c *gin.Context, err error) bool {
	switch err {
	case services.ErrPayrollUserNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "کاربر یافت نشد"})
	case services.ErrPayrollNoRole:
		c.JSON(http.StatusBadRequest, gin.H{"error": "کاربر نقش ندارد"})
	case services.ErrPayrollInvalidRoleCompensation:
		c.JSON(http.StatusBadRequest, gin.H{"error": "تنظیمات حقوق نقش ناقص است؛ نقش را اصلاح کنید"})
	case services.ErrPayrollInvalidPeriod:
		c.JSON(http.StatusBadRequest, gin.H{"error": "دوره حقوقی نامعتبر است"})
	case services.ErrPayrollEntryPaidLocked:
		c.JSON(http.StatusConflict, gin.H{"error": "فیش پرداخت‌شده قفل است و قابل بازمحاسبه نیست"})
	case services.ErrPayrollForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "دسترسی مجاز نیست"})
	case services.ErrStaffPayoutInvalidAmount:
		c.JSON(http.StatusBadRequest, gin.H{"error": "مبلغ پرداخت باید بزرگ‌تر از صفر باشد"})
	case services.ErrStaffPayoutInvalidPaidAt:
		c.JSON(http.StatusBadRequest, gin.H{"error": "تاریخ پرداخت نامعتبر است"})
	case services.ErrStaffPayoutNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "پرداخت یافت نشد"})
	default:
		return false
	}
	return true
}

// GetUserBreakdown handles GET /payroll/users/:user_id/breakdown
func (h *PayrollHandler) GetUserBreakdown(c *gin.Context) {
	uid, err := strconv.ParseUint(c.Param("user_id"), 10, 64)
	if err != nil || uid == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه کاربر نامعتبر است"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil && uint(uid) != *scope {
		c.JSON(http.StatusForbidden, gin.H{"error": "دسترسی مجاز نیست"})
		return
	}
	now := time.Now()
	dy, dm := services.DefaultPeriod(now)
	year := parseIntWithDefault(c.Query("year"), dy)
	month := parseIntWithDefault(c.Query("month"), dm)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ماه نامعتبر است؛ باید بین ۱ تا ۱۲ باشد"})
		return
	}
	detail, err := h.service.GetCompensationBreakdownDetail(c.Request.Context(), uint(uid), year, month)
	if err != nil {
		if h.writePayrollComputeError(c, err) {
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت شکست محاسبه حقوق"})
		return
	}
	c.JSON(http.StatusOK, toCompensationBreakdownDTO(detail))
}

// RecalculateUser handles POST /payroll/users/:user_id/recalculate
func (h *PayrollHandler) RecalculateUser(c *gin.Context) {
	uid, err := strconv.ParseUint(c.Param("user_id"), 10, 64)
	if err != nil || uid == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه کاربر نامعتبر است"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil && uint(uid) != *scope {
		c.JSON(http.StatusForbidden, gin.H{"error": "دسترسی مجاز نیست"})
		return
	}
	now := time.Now()
	dy, dm := services.DefaultPeriod(now)
	year := parseIntWithDefault(c.Query("year"), dy)
	month := parseIntWithDefault(c.Query("month"), dm)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ماه نامعتبر است؛ باید بین ۱ تا ۱۲ باشد"})
		return
	}
	entry, detail, err := h.service.RecalculateUserPeriod(c.Request.Context(), uint(uid), year, month)
	if err != nil {
		if err == services.ErrPayrollEntryPaidLocked {
			c.JSON(http.StatusConflict, gin.H{
				"error":     "فیش پرداخت‌شده قفل است و قابل بازمحاسبه نیست",
				"breakdown": toCompensationBreakdownDTO(detail),
			})
			return
		}
		if h.writePayrollComputeError(c, err) {
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در محاسبه فیش حقوقی"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"entry":     h.enrichPayrollEntryDTO(c, toPayrollEntryDTO(entry)),
		"breakdown": toCompensationBreakdownDTO(detail),
	})
}

// GetUserLedger handles GET /payroll/users/:user_id/ledger
func (h *PayrollHandler) GetUserLedger(c *gin.Context) {
	uid, err := strconv.ParseUint(c.Param("user_id"), 10, 64)
	if err != nil || uid == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه کاربر نامعتبر است"})
		return
	}
	now := time.Now()
	dy, dm := services.DefaultPeriod(now)
	year := parseIntWithDefault(c.Query("year"), dy)
	month := parseIntWithDefault(c.Query("month"), dm)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ماه نامعتبر است؛ باید بین ۱ تا ۱۲ باشد"})
		return
	}
	detail, err := h.service.GetUserLedger(c.Request.Context(), uint(uid), year, month, middleware.DataScopeUserID(c))
	if err != nil {
		if h.writePayrollComputeError(c, err) {
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بارگذاری جزئیات حساب‌کتاب"})
		return
	}

	students := make([]AdvisorOpsStudentDTO, len(detail.Students))
	for i, r := range detail.Students {
		students[i] = AdvisorOpsStudentDTO{
			StudentID:             r.StudentID,
			FirstName:             r.FirstName,
			LastName:              r.LastName,
			DeliveryMode:          r.DeliveryMode,
			EnrollmentBillingMode: r.EnrollmentBillingMode,
			RegistrationChannel:   r.RegistrationChannel,
			SchoolName:            r.SchoolName,
			EnrollmentAmountCents: r.EnrollmentAmountCents,
			PaidTotalCents:        r.PaidTotalCents,
			RemainingBalanceCents: r.RemainingBalanceCents,
			HasPaidThisMonth:      r.HasPaidThisMonth,
		}
	}
	scopeStr := string(detail.StudentsCountScope)
	salaries := make([]AdvisorOpsSalaryDTO, len(detail.Salaries))
	for i, r := range detail.Salaries {
		salaries[i] = AdvisorOpsSalaryDTO{
			ID:                  r.ID,
			PeriodYear:          r.PeriodYear,
			PeriodMonth:         r.PeriodMonth,
			BaseSalaryCents:     r.BaseSalaryCents,
			VariableSalaryCents: r.VariableSalaryCents,
			TotalSalaryCents:    r.TotalSalaryCents,
			StudentsCount:       r.StudentsCount,
			StudentsCountScope:  scopeStr,
			Status:              r.Status,
			PaidAt:              r.PaidAt,
		}
	}
	payments := make([]AdvisorOpsPaymentDTO, len(detail.Payments))
	for i, r := range detail.Payments {
		payments[i] = AdvisorOpsPaymentDTO{
			ID:          r.ID,
			StudentID:   r.StudentID,
			StudentName: r.StudentName,
			AmountCents: r.AmountCents,
			Status:      r.Status,
			PaidAt:      r.PaidAt,
			Description: r.Description,
		}
	}

	bd := toCompensationBreakdownDTO(services.CompensationBreakdownDetail{
		UserID:              detail.UserID,
		PeriodYear:          detail.PeriodYear,
		PeriodMonth:         detail.PeriodMonth,
		BaseSalaryCents:     detail.BaseSalaryCents,
		VariableSalaryCents: detail.VariableSalaryCents,
		TotalSalaryCents:    detail.TotalSalaryCents,
		PaymentSharesCents:  detail.PaymentSharesCents,
		AccrualSharesCents:  detail.AccrualSharesCents,
		StudentsCount:       detail.StudentsCount,
		StudentsCountScope:  detail.StudentsCountScope,
		CompensationKind:    detail.CompensationKind,
		PaymentShareLines:   detail.PaymentShareLines,
		AccrualShareLines:   detail.AccrualShareLines,
		EntryID:             detail.EntryID,
		EntryStatus:         detail.EntryStatus,
		EntryLocked:         detail.EntryLocked,
	})

	ledgerMonths := make([]StaffLedgerMonthDTO, len(detail.LedgerMonths))
	for i, m := range detail.LedgerMonths {
		ledgerMonths[i] = toStaffLedgerMonthDTO(m)
	}

	c.JSON(http.StatusOK, gin.H{
		"user_id":                   detail.UserID,
		"first_name":                detail.FirstName,
		"last_name":                 detail.LastName,
		"role_code":                 detail.RoleCode,
		"role_name":                 detail.RoleName,
		"period_year":               detail.PeriodYear,
		"period_month":              detail.PeriodMonth,
		"base_salary_cents":         bd.BaseSalaryCents,
		"variable_salary_cents":     bd.VariableSalaryCents,
		"total_salary_cents":        bd.TotalSalaryCents,
		"payment_shares_cents":      bd.PaymentSharesCents,
		"accrual_shares_cents":      bd.AccrualSharesCents,
		"students_count":            bd.StudentsCount,
		"students_count_scope":      bd.StudentsCountScope,
		"compensation_kind":         bd.CompensationKind,
		"payment_share_lines":       bd.PaymentShareLines,
		"accrual_share_lines":       bd.AccrualShareLines,
		"entry_id":                  bd.EntryID,
		"entry_status":              bd.EntryStatus,
		"entry_locked":              bd.EntryLocked,
		"students_total":            detail.StudentsTotal,
		"payments_count":            detail.PaymentsCount,
		"payments_total_cents":      detail.PaymentsTotalCents,
		"salaries_count":            detail.SalariesCount,
		"salaries_paid_count":       detail.SalariesPaidCount,
		"salaries_total_cents":      detail.SalariesTotalCents,
		"salaries_paid_cents":       detail.SalariesPaidCents,
		"expected_total_cents":      detail.ExpectedTotalCents,
		"students_paid_total_cents": detail.StudentsPaidTotal,
		"remaining_cents":           detail.RemainingCents,
		"students":                  students,
		"salaries":                  salaries,
		"payments":                  payments,
		"settlement_accrued_cents":  detail.SettlementAccruedCents,
		"settlement_paid_out_cents": detail.SettlementPaidOutCents,
		"settlement_balance_cents":  detail.SettlementBalanceCents,
		"settlement_payouts":        toStaffPayoutDTOs(detail.SettlementPayouts),
		"month_ledger":              toStaffLedgerMonthDTO(detail.Month),
		"ledger_months":             ledgerMonths,
	})
}

func toStaffPayoutDTOs(rows []services.StaffPayoutRow) []StaffPayoutDTO {
	out := make([]StaffPayoutDTO, len(rows))
	for i, r := range rows {
		out[i] = StaffPayoutDTO{
			ID:             r.ID,
			AmountCents:    r.AmountCents,
			PaidAt:         r.PaidAt,
			Note:           r.Note,
			Source:         r.Source,
			PayrollEntryID: r.PayrollEntryID,
			CreatedAt:      r.CreatedAt,
		}
	}
	return out
}

func toStaffSettlementDTO(s *services.StaffSettlementSummary) StaffSettlementDTO {
	if s == nil {
		return StaffSettlementDTO{Payouts: []StaffPayoutDTO{}}
	}
	return StaffSettlementDTO{
		AccruedTotalCents: s.AccruedTotalCents,
		PaidOutTotalCents: s.PaidOutTotalCents,
		BalanceCents:      s.BalanceCents,
		Payouts:           toStaffPayoutDTOs(s.Payouts),
	}
}

// GetStaffSettlement handles GET /payroll/users/:user_id/settlement
func (h *PayrollHandler) GetStaffSettlement(c *gin.Context) {
	uid, err := strconv.ParseUint(c.Param("user_id"), 10, 64)
	if err != nil || uid == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه کاربر نامعتبر است"})
		return
	}
	summary, err := h.service.GetStaffSettlement(c.Request.Context(), uint(uid), middleware.DataScopeUserID(c))
	if err != nil {
		if h.writePayrollComputeError(c, err) {
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بارگذاری تسویه"})
		return
	}
	c.JSON(http.StatusOK, toStaffSettlementDTO(summary))
}

// CreateStaffPayout handles POST /payroll/users/:user_id/payouts
func (h *PayrollHandler) CreateStaffPayout(c *gin.Context) {
	uid, err := strconv.ParseUint(c.Param("user_id"), 10, 64)
	if err != nil || uid == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه کاربر نامعتبر است"})
		return
	}
	var req createStaffPayoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeBindError(c, err)
		return
	}
	paidAt := time.Now()
	if strings.TrimSpace(req.PaidAtStr) != "" {
		t, pErr := parseOptionalDate(req.PaidAtStr)
		if pErr != nil || t == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "تاریخ پرداخت نامعتبر است"})
			return
		}
		paidAt = *t
	}
	var createdBy *uint
	if userIDVal, ok := c.Get(middleware.ContextUserIDKey); ok {
		if id, ok := userIDVal.(uint); ok && id > 0 {
			createdBy = &id
		}
	}
	row, err := h.service.CreateStaffPayout(c.Request.Context(), services.CreateStaffPayoutParams{
		UserID:      uint(uid),
		AmountCents: req.AmountCents,
		PaidAt:      paidAt,
		Note:        strings.TrimSpace(req.Note),
		CreatedByID: createdBy,
	}, middleware.DataScopeUserID(c))
	if err != nil {
		if h.writePayrollComputeError(c, err) {
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در ثبت پرداخت"})
		return
	}
	c.JSON(http.StatusCreated, StaffPayoutDTO{
		ID:             row.ID,
		AmountCents:    row.AmountCents,
		PaidAt:         row.PaidAt,
		Note:           row.Note,
		Source:         row.Source,
		PayrollEntryID: row.PayrollEntryID,
		CreatedAt:      row.CreatedAt,
	})
}

// DeleteStaffPayout handles DELETE /payroll/payouts/:id (admin correction).
func (h *PayrollHandler) DeleteStaffPayout(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه پرداخت نامعتبر است"})
		return
	}
	if err := h.service.DeleteStaffPayout(c.Request.Context(), uint(id), middleware.DataScopeUserID(c)); err != nil {
		if h.writePayrollComputeError(c, err) {
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در حذف پرداخت"})
		return
	}
	c.Status(http.StatusNoContent)
}

