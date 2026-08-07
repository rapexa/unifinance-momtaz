package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/middleware"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

type PaymentHandler struct {
	service *services.PaymentService
}

func NewPaymentHandler(service *services.PaymentService) *PaymentHandler {
	return &PaymentHandler{service: service}
}

func (h *PaymentHandler) requirePaymentAccess(c *gin.Context, p *models.Payment) bool {
	su := middleware.DataScopeUserID(c)
	if su == nil {
		return true
	}
	ok, err := h.service.IsPaymentRecordVisibleToUser(c.Request.Context(), p, *su)
	return err == nil && ok
}

func (h *PaymentHandler) requireStudentPaymentAccess(c *gin.Context, studentID uint) bool {
	su := middleware.DataScopeUserID(c)
	if su == nil {
		return true
	}
	ok, err := h.service.IsPaymentVisibleToUser(c.Request.Context(), studentID, *su)
	return err == nil && ok
}

type PaymentDTO struct {
	ID                   uint       `json:"id"`
	StudentID            *uint      `json:"student_id,omitempty"`
	StudentName          string     `json:"student_name"`
	StudentPhone         string     `json:"student_phone,omitempty"`
	AdvisorName          string     `json:"advisor_name,omitempty"`
	SchoolContractID     *uint      `json:"school_contract_id,omitempty"`
	SchoolName           string     `json:"school_name,omitempty"`
	ContractStudentCount int        `json:"contract_student_count,omitempty"`
	PerStudentAmountCents int64     `json:"per_student_amount_cents,omitempty"`
	PayerType            string     `json:"payer_type"` // STUDENT | LEGACY_SCHOOL
	IsLegacySchoolContract bool     `json:"is_legacy_school_contract,omitempty"`
	EnrollmentID         *uint      `json:"enrollment_id,omitempty"`
	PlanName             *string    `json:"plan_name,omitempty"`
	AmountCents          int64      `json:"amount_cents"`
	AdvisorShareCents    int64      `json:"advisor_share_cents"`
	Currency             string     `json:"currency"`
	Status               string     `json:"status"`
	Method               string     `json:"method"`
	Type                 string     `json:"payment_type"`
	DueDate              *time.Time `json:"due_date,omitempty"`
	PaidAt               *time.Time `json:"paid_at,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	Description          string     `json:"description,omitempty"`
	ReferenceCode        string     `json:"reference_code,omitempty"`
}

func toPaymentDTO(p *models.Payment) PaymentDTO {
	dto := PaymentDTO{
		ID:                p.ID,
		StudentID:         p.StudentID,
		SchoolContractID:  p.SchoolContractID,
		AmountCents:       p.AmountCents,
		AdvisorShareCents: p.AdvisorShareCents,
		Currency:          p.Currency,
		Status:            string(p.Status),
		Method:            string(p.Method),
		Type:              string(p.Type),
		DueDate:           p.DueDate,
		PaidAt:            p.PaidAt,
		CreatedAt:         p.CreatedAt,
		Description:       p.Description,
		ReferenceCode:     p.ReferenceCode,
		PayerType:         "STUDENT",
	}

	if p.IsLegacySchoolContractPayment() {
		dto.PayerType = "LEGACY_SCHOOL"
		dto.IsLegacySchoolContract = true
		dto.ContractStudentCount = p.ContractStudentCount
		dto.PerStudentAmountCents = p.PerStudentAmountCents()
		if p.SchoolContract != nil {
			dto.SchoolName = p.SchoolContract.SchoolName
			dto.StudentName = p.SchoolContract.SchoolName
			if dto.ContractStudentCount <= 0 {
				dto.ContractStudentCount = p.SchoolContract.StudentCount
				dto.PerStudentAmountCents = p.PerStudentAmountCents()
				if dto.ContractStudentCount > 0 {
					dto.PerStudentAmountCents = p.AmountCents / int64(dto.ContractStudentCount)
				}
			}
		} else if dto.ContractStudentCount > 0 {
			dto.PerStudentAmountCents = p.AmountCents / int64(dto.ContractStudentCount)
		}
	}

	if p.Student != nil && p.Student.ID != 0 {
		dto.StudentName = fmt.Sprintf("%s %s", p.Student.FirstName, p.Student.LastName)
		dto.StudentPhone = p.Student.Phone
		if p.Student.Advisor != nil && p.Student.Advisor.ID != 0 {
			dto.AdvisorName = fmt.Sprintf("%s %s", p.Student.Advisor.FirstName, p.Student.Advisor.LastName)
		}
	}

	if p.EnrollmentID != nil && p.Enrollment != nil {
		dto.EnrollmentID = p.EnrollmentID
		// Plan is a value field; check its ID to decide whether it's loaded.
		if p.Enrollment.Plan.ID != 0 {
			name := p.Enrollment.Plan.Name
			dto.PlanName = &name
		}
	}

	return dto
}

func toPaymentDTOSlice(payments []models.Payment) []PaymentDTO {
	out := make([]PaymentDTO, len(payments))
	for i, p := range payments {
		out[i] = toPaymentDTO(&p)
	}
	return out
}

type createPaymentRequest struct {
	StudentID        *uint  `json:"student_id" binding:"omitempty"`
	SchoolContractID *uint  `json:"school_contract_id" binding:"omitempty"`
	AmountCents      int64  `json:"amount_cents" binding:"required,gt=0"`
	PaidAtStr        string `json:"paid_at" binding:"omitempty"`
	Method           string `json:"method" binding:"required"`
	Description      string `json:"description" binding:"omitempty,max=500"`
	ReferenceCode    string `json:"reference_number" binding:"omitempty,max=255"`
	Status           string `json:"status" binding:"required"`
	Type             string `json:"payment_type" binding:"omitempty,oneof=SINGLE_SESSION MONTHLY COURSE"`
	EnrollmentID     *uint  `json:"enrollment_id" binding:"omitempty"`
	DueDateStr       string `json:"due_date" binding:"omitempty"`
	Currency         string `json:"currency" binding:"omitempty"`
}

type updatePaymentRequest struct {
	AmountCents   *int64  `json:"amount_cents" binding:"omitempty,gt=0"`
	PaidAtStr     *string `json:"paid_at" binding:"omitempty"`
	Method        *string `json:"method" binding:"omitempty"`
	Description   *string `json:"description" binding:"omitempty,max=500"`
	ReferenceCode *string `json:"reference_number" binding:"omitempty,max=255"`
	Status        *string `json:"status" binding:"omitempty"`
	Type          *string `json:"payment_type" binding:"omitempty,oneof=SINGLE_SESSION MONTHLY COURSE"`
	EnrollmentID  *uint   `json:"enrollment_id" binding:"omitempty"`
	DueDateStr    *string `json:"due_date" binding:"omitempty"`
}

// Summary handles GET /payments/summary
// @Summary      Payment summary
// @Description  Aggregated amounts: today received, pending, overdue, this month received (admin only)
// @Tags         payments
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /payments/summary [get]
func (h *PaymentHandler) Summary(c *gin.Context) {
	_, _ = h.service.PromotePendingPastDueToOverdue(c.Request.Context())
	sum, err := h.service.Summary(c.Request.Context(), middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت خلاصه پرداخت‌ها"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"today_received_cents":      sum.TodayReceivedCents,
		"pending_cents":             sum.PendingCents,
		"overdue_cents":             sum.OverdueCents,
		"this_month_received_cents": sum.ThisMonthReceivedCents,
	})
}

// List handles GET /payments
// @Summary      List payments
// @Description  Paginated list of payments with filters (admin only)
// @Tags         payments
// @Security     BearerAuth
// @Produce      json
// @Param        page       query     int     false "Page number (1-based)" default(1)
// @Param        page_size  query     int     false "Page size" default(20)
// @Param        search     query     string  false "Search by student name, description, reference"
// @Param        status     query     string  false "Status filter"
// @Param        method     query     string  false "Method filter"
// @Param        from_date  query     string  false "From date (YYYY-MM-DD)"
// @Param        to_date    query     string  false "To date (YYYY-MM-DD)"
// @Param        sort       query     string  false "Sort field (e.g. -created_at,amount)"
// @Success      200        {object}  map[string]interface{}
// @Failure      400        {object}  map[string]string
// @Failure      401        {object}  map[string]string
// @Failure      403        {object}  map[string]string
// @Failure      500        {object}  map[string]string
// @Router       /payments [get]
func (h *PaymentHandler) List(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "20")
	search := c.DefaultQuery("search", "")
	status := c.DefaultQuery("status", "")
	method := c.DefaultQuery("method", "")
	fromStr := c.DefaultQuery("from_date", "")
	toStr := c.DefaultQuery("to_date", "")
	sort := c.DefaultQuery("sort", "-created_at")

	page, err := strconv.Atoi(pageStr)
	if err != nil || page <= 0 {
		page = 1
	}
	pageSize, err := strconv.Atoi(pageSizeStr)
	if err != nil || pageSize <= 0 {
		pageSize = 20
	}
	// 200 so the UI can offer up to 200 rows per page.
	if pageSize > 200 {
		pageSize = 200
	}
	offset := (page - 1) * pageSize

	_, _ = h.service.PromotePendingPastDueToOverdue(c.Request.Context())

	var fromDate *time.Time
	if fromStr != "" {
		if t, err := time.Parse("2006-01-02", fromStr); err == nil {
			fromDate = &t
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "تاریخ شروع نامعتبر است"})
			return
		}
	}
	var toDate *time.Time
	if toStr != "" {
		if t, err := time.Parse("2006-01-02", toStr); err == nil {
			toDate = &t
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "تاریخ پایان نامعتبر است"})
			return
		}
	}

	payments, total, err := h.service.List(c.Request.Context(), pageSize, offset, search, status, method, fromDate, toDate, sort, middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت لیست پرداخت‌ها"})
		return
	}

	dtos := toPaymentDTOSlice(payments)
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

// Get handles GET /payments/:id
// @Summary      Get payment
// @Description  Get payment by ID (admin only)
// @Tags         payments
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      int  true "Payment ID"
// @Success      200  {object}  PaymentDTO
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Router       /payments/{id} [get]
func (h *PaymentHandler) Get(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	_, _ = h.service.PromotePendingPastDueToOverdue(c.Request.Context())

	p, err := h.service.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		if err == services.ErrPaymentNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "پرداخت یافت نشد"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت پرداخت"})
		}
		return
	}
	if !h.requirePaymentAccess(c, p) {
		c.JSON(http.StatusNotFound, gin.H{"error": "پرداخت یافت نشد"})
		return
	}

	c.JSON(http.StatusOK, toPaymentDTO(p))
}

// Create handles POST /payments
// @Summary      Create payment
// @Description  Manually register a payment (admin only)
// @Tags         payments
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      createPaymentRequest true "Payment data"
// @Success      201   {object}  PaymentDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /payments [post]
// parseOptionalDate parses YYYY-MM-DD or RFC3339 and returns local midnight.
func parseOptionalDate(s string) (*time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	layouts := []string{
		"2006-01-02",
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05Z07:00",
	}
	for _, layout := range layouts {
		t, err := time.Parse(layout, s)
		if err != nil {
			continue
		}
		loc := time.Local
		normalized := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
		return &normalized, nil
	}
	return nil, fmt.Errorf("فرمت تاریخ نامعتبر است. مثال: 2024-04-03")
}

func (h *PaymentHandler) Create(c *gin.Context) {
	var req createPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dueDate, err := parseOptionalDate(req.DueDateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	paidAt, err := parseOptionalDate(req.PaidAtStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hasStudent := req.StudentID != nil && *req.StudentID > 0
	if !hasStudent {
		if req.SchoolContractID != nil && *req.SchoolContractID > 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "ثبت پرداخت فقط با school_contract_id منسوخ شده است؛ دانش‌آموز مدرسه را انتخاب کنید",
			})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "student_id الزامی است"})
		return
	}
	if !h.requireStudentPaymentAccess(c, *req.StudentID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "دانش‌آموز یافت نشد"})
		return
	}

	params := services.CreatePaymentParams{
		StudentID:   req.StudentID,
		AmountCents: req.AmountCents,
		PaidAt:           paidAt,
		Method:           req.Method,
		Description:      req.Description,
		ReferenceCode:    req.ReferenceCode,
		Status:           req.Status,
		Type:             req.Type,
		EnrollmentID:     req.EnrollmentID,
		DueDate:          dueDate,
		Currency:         req.Currency,
	}

	p, err := h.service.Create(c.Request.Context(), params)
	if err != nil {
		if err == services.ErrSchoolContractNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "قرارداد مدرسه یافت نشد"})
			return
		}
		msg := err.Error()
		if strings.Contains(msg, "student_id") || strings.Contains(msg, "amount") {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در ثبت پرداخت"})
		return
	}

	c.JSON(http.StatusCreated, toPaymentDTO(p))
}

// Update handles PUT /payments/:id
// @Summary      Update payment
// @Description  Update payment fields (admin only)
// @Tags         payments
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path      int               true  "Payment ID"
// @Param        body  body      updatePaymentRequest true  "Payment data"
// @Success      200   {object}  PaymentDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      404   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /payments/{id} [put]
func (h *PaymentHandler) Update(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	var req updatePaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var dueDate *time.Time
	if req.DueDateStr != nil {
		t, err := parseOptionalDate(*req.DueDateStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		dueDate = t
	}

	var paidAt *time.Time
	if req.PaidAtStr != nil {
		t, err := parseOptionalDate(*req.PaidAtStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		paidAt = t
	}

	existing, err := h.service.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		if err == services.ErrPaymentNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "پرداخت یافت نشد"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت پرداخت"})
		}
		return
	}
	if !h.requirePaymentAccess(c, existing) {
		c.JSON(http.StatusNotFound, gin.H{"error": "پرداخت یافت نشد"})
		return
	}

	params := services.UpdatePaymentParams{
		AmountCents:   req.AmountCents,
		PaidAt:        paidAt,
		Method:        req.Method,
		Description:   req.Description,
		ReferenceCode: req.ReferenceCode,
		Status:        req.Status,
		Type:          req.Type,
		EnrollmentID:  req.EnrollmentID,
		DueDate:       dueDate,
	}

	p, err := h.service.Update(c.Request.Context(), uint(id), params)
	if err != nil {
		if err == services.ErrPaymentNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "پرداخت یافت نشد"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ویرایش پرداخت با خطا مواجه شد"})
		}
		return
	}

	c.JSON(http.StatusOK, toPaymentDTO(p))
}

// Delete handles DELETE /payments/:id
// @Summary      Cancel payment
// @Description  Soft delete / cancel payment (admin only)
// @Tags         payments
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      int  true "Payment ID"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /payments/{id} [delete]
func (h *PaymentHandler) Delete(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	p, err := h.service.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		if err == services.ErrPaymentNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "پرداخت یافت نشد"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت پرداخت"})
		}
		return
	}
	if !h.requirePaymentAccess(c, p) {
		c.JSON(http.StatusNotFound, gin.H{"error": "پرداخت یافت نشد"})
		return
	}

	if err := h.service.SoftDelete(c.Request.Context(), uint(id)); err != nil {
		if err == services.ErrPaymentNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "پرداخت یافت نشد"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "حذف پرداخت با خطا مواجه شد"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Payment cancelled"})
}

// Export handles GET /payments/export
// @Summary      Export payments
// @Description  Export filtered payments as CSV (admin only)
// @Tags         payments
// @Security     BearerAuth
// @Produce      text/csv
// @Param        page       query     int     false "Page number (1-based)" default(1)
// @Param        page_size  query     int     false "Page size" default(100)
// @Param        search     query     string  false "Search by student name, description, reference"
// @Param        status     query     string  false "Status filter"
// @Param        method     query     string  false "Method filter"
// @Param        from_date  query     string  false "From date (YYYY-MM-DD)"
// @Param        to_date    query     string  false "To date (YYYY-MM-DD)"
// @Param        sort       query     string  false "Sort field"
// @Success      200        "CSV file"
// @Failure      400        {object}  map[string]string
// @Failure      401        {object}  map[string]string
// @Failure      403        {object}  map[string]string
// @Failure      500        {object}  map[string]string
// @Router       /payments/export [get]
func (h *PaymentHandler) Export(c *gin.Context) {
	// Reuse list filters, but fetch a big page (e.g. 10k max)
	c.Request.URL.Query()
	c.Set("page_size", "10000") // if you want a helper, refactor this; here it's simplified

	// For simplicity, call List logic directly with explicit params instead of reusing handler
	// (You can factor this out into a shared helper in production.)
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "10000")
	search := c.DefaultQuery("search", "")
	status := c.DefaultQuery("status", "")
	method := c.DefaultQuery("method", "")
	fromStr := c.DefaultQuery("from_date", "")
	toStr := c.DefaultQuery("to_date", "")
	sort := c.DefaultQuery("sort", "-created_at")

	page, err := strconv.Atoi(pageStr)
	if err != nil || page <= 0 {
		page = 1
	}
	pageSize, err := strconv.Atoi(pageSizeStr)
	if err != nil || pageSize <= 0 {
		pageSize = 10000
	}
	if pageSize > 10000 {
		pageSize = 10000
	}
	offset := (page - 1) * pageSize

	_, _ = h.service.PromotePendingPastDueToOverdue(c.Request.Context())

	var fromDate *time.Time
	if fromStr != "" {
		if t, err := time.Parse("2006-01-02", fromStr); err == nil {
			fromDate = &t
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "تاریخ شروع نامعتبر است"})
			return
		}
	}
	var toDate *time.Time
	if toStr != "" {
		if t, err := time.Parse("2006-01-02", toStr); err == nil {
			toDate = &t
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "تاریخ پایان نامعتبر است"})
			return
		}
	}

	payments, _, err := h.service.List(c.Request.Context(), pageSize, offset, search, status, method, fromDate, toDate, sort, middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خروجی پرداخت‌ها با خطا مواجه شد"})
		return
	}

	filename := fmt.Sprintf("payments_export_%s.csv", time.Now().Format("20060102"))

	header := []string{
		"شناسه پرداخت",
		"نوع",
		"شناسه دانش‌آموز/قرارداد",
		"نام دانش‌آموز / مدرسه",
		"تعداد دانش‌آموز قرارداد",
		"معادل هر دانش‌آموز (تومان)",
		"مبلغ (تومان)",
		"وضعیت",
		"روش پرداخت",
		"تاریخ سررسید",
		"تاریخ پرداخت",
		"کد پیگیری",
		"توضیحات",
	}
	rows := make([][]string, 0, len(payments))
	for _, p := range payments {
		dto := toPaymentDTO(&p)
		payerLabel := "فردی"
		refID := ""
		if dto.PayerType == "LEGACY_SCHOOL" || dto.IsLegacySchoolContract {
			payerLabel = "قرارداد قدیمی"
			if dto.SchoolContractID != nil {
				refID = strconv.FormatUint(uint64(*dto.SchoolContractID), 10)
			}
		} else if dto.StudentID != nil {
			refID = strconv.FormatUint(uint64(*dto.StudentID), 10)
		}
		studentName := strings.TrimSpace(dto.StudentName)
		if studentName == "" {
			studentName = "—"
		}
		countStr := ""
		perStudentStr := ""
		if (dto.PayerType == "LEGACY_SCHOOL" || dto.IsLegacySchoolContract) && dto.ContractStudentCount > 0 {
			countStr = strconv.Itoa(dto.ContractStudentCount)
			perStudentStr = strconv.FormatInt(dto.PerStudentAmountCents/10, 10)
		}
		rows = append(rows, []string{
			strconv.FormatUint(uint64(dto.ID), 10),
			payerLabel,
			refID,
			studentName,
			countStr,
			perStudentStr,
			strconv.FormatInt(dto.AmountCents/10, 10),
			paymentStatusLabelFa(dto.Status),
			paymentMethodLabelFa(dto.Method),
			formatExportDate(dto.DueDate),
			formatExportDate(dto.PaidAt),
			dto.ReferenceCode,
			dto.Description,
		})
	}
	if err := writeCSVAttachment(c.Writer, filename, header, rows); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خروجی پرداخت‌ها با خطا مواجه شد"})
	}
}

func paymentStatusLabelFa(status string) string {
	switch strings.ToUpper(status) {
	case string(models.PaymentStatusPaid):
		return "پرداخت شده"
	case string(models.PaymentStatusPending):
		return "در انتظار"
	case string(models.PaymentStatusOverdue):
		return "سررسید گذشته"
	case string(models.PaymentStatusCancelled):
		return "لغو شده"
	default:
		return status
	}
}

func paymentMethodLabelFa(method string) string {
	switch strings.ToUpper(method) {
	case string(models.PaymentMethodCash):
		return "نقدی"
	case string(models.PaymentMethodCardToCard):
		return "کارت به کارت"
	case string(models.PaymentMethodGateway):
		return "درگاه"
	case string(models.PaymentMethodInstallment):
		return "اقساط"
	case string(models.PaymentMethodOther):
		return "سایر"
	default:
		return method
	}
}

func formatExportDate(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.In(time.Local).Format("2006-01-02 15:04")
}

// GenerateLink handles POST /payments/:id/link
// @Summary      Generate fake payment link
// @Description  Generate a fake/preview payment link (no real gateway yet)
// @Tags         payments
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      int  true "Payment ID"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Router       /payments/{id}/link [post]
func (h *PaymentHandler) GenerateLink(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	p, err := h.service.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		if err == services.ErrPaymentNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "پرداخت یافت نشد"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت پرداخت"})
		}
		return
	}
	if !h.requirePaymentAccess(c, p) {
		c.JSON(http.StatusNotFound, gin.H{"error": "پرداخت یافت نشد"})
		return
	}
	if p.IsLegacySchoolContractPayment() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "لینک پرداخت برای پرداخت قرارداد قدیمی پشتیبانی نمی‌شود"})
		return
	}

	link := fmt.Sprintf("https://mali-momtazisho.ir/pay/%d", id)
	qrURL := fmt.Sprintf(
		"https://api.qrserver.com/v1/create-qr-code/?data=%s&size=200x200",
		link,
	)

	c.JSON(http.StatusOK, gin.H{
		"payment_link": link,
		"qr_code_url":  qrURL,
	})
}
