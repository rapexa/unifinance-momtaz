package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/middleware"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"github.com/soheilsshh/unifinance-momtaz/services"
	"gorm.io/gorm"
)

// StudentHandler exposes student-related endpoints.
type StudentHandler struct {
	service         *services.StudentService
	payments        *services.PaymentService
	schoolContracts *services.SchoolContractService
}

func NewStudentHandler(
	service *services.StudentService,
	payments *services.PaymentService,
	schoolContracts *services.SchoolContractService,
) *StudentHandler {
	return &StudentHandler{service: service, payments: payments, schoolContracts: schoolContracts}
}

// StudentDoc is a simplified representation of Student for Swagger docs and API responses.
type StudentDoc struct {
	ID            uint   `json:"id"`
	FirstName     string `json:"first_name"`
	LastName      string `json:"last_name"`
	Email         string `json:"email,omitempty"`
	Phone         string `json:"phone,omitempty"`
	Status        string `json:"status"`
	FatherName    string `json:"father_name,omitempty"`
	MotherName    string `json:"mother_name,omitempty"`
	FatherPhone   string `json:"father_phone,omitempty"`
	MotherPhone   string `json:"mother_phone,omitempty"`
	FatherJob     string `json:"father_job,omitempty"`
	MotherJob     string `json:"mother_job,omitempty"`
	SchoolName              string `json:"school_name,omitempty"`
	SchoolAddress           string `json:"school_address,omitempty"`
	HomeAddress             string `json:"home_address,omitempty"`
	RegistrationChannel     string `json:"registration_channel,omitempty"`
	SchoolContractID        *uint  `json:"school_contract_id,omitempty"`
	SchoolContractName      string `json:"school_contract_name,omitempty"`
	DeliveryMode            string `json:"delivery_mode,omitempty"`
	AdvisorName             string `json:"advisor_name,omitempty"`
	AdvisorID               *uint  `json:"advisor_id,omitempty"`
	// Per paid payment: how the assigned advisor is compensated (see models.StudentAdvisorCommissionKind).
	AdvisorCommissionKind       string   `json:"advisor_commission_kind,omitempty"`
	AdvisorCommissionPercent    *float64 `json:"advisor_commission_percent,omitempty"`
	AdvisorCommissionFixedCents *int64   `json:"advisor_commission_fixed_cents,omitempty"`
	EnrollmentBillingMode       string   `json:"enrollment_billing_mode,omitempty"`
	AdvisorAccrualMonths        *int     `json:"advisor_accrual_months,omitempty"`
	AdvisorAccrualMonthMask   *int     `json:"advisor_accrual_month_mask,omitempty"`
	AdvisorMonthlyAccrualCents  int64    `json:"advisor_monthly_accrual_cents,omitempty"`
	CurrentPlanName             string   `json:"current_plan_name,omitempty"`
	CurrentPlanID               *uint    `json:"current_plan_id,omitempty"`
	// EnrollmentAmountCents is the per-student enrollment price for the current plan.
	EnrollmentAmountCents int64 `json:"enrollment_amount_cents"`
	// BalanceCents is the internal ledger (cumulative adjustment from PAID payments); prefer RemainingBalanceCents for display.
	BalanceCents int64 `json:"balance_cents"`
	// RemainingBalanceCents: if enrollment > 0, enrollment − sum(PAID); else sum(PENDING)+sum(OVERDUE).
	RemainingBalanceCents int64 `json:"remaining_balance_cents"`
	// PaidTotalCents is sum of PAID payment amounts for this student (for UI hints).
	PaidTotalCents int64 `json:"paid_total_cents"`
	// MonthRemainingCents (مانده ماه): due from registration through the current Jalali month − paid.
	MonthRemainingCents int64 `json:"month_remaining_cents"`
	// TotalRemainingCents (مانده کل): whole contract − paid (monthly billing: fees due so far − paid).
	TotalRemainingCents int64 `json:"total_remaining_cents"`
	// DueToDateCents is what should have been paid through the current month.
	DueToDateCents int64 `json:"due_to_date_cents"`
	// InstallmentCents is this month's installment / monthly fee.
	InstallmentCents int64 `json:"installment_cents"`
	MonthsElapsed    int   `json:"months_elapsed"`
	ScheduleMonths   int   `json:"schedule_months,omitempty"`
	// EndDate (YYYY-MM-DD) is when the student stopped being active; billing stops there.
	EndDate string `json:"end_date,omitempty"`
	// AdvisoryStartDate is JoinDate as YYYY-MM-DD (تاریخ شروع مشاوره).
	AdvisoryStartDate string                 `json:"advisory_start_date,omitempty"`
	RolePayouts       []StudentRolePayoutDoc `json:"role_payouts,omitempty"`
	// Soft product warnings (e.g. school enrollment sum ≠ contract total). Never blocks save.
	Warnings []string `json:"warnings,omitempty"`
}

type StudentRolePayoutDoc struct {
	ID         uint     `json:"id"`
	RoleID     uint     `json:"role_id"`
	RoleName   string   `json:"role_name,omitempty"`
	UserID     uint     `json:"user_id"`
	UserName   string   `json:"user_name,omitempty"`
	AmountKind string   `json:"amount_kind"`
	Percent    *float64 `json:"percent,omitempty"`
	FixedCents *int64   `json:"fixed_cents,omitempty"`
}

// toStudentDoc converts a Student model to a public DTO.
func toStudentDoc(s *models.Student) StudentDoc {
	doc := StudentDoc{
		ID:                          s.ID,
		FirstName:                   s.FirstName,
		LastName:                    s.LastName,
		Email:                       s.Email,
		Phone:                       s.Phone,
		Status:                      string(s.Status),
		FatherName:                  s.FatherName,
		MotherName:                  s.MotherName,
		FatherPhone:                 s.FatherPhone,
		MotherPhone:                 s.MotherPhone,
		FatherJob:                   s.FatherJob,
		MotherJob:                   s.MotherJob,
		SchoolName:              s.SchoolName,
		SchoolAddress:           s.SchoolAddress,
		HomeAddress:             s.HomeAddress,
		RegistrationChannel:     string(s.RegistrationChannel),
		SchoolContractID:        s.SchoolContractID,
		DeliveryMode:            string(s.DeliveryMode),
		BalanceCents:            s.BalanceCents,
		AdvisorID:                   s.AdvisorID,
		AdvisorCommissionKind:       string(s.AdvisorCommissionKind),
		AdvisorCommissionPercent:    s.AdvisorCommissionPercent,
		AdvisorCommissionFixedCents: s.AdvisorCommissionFixedCents,
		EnrollmentBillingMode:       string(s.EnrollmentBillingMode),
		AdvisorAccrualMonths:        s.AdvisorAccrualMonths,
		AdvisorAccrualMonthMask:     s.AdvisorAccrualMonthMask,
		AdvisorMonthlyAccrualCents:  models.ComputeAdvisorMonthlyAccrualCents(s),
		CurrentPlanID:               s.CurrentPlanID,
	}
	if doc.EnrollmentBillingMode == "" {
		doc.EnrollmentBillingMode = string(models.EnrollmentBillingMonthly)
	}
	if doc.RegistrationChannel == "" {
		doc.RegistrationChannel = string(models.RegistrationChannelPrivate)
	}
	if s.SchoolContract != nil {
		doc.SchoolContractName = s.SchoolContract.SchoolName
	} else if s.IsSchoolChannel() && s.SchoolName != "" {
		doc.SchoolContractName = s.SchoolName
	}
	// Enrollment amount stored directly on student; fall back to active enrollment record.
	if s.EnrollmentAmountCents > 0 {
		doc.EnrollmentAmountCents = s.EnrollmentAmountCents
	} else if len(s.Enrollments) > 0 {
		doc.EnrollmentAmountCents = s.Enrollments[0].PriceCents
	}
	if s.Advisor != nil {
		doc.AdvisorName = s.Advisor.FirstName + " " + s.Advisor.LastName
	}
	if s.CurrentPlan != nil {
		doc.CurrentPlanName = s.CurrentPlan.Name
	}
	if s.JoinDate != nil {
		doc.AdvisoryStartDate = s.JoinDate.Format("2006-01-02")
	}
	if s.EndDate != nil {
		doc.EndDate = s.EndDate.Format("2006-01-02")
	}
	if len(s.StudentRolePayouts) > 0 {
		doc.RolePayouts = make([]StudentRolePayoutDoc, 0, len(s.StudentRolePayouts))
		for _, rp := range s.StudentRolePayouts {
			item := StudentRolePayoutDoc{
				ID:         rp.ID,
				RoleID:     rp.RoleID,
				UserID:     rp.UserID,
				AmountKind: string(rp.AmountKind),
				Percent:    rp.Percent,
				FixedCents: rp.FixedCents,
			}
			if rp.Role != nil {
				item.RoleName = rp.Role.Name
			}
			if rp.User != nil {
				item.UserName = strings.TrimSpace(rp.User.FirstName + " " + rp.User.LastName)
			}
			doc.RolePayouts = append(doc.RolePayouts, item)
		}
	}
	return doc
}

func toStudentDocSlice(students []models.Student) []StudentDoc {
	out := make([]StudentDoc, len(students))
	for i, s := range students {
		out[i] = toStudentDoc(&s)
	}
	return out
}

func (h *StudentHandler) studentDocWithRemaining(ctx context.Context, s *models.Student) StudentDoc {
	doc := toStudentDoc(s)
	if h.payments == nil {
		return h.withSchoolEnrollmentWarnings(ctx, doc)
	}
	paid, open, err := h.payments.PaymentTotalsByStudentIDs(ctx, []uint{s.ID})
	if err != nil {
		return h.withSchoolEnrollmentWarnings(ctx, doc)
	}
	applyStudentBalance(&doc, s, paid[s.ID], open[s.ID])
	return h.withSchoolEnrollmentWarnings(ctx, doc)
}

// withSchoolEnrollmentWarnings soft-warns when Σ enrollment of school students ≠ contract total.
func (h *StudentHandler) withSchoolEnrollmentWarnings(ctx context.Context, doc StudentDoc) StudentDoc {
	if doc.SchoolContractID == nil || *doc.SchoolContractID == 0 || h.schoolContracts == nil {
		return doc
	}
	if strings.ToUpper(strings.TrimSpace(doc.RegistrationChannel)) != string(models.RegistrationChannelSchool) {
		return doc
	}
	contract, _, err := h.schoolContracts.GetByID(ctx, *doc.SchoolContractID)
	if err != nil || contract == nil {
		return doc
	}
	sum, err := h.service.SumEnrollmentCentsBySchoolContractID(ctx, *doc.SchoolContractID)
	if err != nil {
		return doc
	}
	if sum == contract.TotalAmountCents {
		return doc
	}
	doc.Warnings = append(doc.Warnings, fmt.Sprintf(
		"جمع مبالغ ثبت‌نامی دانش‌آموزان این مدرسه (%s تومان) با مبلغ قرارداد (%s تومان) برابر نیست.",
		formatCentsAsTomansFa(sum),
		formatCentsAsTomansFa(contract.TotalAmountCents),
	))
	return doc
}

func formatCentsAsTomansFa(cents int64) string {
	tomans := cents / 10
	if tomans < 0 {
		tomans = -tomans
	}
	s := strconv.FormatInt(tomans, 10)
	n := len(s)
	if n <= 3 {
		if cents < 0 {
			return "-" + s
		}
		return s
	}
	var b strings.Builder
	if cents < 0 {
		b.WriteByte('-')
	}
	rem := n % 3
	if rem > 0 {
		b.WriteString(s[:rem])
		if n > rem {
			b.WriteByte(',')
		}
	}
	for i := rem; i < n; i += 3 {
		b.WriteString(s[i : i+3])
		if i+3 < n {
			b.WriteByte(',')
		}
	}
	return b.String()
}

func (h *StudentHandler) applyRemainingToStudentDocs(ctx context.Context, docs []StudentDoc, students []models.Student) {
	if h.payments == nil || len(docs) != len(students) {
		return
	}
	ids := make([]uint, len(students))
	for i := range students {
		ids[i] = students[i].ID
	}
	paid, open, err := h.payments.PaymentTotalsByStudentIDs(ctx, ids)
	if err != nil {
		return
	}
	for i := range docs {
		id := students[i].ID
		applyStudentBalance(&docs[i], &students[i], paid[id], open[id])
	}
}

// applyStudentBalance fills paid / month remaining / total remaining from the billing schedule.
func applyStudentBalance(doc *StudentDoc, s *models.Student, paid, open int64) {
	b := services.StudentBalanceAt(s, paid, open, time.Now())
	doc.PaidTotalCents = paid
	doc.RemainingBalanceCents = b.TotalRemainingCents
	doc.MonthRemainingCents = b.MonthRemainingCents
	doc.TotalRemainingCents = b.TotalRemainingCents
	doc.DueToDateCents = b.DueToDateCents
	doc.InstallmentCents = b.InstallmentCents
	doc.MonthsElapsed = b.MonthsElapsed
	doc.ScheduleMonths = b.ScheduleMonths
}

// StudentStatsDoc represents summary stats for the Students page.
type StudentStatsDoc struct {
	Total    int64 `json:"total"`
	Active   int64 `json:"active"`
	Inactive int64 `json:"inactive"`
	Deleted  int64 `json:"deleted"`
	Debtors  int64 `json:"debtors"`
}

// maxStudentPageSize caps page_size so the list can be paged through fully
// (the UI offers 25/50/100/200 rows per page).
const maxStudentPageSize = 200

// parseOptionalUintQuery reads a positive integer query param; missing/empty returns nil.
func parseOptionalUintQuery(c *gin.Context, key string) (*uint, error) {
	raw := strings.TrimSpace(c.Query(key))
	if raw == "" {
		return nil, nil
	}
	v, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || v == 0 {
		return nil, fmt.Errorf("invalid %s", key)
	}
	u := uint(v)
	return &u, nil
}

// studentListFilterFromQuery builds the list filter from query params and the caller's data scope.
func studentListFilterFromQuery(c *gin.Context) (repositories.StudentListFilter, error) {
	f := repositories.StudentListFilter{
		Search:     c.DefaultQuery("search", ""),
		SchoolName: strings.TrimSpace(c.Query("school_name")),
		ScopeUser:  middleware.DataScopeUserID(c),
		Sort:       strings.ToLower(strings.TrimSpace(c.Query("sort"))),
	}

	switch status := strings.ToUpper(strings.TrimSpace(c.Query("status"))); status {
	case "", "ALL":
		// no restriction
	case string(models.StudentStatusActive), string(models.StudentStatusInactive), string(models.StudentStatusDeleted):
		f.Status = status
	default:
		return f, errors.New("invalid status")
	}

	switch mode := strings.ToUpper(strings.TrimSpace(c.Query("billing_mode"))); mode {
	case "", "ALL":
		// no restriction
	case string(models.EnrollmentBillingSingleSession), string(models.EnrollmentBillingMonthly), string(models.EnrollmentBillingSchoolEnrollment):
		f.BillingMode = mode
	default:
		return f, errors.New("invalid billing_mode")
	}

	switch ch := strings.ToUpper(strings.TrimSpace(c.Query("registration_channel"))); ch {
	case "", "ALL":
		// no restriction
	case string(models.RegistrationChannelPrivate), string(models.RegistrationChannelSchool):
		f.RegistrationChannel = ch
	default:
		return f, errors.New("invalid registration_channel")
	}

	schoolContractID, err := parseOptionalUintQuery(c, "school_contract_id")
	if err != nil {
		return f, err
	}
	f.SchoolContractID = schoolContractID

	switch f.Sort {
	case "", "newest", "oldest", "name", "name_desc":
	default:
		return f, errors.New("invalid sort")
	}

	advisorID, err := parseOptionalUintQuery(c, "advisor_id")
	if err != nil {
		return f, err
	}
	f.AdvisorID = advisorID

	planID, err := parseOptionalUintQuery(c, "plan_id")
	if err != nil {
		return f, err
	}
	f.PlanID = planID

	roleUserID, err := parseOptionalUintQuery(c, "role_user_id")
	if err != nil {
		return f, err
	}
	f.RoleUserID = roleUserID

	if hasDebt := strings.TrimSpace(c.Query("has_debt")); hasDebt != "" {
		v, err := strconv.ParseBool(hasDebt)
		if err != nil {
			return f, errors.New("invalid has_debt")
		}
		f.HasDebt = v
	}

	return f, nil
}

// Schools handles GET /students/schools — distinct school names for the filter dropdown.
// @Summary      List school names
// @Tags         students
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Failure      500  {object}  map[string]string
// @Router       /students/schools [get]
func (h *StudentHandler) Schools(c *gin.Context) {
	names, err := h.service.SchoolNames(c.Request.Context(), middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load school names"})
		return
	}
	if names == nil {
		names = []string{}
	}
	c.JSON(http.StatusOK, gin.H{"data": names})
}

// List handles GET /students
// @Summary      List students
// @Description  List students with optional search and pagination
// @Tags         students
// @Security     BearerAuth
// @Produce      json
// @Param        page          query     int     false "Page number (1-based)" default(1)
// @Param        page_size     query     int     false "Page size" default(20)
// @Param        search        query     string  false "Search by name, parent name, school, phone or email"
// @Param        status        query     string  false "Filter by status: ACTIVE, INACTIVE or DELETED"
// @Param        advisor_id    query     int     false "Filter by advisor user id"
// @Param        billing_mode  query     string  false "Filter by SINGLE_SESSION, MONTHLY or SCHOOL_ENROLLMENT"
// @Param        school_name   query     string  false "Filter by exact school name"
// @Param        plan_id       query     int     false "Filter by current plan id"
// @Param        role_user_id  query     int     false "Filter by a user having a role payout share"
// @Param        has_debt      query     bool    false "Only students with a negative balance"
// @Param        sort          query     string  false "newest (default), oldest, name, name_desc"
// @Success      200        {object}  map[string]interface{}
// @Failure      400        {object}  map[string]string
// @Failure      401        {object}  map[string]string
// @Failure      500        {object}  map[string]string
// @Router       /students [get]
func (h *StudentHandler) List(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "20")

	page, err := strconv.Atoi(pageStr)
	if err != nil || page <= 0 {
		page = 1
	}
	pageSize, err := strconv.Atoi(pageSizeStr)
	if err != nil || pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > maxStudentPageSize {
		pageSize = maxStudentPageSize
	}
	offset := (page - 1) * pageSize

	filter, err := studentListFilterFromQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var (
		students []models.Student
		total    int64
		docs     []StudentDoc
	)
	if filter.HasDebt {
		// Debt depends on the billing schedule (months since registration), so it is
		// evaluated in Go over every matching row, then paginated.
		filter.HasDebt = false
		all, _, lErr := h.service.List(c.Request.Context(), 100000, 0, filter)
		if lErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت لیست دانش‌آموزان"})
			return
		}
		allDocs := toStudentDocSlice(all)
		h.applyRemainingToStudentDocs(c.Request.Context(), allDocs, all)
		for i := range allDocs {
			if allDocs[i].TotalRemainingCents > 0 {
				docs = append(docs, allDocs[i])
			}
		}
		total = int64(len(docs))
		if offset >= len(docs) {
			docs = []StudentDoc{}
		} else {
			end := offset + pageSize
			if end > len(docs) {
				end = len(docs)
			}
			docs = docs[offset:end]
		}
	} else {
		var lErr error
		students, total, lErr = h.service.List(c.Request.Context(), pageSize, offset, filter)
		if lErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت لیست دانش‌آموزان"})
			return
		}
		docs = toStudentDocSlice(students)
		h.applyRemainingToStudentDocs(c.Request.Context(), docs, students)
	}
	totalPages := int((total + int64(pageSize) - 1) / int64(pageSize))

	c.JSON(http.StatusOK, gin.H{
		"data": docs,
		"meta": gin.H{
			"page":        page,
			"page_size":   pageSize,
			"total_items": total,
			"total_pages": totalPages,
		},
	})
}

// Summary handles GET /students/summary
// @Summary      Students summary
// @Description  Summary counts for students (total, active, inactive, debtors)
// @Tags         students
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  StudentStatsDoc
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /students/summary [get]
func (h *StudentHandler) Summary(c *gin.Context) {
	ctx := c.Request.Context()
	scope := middleware.DataScopeUserID(c)
	total, active, inactive, deleted, _, err := h.service.Stats(ctx, scope)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load students summary"})
		return
	}
	var debtors int64
	if h.payments != nil {
		debtors, err = h.payments.CountActiveStudentDebtors(ctx, scope)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load students summary"})
			return
		}
	}

	c.JSON(http.StatusOK, StudentStatsDoc{
		Total:    total,
		Active:   active,
		Inactive: inactive,
		Deleted:  deleted,
		Debtors:  debtors,
	})
}

// Get handles GET /students/:id
// @Summary      Get student
// @Description  Get student by ID
// @Tags         students
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      int  true "Student ID"
// @Success      200  {object}  StudentDoc
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Router       /students/{id} [get]
func (h *StudentHandler) Get(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	student, err := h.service.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "دانش‌آموز یافت نشد"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil {
		ok, err := h.service.IsStudentVisibleToUser(c.Request.Context(), uint(id), *scope)
		if err != nil || !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "دانش‌آموز یافت نشد"})
			return
		}
	}

	c.JSON(http.StatusOK, h.studentDocWithRemaining(c.Request.Context(), student))
}

// Create handles POST /students
// @Summary      Create student
// @Description  Create a new student
// @Tags         students
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      map[string]string true "Student data"
// @Success      201   {object}  StudentDoc
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /students [post]
func (h *StudentHandler) Create(c *gin.Context) {
	var payload struct {
		FirstName                   string                     `json:"first_name" binding:"required,min=2,max=100"`
		LastName                    string                     `json:"last_name" binding:"required,min=2,max=100"`
		Email                       string                     `json:"email" binding:"omitempty,email,max=255"`
		Phone                       string                     `json:"phone" binding:"omitempty,max=20"`
		FatherName                  string                     `json:"father_name" binding:"omitempty,max=100"`
		MotherName                  string                     `json:"mother_name" binding:"omitempty,max=100"`
		FatherPhone                 string                     `json:"father_phone" binding:"omitempty,max=20"`
		MotherPhone                 string                     `json:"mother_phone" binding:"omitempty,max=20"`
		FatherJob                   string                     `json:"father_job" binding:"omitempty,max=120"`
		MotherJob                   string                     `json:"mother_job" binding:"omitempty,max=120"`
		SchoolName                  string                     `json:"school_name" binding:"omitempty,max=200"`
		SchoolAddress               string                     `json:"school_address" binding:"omitempty,max=500"`
		HomeAddress                 string                     `json:"home_address" binding:"omitempty,max=500"`
		RegistrationChannel         string                     `json:"registration_channel" binding:"omitempty,oneof=PRIVATE SCHOOL"`
		SchoolContractID            *uint                      `json:"school_contract_id" binding:"omitempty"`
		DeliveryMode                string                     `json:"delivery_mode" binding:"omitempty,oneof=ONLINE IN_PERSON"`
		AdvisorID                   *uint                      `json:"advisor_id" binding:"omitempty"`
		AdvisorCommissionKind       string                     `json:"advisor_commission_kind" binding:"omitempty,oneof=NONE PERCENT FIXED_PER_PAYMENT PERCENT_OF_CONTRACT FIXED_MONTHLY"`
		AdvisorCommissionPercent    *float64                   `json:"advisor_commission_percent" binding:"omitempty"`
		AdvisorCommissionFixedCents *int64                     `json:"advisor_commission_fixed_cents" binding:"omitempty"`
		EnrollmentBillingMode       string                     `json:"enrollment_billing_mode" binding:"omitempty,oneof=SINGLE_SESSION MONTHLY SCHOOL_ENROLLMENT"`
		AdvisorAccrualMonths        *int                       `json:"advisor_accrual_months" binding:"omitempty,min=1,max=24"`
		AdvisorAccrualMonthMask     *int                       `json:"advisor_accrual_month_mask" binding:"omitempty,min=1,max=4095"`
		CurrentPlanID               *uint                      `json:"current_plan_id" binding:"omitempty"`
		EnrollmentAmountCents       int64                      `json:"enrollment_amount_cents" binding:"omitempty,min=0"`
		BalanceCents                *int64                     `json:"balance_cents" binding:"omitempty"`
		AdvisoryStartDate           string                     `json:"advisory_start_date" binding:"omitempty"`
		RolePayouts                 []studentRolePayoutPayload `json:"role_payouts"`
	}

	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	channel := models.RegistrationChannelPrivate
	if payload.RegistrationChannel != "" {
		channel = models.RegistrationChannel(payload.RegistrationChannel)
	}

	student := &models.Student{
		FirstName:           payload.FirstName,
		LastName:            payload.LastName,
		Email:               payload.Email,
		Phone:               payload.Phone,
		FatherName:          payload.FatherName,
		MotherName:          payload.MotherName,
		FatherPhone:         payload.FatherPhone,
		MotherPhone:         payload.MotherPhone,
		FatherJob:           payload.FatherJob,
		MotherJob:           payload.MotherJob,
		SchoolName:          payload.SchoolName,
		SchoolAddress:       payload.SchoolAddress,
		HomeAddress:         payload.HomeAddress,
		RegistrationChannel: channel,
	}
	if scope := middleware.DataScopeUserID(c); scope != nil {
		uid := *scope
		if payload.AdvisorID != nil && *payload.AdvisorID != uid {
			c.JSON(http.StatusForbidden, gin.H{"error": "cannot assign another advisor"})
			return
		}
		student.AdvisorID = &uid
	} else if payload.AdvisorID != nil {
		student.AdvisorID = payload.AdvisorID
	}

	joinDate, err := advisoryStartDateForCreate(payload.AdvisoryStartDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	student.JoinDate = joinDate

	if channel == models.RegistrationChannelSchool {
		if payload.SchoolContractID == nil || *payload.SchoolContractID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "برای ثبت‌نام مدرسه‌ای، انتخاب قرارداد مدرسه الزامی است"})
			return
		}
		if h.schoolContracts == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "school contracts unavailable"})
			return
		}
		contract, _, err := h.schoolContracts.GetByID(c.Request.Context(), *payload.SchoolContractID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "قرارداد مدرسه یافت نشد"})
			return
		}
		student.SchoolContractID = payload.SchoolContractID
		student.SchoolName = contract.SchoolName
		student.SchoolAddress = ""
		student.DeliveryMode = ""
		if payload.CurrentPlanID != nil {
			student.CurrentPlanID = payload.CurrentPlanID
		}
		if payload.BalanceCents != nil {
			student.BalanceCents = *payload.BalanceCents
		}
		student.EnrollmentAmountCents = payload.EnrollmentAmountCents
		applyEnrollmentBillingPayload(student, payload.EnrollmentBillingMode, payload.AdvisorAccrualMonths, payload.AdvisorAccrualMonthMask, true)
		applyAdvisorCommissionPayload(student, payload.AdvisorCommissionKind, payload.AdvisorCommissionPercent, payload.AdvisorCommissionFixedCents, true)
		if err := normalizeStudentAdvisorCommission(student); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	} else {
		if payload.DeliveryMode == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "نحوه برگزاری (آنلاین یا حضوری) الزامی است"})
			return
		}
		student.DeliveryMode = models.DeliveryMode(payload.DeliveryMode)
		student.SchoolContractID = nil
		if payload.CurrentPlanID != nil {
			student.CurrentPlanID = payload.CurrentPlanID
		}
		if payload.BalanceCents != nil {
			student.BalanceCents = *payload.BalanceCents
		}
		student.EnrollmentAmountCents = payload.EnrollmentAmountCents
		applyEnrollmentBillingPayload(student, payload.EnrollmentBillingMode, payload.AdvisorAccrualMonths, payload.AdvisorAccrualMonthMask, true)
		applyAdvisorCommissionPayload(student, payload.AdvisorCommissionKind, payload.AdvisorCommissionPercent, payload.AdvisorCommissionFixedCents, true)
		if err := normalizeStudentAdvisorCommission(student); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	if err := h.service.Create(c.Request.Context(), student); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ثبت دانش‌آموز با خطا مواجه شد"})
		return
	}
	rows, err := normalizeStudentRolePayoutPayloads(payload.RolePayouts)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.service.ReplaceStudentRolePayouts(c.Request.Context(), student.ID, rows); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save role payouts"})
		return
	}

	enrollCents := payload.EnrollmentAmountCents
	if err := h.service.SyncEnrollmentForStudent(c.Request.Context(), student.ID, enrollCents); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to sync enrollment for plan"})
		return
	}

	if h.payments != nil {
		_ = h.payments.RecalculatePaidSharesForStudent(c.Request.Context(), student.ID)
	}

	fresh, _ := h.service.GetByID(c.Request.Context(), student.ID)
	if fresh != nil {
		student = fresh
	}
	c.JSON(http.StatusCreated, h.studentDocWithRemaining(c.Request.Context(), student))
}

// Update handles PUT /students/:id
// @Summary      Update student
// @Description  Update an existing student
// @Tags         students
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path      int                true  "Student ID"
// @Param        body  body      map[string]string  true  "Student data"
// @Success      200   {object}  StudentDoc
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      404   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /students/{id} [put]
func (h *StudentHandler) Update(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	var payload struct {
		FirstName                   string                     `json:"first_name" binding:"required,min=2,max=100"`
		LastName                    string                     `json:"last_name" binding:"required,min=2,max=100"`
		Email                       string                     `json:"email" binding:"omitempty,email,max=255"`
		Phone                       string                     `json:"phone" binding:"omitempty,max=20"`
		FatherName                  string                     `json:"father_name" binding:"omitempty,max=100"`
		MotherName                  string                     `json:"mother_name" binding:"omitempty,max=100"`
		FatherPhone                 string                     `json:"father_phone" binding:"omitempty,max=20"`
		MotherPhone                 string                     `json:"mother_phone" binding:"omitempty,max=20"`
		FatherJob                   string                     `json:"father_job" binding:"omitempty,max=120"`
		MotherJob                   string                     `json:"mother_job" binding:"omitempty,max=120"`
		SchoolName                  string                     `json:"school_name" binding:"omitempty,max=200"`
		SchoolAddress               string                     `json:"school_address" binding:"omitempty,max=500"`
		HomeAddress                 string                     `json:"home_address" binding:"omitempty,max=500"`
		RegistrationChannel         string                     `json:"registration_channel" binding:"omitempty,oneof=PRIVATE SCHOOL"`
		SchoolContractID            *uint                      `json:"school_contract_id" binding:"omitempty"`
		DeliveryMode                string                     `json:"delivery_mode" binding:"omitempty,oneof=ONLINE IN_PERSON"`
		Status                      string                     `json:"status" binding:"omitempty,oneof=ACTIVE INACTIVE DELETED"`
		AdvisorID                   *uint                      `json:"advisor_id" binding:"omitempty"`
		AdvisorCommissionKind       string                     `json:"advisor_commission_kind" binding:"omitempty,oneof=NONE PERCENT FIXED_PER_PAYMENT PERCENT_OF_CONTRACT FIXED_MONTHLY"`
		AdvisorCommissionPercent    *float64                   `json:"advisor_commission_percent" binding:"omitempty"`
		AdvisorCommissionFixedCents *int64                     `json:"advisor_commission_fixed_cents" binding:"omitempty"`
		EnrollmentBillingMode       string                     `json:"enrollment_billing_mode" binding:"omitempty,oneof=SINGLE_SESSION MONTHLY SCHOOL_ENROLLMENT"`
		AdvisorAccrualMonths        *int                       `json:"advisor_accrual_months" binding:"omitempty,min=1,max=24"`
		AdvisorAccrualMonthMask     *int                       `json:"advisor_accrual_month_mask" binding:"omitempty,min=1,max=4095"`
		CurrentPlanID               *uint                      `json:"current_plan_id" binding:"omitempty"`
		EnrollmentAmountCents       int64                      `json:"enrollment_amount_cents" binding:"omitempty,min=0"`
		BalanceCents                *int64                     `json:"balance_cents" binding:"omitempty"`
		AdvisoryStartDate           *string                    `json:"advisory_start_date,omitempty"`
		RolePayouts                 []studentRolePayoutPayload `json:"role_payouts"`
	}

	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	student, err := h.service.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "دانش‌آموز یافت نشد"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil {
		ok, err := h.service.IsStudentVisibleToUser(c.Request.Context(), uint(id), *scope)
		if err != nil || !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "دانش‌آموز یافت نشد"})
			return
		}
	}

	channel := student.RegistrationChannel
	if channel == "" {
		channel = models.RegistrationChannelPrivate
	}
	if payload.RegistrationChannel != "" {
		channel = models.RegistrationChannel(payload.RegistrationChannel)
	}

	student.FirstName = payload.FirstName
	student.LastName = payload.LastName
	student.Email = payload.Email
	student.Phone = payload.Phone
	student.FatherName = payload.FatherName
	student.MotherName = payload.MotherName
	student.FatherPhone = payload.FatherPhone
	student.MotherPhone = payload.MotherPhone
	student.FatherJob = payload.FatherJob
	student.MotherJob = payload.MotherJob
	student.SchoolAddress = payload.SchoolAddress
	student.HomeAddress = payload.HomeAddress
	student.RegistrationChannel = channel
	if payload.Status != "" {
		setStudentStatus(student, models.StudentStatus(payload.Status))
	}
	if middleware.DataScopeUserID(c) == nil {
		if payload.AdvisorID != nil {
			student.AdvisorID = payload.AdvisorID
		} else {
			student.AdvisorID = nil
		}
	}
	if payload.AdvisoryStartDate != nil {
		if err := applyAdvisoryStartDateUpdate(student, *payload.AdvisoryStartDate); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	enrollCents := payload.EnrollmentAmountCents
	if channel == models.RegistrationChannelSchool {
		cid := payload.SchoolContractID
		if cid == nil || *cid == 0 {
			cid = student.SchoolContractID
		}
		if cid == nil || *cid == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "برای ثبت‌نام مدرسه‌ای، انتخاب قرارداد مدرسه الزامی است"})
			return
		}
		if h.schoolContracts == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "school contracts unavailable"})
			return
		}
		contract, _, err := h.schoolContracts.GetByID(c.Request.Context(), *cid)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "قرارداد مدرسه یافت نشد"})
			return
		}
		student.SchoolContractID = cid
		student.SchoolName = contract.SchoolName
		student.SchoolAddress = ""
		student.DeliveryMode = ""
		if payload.CurrentPlanID != nil {
			student.CurrentPlanID = payload.CurrentPlanID
		} else {
			student.CurrentPlanID = nil
		}
		if payload.BalanceCents != nil {
			student.BalanceCents = *payload.BalanceCents
		}
		student.EnrollmentAmountCents = payload.EnrollmentAmountCents
		if payload.EnrollmentBillingMode != "" || payload.AdvisorAccrualMonths != nil || payload.AdvisorAccrualMonthMask != nil {
			applyEnrollmentBillingPayload(student, payload.EnrollmentBillingMode, payload.AdvisorAccrualMonths, payload.AdvisorAccrualMonthMask, false)
		}
		applyAdvisorCommissionPayload(student, payload.AdvisorCommissionKind, payload.AdvisorCommissionPercent, payload.AdvisorCommissionFixedCents, false)
		if err := normalizeStudentAdvisorCommission(student); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	} else {
		student.SchoolContractID = nil
		student.SchoolName = payload.SchoolName
		if payload.DeliveryMode != "" {
			student.DeliveryMode = models.DeliveryMode(payload.DeliveryMode)
		} else if student.DeliveryMode == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "نحوه برگزاری (آنلاین یا حضوری) الزامی است"})
			return
		}
		if payload.CurrentPlanID != nil {
			student.CurrentPlanID = payload.CurrentPlanID
		} else {
			student.CurrentPlanID = nil
		}
		if payload.BalanceCents != nil {
			student.BalanceCents = *payload.BalanceCents
		}
		student.EnrollmentAmountCents = payload.EnrollmentAmountCents
		if payload.EnrollmentBillingMode != "" || payload.AdvisorAccrualMonths != nil || payload.AdvisorAccrualMonthMask != nil {
			applyEnrollmentBillingPayload(student, payload.EnrollmentBillingMode, payload.AdvisorAccrualMonths, payload.AdvisorAccrualMonthMask, false)
		}
		applyAdvisorCommissionPayload(student, payload.AdvisorCommissionKind, payload.AdvisorCommissionPercent, payload.AdvisorCommissionFixedCents, false)
		if err := normalizeStudentAdvisorCommission(student); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	if err := h.service.Update(c.Request.Context(), student); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ویرایش دانش‌آموز با خطا مواجه شد"})
		return
	}
	rows, err := normalizeStudentRolePayoutPayloads(payload.RolePayouts)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.service.ReplaceStudentRolePayouts(c.Request.Context(), student.ID, rows); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save role payouts"})
		return
	}

	if err := h.service.SyncEnrollmentForStudent(c.Request.Context(), uint(id), enrollCents); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to sync enrollment for plan"})
		return
	}

	if h.payments != nil {
		_ = h.payments.RecalculatePaidSharesForStudent(c.Request.Context(), uint(id))
	}

	updated, _ := h.service.GetByID(c.Request.Context(), uint(id))
	if updated != nil {
		student = updated
	}
	c.JSON(http.StatusOK, h.studentDocWithRemaining(c.Request.Context(), student))
}

// Delete handles DELETE /students/:id
// @Summary      Delete student
// @Description  Soft delete a student
// @Tags         students
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      int  true "Student ID"
// @Success      204  "No Content"
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /students/{id} [delete]
func (h *StudentHandler) Delete(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil {
		ok, err := h.service.IsStudentVisibleToUser(c.Request.Context(), uint(id), *scope)
		if err != nil || !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "دانش‌آموز یافت نشد"})
			return
		}
	}

	if err := h.service.Delete(c.Request.Context(), uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete student"})
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *StudentHandler) HardDelete(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil {
		ok, err := h.service.IsStudentVisibleToUser(c.Request.Context(), uint(id), *scope)
		if err != nil || !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "دانش‌آموز یافت نشد"})
			return
		}
	}

	ctx := c.Request.Context()
	var periods [][2]int
	if h.payments != nil {
		periods, _ = h.payments.PayrollPeriodsAffectedByStudent(ctx, uint(id))
	}

	if err := h.service.HardDelete(ctx, uint(id)); err != nil {
		if errors.Is(err, services.ErrStudentMustBeDeletedFirst) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "این دانش‌آموز پرداخت ثبت‌شده دارد. ابتدا با «حذف» به وضعیت حذف‌شده منتقل کنید، سپس «حذف کامل» را بزنید تا پرداخت‌ها هم پاک شوند."})
			return
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "دانش‌آموز یافت نشد"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to permanently delete student"})
		return
	}

	if h.payments != nil && len(periods) > 0 {
		h.payments.RecalculatePayrollPeriods(ctx, periods)
	}

	c.Status(http.StatusNoContent)
}

// setStudentStatus changes status and keeps EndDate in sync: leaving ACTIVE stamps today,
// coming back to ACTIVE clears it so monthly billing resumes.
func setStudentStatus(st *models.Student, status models.StudentStatus) {
	if st.Status == status {
		return
	}
	if status == models.StudentStatusActive {
		st.EndDate = nil
	} else if st.Status == models.StudentStatusActive || st.EndDate == nil {
		t := todayLocalMidnight()
		st.EndDate = &t
	}
	st.Status = status
}

func todayLocalMidnight() time.Time {
	now := time.Now()
	y, m, d := now.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, now.Location())
}

// advisoryStartDateForCreate: empty payload → today at local midnight; else parse YYYY-MM-DD.
func advisoryStartDateForCreate(s string) (*time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		t := todayLocalMidnight()
		return &t, nil
	}
	t, err := time.ParseInLocation("2006-01-02", s, time.Local)
	if err != nil {
		return nil, fmt.Errorf("تاریخ شروع مشاوره نامعتبر است (فرمت: YYYY-MM-DD)")
	}
	return &t, nil
}

func applyAdvisoryStartDateUpdate(st *models.Student, raw string) error {
	v := strings.TrimSpace(raw)
	if v == "" {
		st.JoinDate = nil
		return nil
	}
	t, err := time.ParseInLocation("2006-01-02", v, time.Local)
	if err != nil {
		return fmt.Errorf("تاریخ شروع مشاوره نامعتبر است (فرمت: YYYY-MM-DD)")
	}
	st.JoinDate = &t
	return nil
}

func applyEnrollmentBillingPayload(st *models.Student, mode string, accrualMonths, accrualMonthMask *int, isCreate bool) {
	if mode != "" {
		st.EnrollmentBillingMode = models.EnrollmentBillingMode(strings.ToUpper(strings.TrimSpace(mode)))
	} else if isCreate || st.EnrollmentBillingMode == "" {
		st.EnrollmentBillingMode = models.EnrollmentBillingMonthly
	}
	if !st.IsSchoolEnrollment() {
		st.AdvisorAccrualMonths = nil
		st.AdvisorAccrualMonthMask = nil
		return
	}
	if accrualMonthMask != nil && *accrualMonthMask > 0 {
		mask := *accrualMonthMask & 0xFFF
		st.AdvisorAccrualMonthMask = &mask
		n := models.AdvisorAccrualMonthMaskCount(mask)
		st.AdvisorAccrualMonths = &n
		return
	}
	st.AdvisorAccrualMonthMask = nil
	if accrualMonths != nil {
		st.AdvisorAccrualMonths = accrualMonths
	} else if isCreate && st.AdvisorAccrualMonths == nil {
		defaultMonths := 10
		st.AdvisorAccrualMonths = &defaultMonths
	}
}

func applyAdvisorCommissionPayload(st *models.Student, kind string, pct *float64, fix *int64, isCreate bool) {
	if st.AdvisorID == nil {
		st.AdvisorCommissionKind = models.StudentAdvisorCommNone
		st.AdvisorCommissionPercent = nil
		st.AdvisorCommissionFixedCents = nil
		return
	}
	if kind != "" {
		st.AdvisorCommissionKind = models.StudentAdvisorCommissionKind(strings.ToUpper(strings.TrimSpace(kind)))
	} else if isCreate {
		st.AdvisorCommissionKind = models.StudentAdvisorCommNone
	}
	if pct != nil {
		st.AdvisorCommissionPercent = pct
	}
	if fix != nil {
		st.AdvisorCommissionFixedCents = fix
	}
}

func normalizeStudentAdvisorCommission(st *models.Student) error {
	if st.AdvisorID == nil {
		st.AdvisorCommissionKind = models.StudentAdvisorCommNone
		st.AdvisorCommissionPercent = nil
		st.AdvisorCommissionFixedCents = nil
		return nil
	}
	if st.EnrollmentBillingMode == "" {
		st.EnrollmentBillingMode = models.EnrollmentBillingMonthly
	}
	if st.AdvisorCommissionKind == "" {
		st.AdvisorCommissionKind = models.StudentAdvisorCommNone
	}
	if st.IsSchoolEnrollment() {
		if st.EnrollmentAmountCents <= 0 {
			return fmt.Errorf("برای ثبت‌نام سالانه، مبلغ کل قرارداد الزامی است")
		}
		if st.JoinDate == nil {
			return fmt.Errorf("برای ثبت‌نام سالانه، تاریخ شروع مشاوره الزامی است")
		}
		if st.AdvisorAccrualMonthMask == nil || *st.AdvisorAccrualMonthMask <= 0 {
			if st.AdvisorAccrualMonths == nil || *st.AdvisorAccrualMonths <= 0 {
				defaultMonths := 10
				st.AdvisorAccrualMonths = &defaultMonths
			}
		} else if models.AdvisorAccrualMonthMaskCount(*st.AdvisorAccrualMonthMask) == 0 {
			return fmt.Errorf("حداقل یک ماه برای پرداخت حقوق مشاور انتخاب کنید")
		}
		switch st.AdvisorCommissionKind {
		case models.StudentAdvisorCommNone:
			st.AdvisorCommissionPercent = nil
			st.AdvisorCommissionFixedCents = nil
			return nil
		case models.StudentAdvisorCommPercentOfContract:
			if st.AdvisorCommissionPercent == nil || *st.AdvisorCommissionPercent <= 0 || *st.AdvisorCommissionPercent > 100 {
				return fmt.Errorf("درصد سهم کل مشاور از قرارداد باید بین ۰ و ۱۰۰ باشد")
			}
			st.AdvisorCommissionFixedCents = nil
			return nil
		case models.StudentAdvisorCommFixedMonthly:
			if st.AdvisorCommissionFixedCents == nil || *st.AdvisorCommissionFixedCents <= 0 {
				return fmt.Errorf("سهم ماهانه مشاور نامعتبر است")
			}
			st.AdvisorCommissionPercent = nil
			return nil
		default:
			return fmt.Errorf("برای ثبت‌نام سالانه، نوع سهم مشاور باید «درصد از قرارداد» یا «مبلغ ماهانه ثابت» باشد")
		}
	}
	if st.IsSingleSession() {
		if st.EnrollmentAmountCents <= 0 {
			return fmt.Errorf("برای ثبت‌نام تک‌جلسه‌ای، مبلغ ثبت‌نام الزامی است")
		}
	}
	// Per-payment billing (monthly + single session)
	st.AdvisorAccrualMonths = nil
	st.AdvisorAccrualMonthMask = nil
	switch st.AdvisorCommissionKind {
	case models.StudentAdvisorCommNone:
		st.AdvisorCommissionPercent = nil
		st.AdvisorCommissionFixedCents = nil
		return nil
	case models.StudentAdvisorCommPercent:
		if st.AdvisorCommissionPercent == nil || *st.AdvisorCommissionPercent <= 0 || *st.AdvisorCommissionPercent > 100 {
			return fmt.Errorf("درصد سهم مشاور باید بین ۰ و ۱۰۰ باشد")
		}
		st.AdvisorCommissionFixedCents = nil
		return nil
	case models.StudentAdvisorCommFixed:
		if st.AdvisorCommissionFixedCents == nil || *st.AdvisorCommissionFixedCents < 0 {
			return fmt.Errorf("مبلغ ثابت سهم مشاور برای هر پرداخت نامعتبر است")
		}
		st.AdvisorCommissionPercent = nil
		return nil
	default:
		return fmt.Errorf("نوع سهم مشاور نامعتبر است")
	}
}

type studentRolePayoutPayload struct {
	RoleID     uint     `json:"role_id"`
	UserID     uint     `json:"user_id"`
	AmountKind string   `json:"amount_kind"`
	Percent    *float64 `json:"percent"`
	FixedCents *int64   `json:"fixed_cents"`
}

func normalizeStudentRolePayoutPayloads(items []studentRolePayoutPayload) ([]models.StudentRolePayout, error) {
	if len(items) == 0 {
		return nil, nil
	}
	rows := make([]models.StudentRolePayout, 0, len(items))
	seen := map[uint]struct{}{}
	var sumPercent float64
	for i, it := range items {
		if it.RoleID == 0 || it.UserID == 0 {
			return nil, fmt.Errorf("ردیف %d سهم نقش/کاربر ناقص است", i+1)
		}
		if _, ok := seen[it.UserID]; ok {
			return nil, fmt.Errorf("کاربر تکراری در سهم‌های نقش ثبت شده است")
		}
		seen[it.UserID] = struct{}{}
		kind := models.StudentAdvisorCommissionKind(strings.ToUpper(strings.TrimSpace(it.AmountKind)))
		row := models.StudentRolePayout{
			RoleID:     it.RoleID,
			UserID:     it.UserID,
			AmountKind: kind,
		}
		switch kind {
		case models.StudentAdvisorCommPercent:
			if it.Percent == nil || *it.Percent <= 0 || *it.Percent > 100 {
				return nil, fmt.Errorf("درصد سهم نقش/کاربر در ردیف %d نامعتبر است", i+1)
			}
			sumPercent += *it.Percent
			row.Percent = it.Percent
		case models.StudentAdvisorCommFixed:
			if it.FixedCents == nil || *it.FixedCents < 0 {
				return nil, fmt.Errorf("مبلغ ثابت سهم نقش/کاربر در ردیف %d نامعتبر است", i+1)
			}
			row.FixedCents = it.FixedCents
		default:
			return nil, fmt.Errorf("نوع سهم نقش/کاربر در ردیف %d نامعتبر است", i+1)
		}
		rows = append(rows, row)
	}
	if sumPercent > 100 {
		return nil, fmt.Errorf("جمع درصد سهم‌های نقش/کاربر نمی‌تواند از ۱۰۰ بیشتر باشد")
	}
	return rows, nil
}

type studentCommissionSnap struct {
	advisorID *uint
	kind      models.StudentAdvisorCommissionKind
	pct       *float64
	fix       *int64
}

func snapshotStudentCommission(st *models.Student) studentCommissionSnap {
	var aid *uint
	if st.AdvisorID != nil {
		v := *st.AdvisorID
		aid = &v
	}
	var pct *float64
	if st.AdvisorCommissionPercent != nil {
		v := *st.AdvisorCommissionPercent
		pct = &v
	}
	var fix *int64
	if st.AdvisorCommissionFixedCents != nil {
		v := *st.AdvisorCommissionFixedCents
		fix = &v
	}
	return studentCommissionSnap{
		advisorID: aid,
		kind:      st.AdvisorCommissionKind,
		pct:       pct,
		fix:       fix,
	}
}

func (s studentCommissionSnap) equals(st *models.Student) bool {
	return uintPtrEqual(s.advisorID, st.AdvisorID) &&
		s.kind == st.AdvisorCommissionKind &&
		floatPtrEqual(s.pct, st.AdvisorCommissionPercent) &&
		int64PtrEqual(s.fix, st.AdvisorCommissionFixedCents)
}

func uintPtrEqual(a, b *uint) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

func floatPtrEqual(a, b *float64) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

func int64PtrEqual(a, b *int64) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}
