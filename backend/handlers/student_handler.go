package handlers

import (
	"context"
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

// StudentHandler exposes student-related endpoints.
type StudentHandler struct {
	service  *services.StudentService
	payments *services.PaymentService
}

func NewStudentHandler(service *services.StudentService, payments *services.PaymentService) *StudentHandler {
	return &StudentHandler{service: service, payments: payments}
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
	SchoolName    string `json:"school_name,omitempty"`
	SchoolAddress string `json:"school_address,omitempty"`
	HomeAddress   string `json:"home_address,omitempty"`
	AdvisorName   string `json:"advisor_name,omitempty"`
	AdvisorID     *uint  `json:"advisor_id,omitempty"`
	// Per paid payment: how the assigned advisor is compensated (see models.StudentAdvisorCommissionKind).
	AdvisorCommissionKind       string   `json:"advisor_commission_kind,omitempty"`
	AdvisorCommissionPercent    *float64 `json:"advisor_commission_percent,omitempty"`
	AdvisorCommissionFixedCents *int64   `json:"advisor_commission_fixed_cents,omitempty"`
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
	// AdvisoryStartDate is JoinDate as YYYY-MM-DD (تاریخ شروع مشاوره).
	AdvisoryStartDate string                 `json:"advisory_start_date,omitempty"`
	RolePayouts       []StudentRolePayoutDoc `json:"role_payouts,omitempty"`
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
		SchoolName:                  s.SchoolName,
		SchoolAddress:               s.SchoolAddress,
		HomeAddress:                 s.HomeAddress,
		BalanceCents:                s.BalanceCents,
		AdvisorID:                   s.AdvisorID,
		AdvisorCommissionKind:       string(s.AdvisorCommissionKind),
		AdvisorCommissionPercent:    s.AdvisorCommissionPercent,
		AdvisorCommissionFixedCents: s.AdvisorCommissionFixedCents,
		CurrentPlanID:               s.CurrentPlanID,
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

func effectiveEnrollmentCents(s *models.Student) int64 {
	if s.EnrollmentAmountCents > 0 {
		return s.EnrollmentAmountCents
	}
	if len(s.Enrollments) > 0 {
		return s.Enrollments[0].PriceCents
	}
	return 0
}

func computeRemainingBalanceCents(s *models.Student, paidSum, openSum int64) int64 {
	enroll := effectiveEnrollmentCents(s)
	if enroll > 0 {
		return enroll - paidSum
	}
	return openSum
}

func (h *StudentHandler) studentDocWithRemaining(ctx context.Context, s *models.Student) StudentDoc {
	doc := toStudentDoc(s)
	if h.payments == nil {
		return doc
	}
	paid, open, err := h.payments.PaymentTotalsByStudentIDs(ctx, []uint{s.ID})
	if err != nil {
		return doc
	}
	doc.PaidTotalCents = paid[s.ID]
	doc.RemainingBalanceCents = computeRemainingBalanceCents(s, paid[s.ID], open[s.ID])
	return doc
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
		docs[i].PaidTotalCents = paid[id]
		docs[i].RemainingBalanceCents = computeRemainingBalanceCents(&students[i], paid[id], open[id])
	}
}

// StudentStatsDoc represents summary stats for the Students page.
type StudentStatsDoc struct {
	Total    int64 `json:"total"`
	Active   int64 `json:"active"`
	Inactive int64 `json:"inactive"`
	Deleted  int64 `json:"deleted"`
	Debtors  int64 `json:"debtors"`
}

// List handles GET /students
// @Summary      List students
// @Description  List students with optional search and pagination
// @Tags         students
// @Security     BearerAuth
// @Produce      json
// @Param        page       query     int     false "Page number (1-based)" default(1)
// @Param        page_size  query     int     false "Page size" default(20)
// @Param        search     query     string  false "Search by name, phone or email"
// @Success      200        {object}  map[string]interface{}
// @Failure      400        {object}  map[string]string
// @Failure      401        {object}  map[string]string
// @Failure      500        {object}  map[string]string
// @Router       /students [get]
func (h *StudentHandler) List(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "20")
	search := c.DefaultQuery("search", "")

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

	students, total, err := h.service.List(c.Request.Context(), pageSize, offset, search, middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list students"})
		return
	}

	docs := toStudentDocSlice(students)
	h.applyRemainingToStudentDocs(c.Request.Context(), docs, students)
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
	total, active, inactive, deleted, debtors, err := h.service.Stats(c.Request.Context(), middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load students summary"})
		return
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	student, err := h.service.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "student not found"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil {
		ok, err := h.service.IsStudentVisibleToUser(c.Request.Context(), uint(id), *scope)
		if err != nil || !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "student not found"})
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
		AdvisorID                   *uint                      `json:"advisor_id" binding:"omitempty"`
		AdvisorCommissionKind       string                     `json:"advisor_commission_kind" binding:"omitempty,oneof=NONE PERCENT FIXED_PER_PAYMENT"`
		AdvisorCommissionPercent    *float64                   `json:"advisor_commission_percent" binding:"omitempty"`
		AdvisorCommissionFixedCents *int64                     `json:"advisor_commission_fixed_cents" binding:"omitempty"`
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

	student := &models.Student{
		FirstName:     payload.FirstName,
		LastName:      payload.LastName,
		Email:         payload.Email,
		Phone:         payload.Phone,
		FatherName:    payload.FatherName,
		MotherName:    payload.MotherName,
		FatherPhone:   payload.FatherPhone,
		MotherPhone:   payload.MotherPhone,
		FatherJob:     payload.FatherJob,
		MotherJob:     payload.MotherJob,
		SchoolName:    payload.SchoolName,
		SchoolAddress: payload.SchoolAddress,
		HomeAddress:   payload.HomeAddress,
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
	if payload.CurrentPlanID != nil {
		student.CurrentPlanID = payload.CurrentPlanID
	}
	if payload.BalanceCents != nil {
		student.BalanceCents = *payload.BalanceCents
	}
	student.EnrollmentAmountCents = payload.EnrollmentAmountCents
	applyAdvisorCommissionPayload(student, payload.AdvisorCommissionKind, payload.AdvisorCommissionPercent, payload.AdvisorCommissionFixedCents, true)

	joinDate, err := advisoryStartDateForCreate(payload.AdvisoryStartDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	student.JoinDate = joinDate

	if err := normalizeStudentAdvisorCommission(student); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.Create(c.Request.Context(), student); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create student"})
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

	if err := h.service.SyncEnrollmentForStudent(c.Request.Context(), student.ID, payload.EnrollmentAmountCents); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to sync enrollment for plan"})
		return
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
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
		Status                      string                     `json:"status" binding:"omitempty,oneof=ACTIVE INACTIVE DELETED"`
		AdvisorID                   *uint                      `json:"advisor_id" binding:"omitempty"`
		AdvisorCommissionKind       string                     `json:"advisor_commission_kind" binding:"omitempty,oneof=NONE PERCENT FIXED_PER_PAYMENT"`
		AdvisorCommissionPercent    *float64                   `json:"advisor_commission_percent" binding:"omitempty"`
		AdvisorCommissionFixedCents *int64                     `json:"advisor_commission_fixed_cents" binding:"omitempty"`
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
		c.JSON(http.StatusNotFound, gin.H{"error": "student not found"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil {
		ok, err := h.service.IsStudentVisibleToUser(c.Request.Context(), uint(id), *scope)
		if err != nil || !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "student not found"})
			return
		}
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
	student.SchoolName = payload.SchoolName
	student.SchoolAddress = payload.SchoolAddress
	student.HomeAddress = payload.HomeAddress
	if payload.Status != "" {
		student.Status = models.StudentStatus(payload.Status)
	}
	if middleware.DataScopeUserID(c) == nil {
		if payload.AdvisorID != nil {
			student.AdvisorID = payload.AdvisorID
		} else {
			student.AdvisorID = nil
		}
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
	if payload.AdvisoryStartDate != nil {
		if err := applyAdvisoryStartDateUpdate(student, *payload.AdvisoryStartDate); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	applyAdvisorCommissionPayload(student, payload.AdvisorCommissionKind, payload.AdvisorCommissionPercent, payload.AdvisorCommissionFixedCents, false)

	if err := normalizeStudentAdvisorCommission(student); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.Update(c.Request.Context(), student); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update student"})
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

	if err := h.service.SyncEnrollmentForStudent(c.Request.Context(), uint(id), payload.EnrollmentAmountCents); err != nil {
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if scope := middleware.DataScopeUserID(c); scope != nil {
		ok, err := h.service.IsStudentVisibleToUser(c.Request.Context(), uint(id), *scope)
		if err != nil || !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "student not found"})
			return
		}
	}

	if err := h.service.Delete(c.Request.Context(), uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete student"})
		return
	}

	c.Status(http.StatusNoContent)
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
	if st.AdvisorCommissionKind == "" {
		st.AdvisorCommissionKind = models.StudentAdvisorCommNone
	}
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
