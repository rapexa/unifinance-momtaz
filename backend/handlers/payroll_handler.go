package handlers

import (
	"net/http"
	"strconv"
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
	return dto
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month; must be 1-12"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load payroll summary"})
		return
	}

	dto := PayrollSummaryDTO{
		PeriodYear:         summary.PeriodYear,
		PeriodMonth:        summary.PeriodMonth,
		TotalBaseCents:     summary.TotalBaseCents,
		TotalVariableCents: summary.TotalVariableCents,
		TotalPaidCents:     summary.TotalPaidCents,
		TotalPendingCents:  summary.TotalPendingCents,
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month; must be 1-12"})
		return
	}
	if err := h.service.EnsureEntriesForPeriod(c.Request.Context(), year, month); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to ensure payroll entries"})
		return
	}
	if err := h.service.RecalculateAllPendingEntriesForPeriod(c.Request.Context(), year, month); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to recalculate payroll"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id is required"})
		return
	}
	uid64, err := strconv.ParseUint(userIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user_id"})
		return
	}
	now := time.Now()
	dy, dm := services.DefaultPeriod(now)
	year := parseIntWithDefault(c.Query("year"), dy)
	month := parseIntWithDefault(c.Query("month"), dm)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month; must be 1-12"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil && uint(uid64) != *scope {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	br, err := h.service.ComputeCompensationForUser(c.Request.Context(), uint(uid64), year, month)
	if err != nil {
		switch err {
		case services.ErrPayrollUserNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		case services.ErrPayrollNoRole:
			c.JSON(http.StatusBadRequest, gin.H{"error": "user has no role"})
		case services.ErrPayrollInvalidRoleCompensation:
			c.JSON(http.StatusBadRequest, gin.H{"error": "role compensation is incomplete"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to compute compensation"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month; must be 1-12"})
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
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user_id"})
			return
		}
		id := uint(id64)
		userID = &id
	}

	entries, total, err := h.service.ListEntries(c.Request.Context(), year, month, pageSize, offset, status, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list payroll entries"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load payroll schemes"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil && req.UserID != *scope {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
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
			c.JSON(http.StatusBadRequest, gin.H{"error": "base_salary_cents is required when apply_role_rules is false"})
			return
		}
		params.BaseSalaryCents = *req.BaseSalaryCents
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
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		case services.ErrPayrollNoRole:
			c.JSON(http.StatusBadRequest, gin.H{"error": "user has no role"})
		case services.ErrPayrollInvalidRoleCompensation:
			c.JSON(http.StatusBadRequest, gin.H{"error": "role compensation is incomplete; fix role settings"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create payroll entry"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	entry, err := h.service.GetEntryByID(c.Request.Context(), uint(id))
	if err != nil {
		if err == services.ErrPayrollEntryNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "payroll entry not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get payroll entry"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil && entry.UserID != *scope {
		c.JSON(http.StatusNotFound, gin.H{"error": "payroll entry not found"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req updatePayrollEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	existing, err := h.service.GetEntryByID(c.Request.Context(), uint(id))
	if err != nil {
		if err == services.ErrPayrollEntryNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "payroll entry not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get payroll entry"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil && existing.UserID != *scope {
		c.JSON(http.StatusNotFound, gin.H{"error": "payroll entry not found"})
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
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid paid_at date"})
			return
		}
		params.PaidAt = t
	}

	entry, err := h.service.UpdateEntry(c.Request.Context(), uint(id), params)
	if err != nil {
		if err == services.ErrPayrollEntryNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "payroll entry not found"})
			return
		}
		switch err {
		case services.ErrPayrollUserNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		case services.ErrPayrollNoRole:
			c.JSON(http.StatusBadRequest, gin.H{"error": "user has no role"})
		case services.ErrPayrollInvalidRoleCompensation:
			c.JSON(http.StatusBadRequest, gin.H{"error": "role compensation is incomplete"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update payroll entry"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month; must be 1-12"})
		return
	}
	rows, err := h.service.ListAdvisorOps(c.Request.Context(), year, month, middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load advisor ops"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user_id"})
		return
	}
	now := time.Now()
	dy, dm := services.DefaultPeriod(now)
	year := parseIntWithDefault(c.Query("year"), dy)
	month := parseIntWithDefault(c.Query("month"), dm)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month; must be 1-12"})
		return
	}
	rows, err := h.service.ListAdvisorOpsStudents(c.Request.Context(), uint(uid), year, month, middleware.DataScopeUserID(c))
	if err != nil {
		if err.Error() == "forbidden" {
			c.JSON(http.StatusForbidden, gin.H{"error": "دسترسی مجاز نیست"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load students"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user_id"})
		return
	}
	now := time.Now()
	dy, dm := services.DefaultPeriod(now)
	year := parseIntWithDefault(c.Query("year"), dy)
	month := parseIntWithDefault(c.Query("month"), dm)
	if month < 1 || month > 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month; must be 1-12"})
		return
	}
	detail, err := h.service.GetAdvisorOpsUserDetail(c.Request.Context(), uint(uid), year, month, middleware.DataScopeUserID(c))
	if err != nil {
		if err.Error() == "forbidden" {
			c.JSON(http.StatusForbidden, gin.H{"error": "دسترسی مجاز نیست"})
			return
		}
		if err == services.ErrPayrollUserNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "کاربر یافت نشد"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user detail"})
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
