package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
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
	ID              uint   `json:"id"`
	FirstName       string `json:"first_name"`
	LastName        string `json:"last_name"`
	Email           string `json:"email,omitempty"`
	Phone           string `json:"phone,omitempty"`
	Status          string `json:"status"`
	FatherPhone     string `json:"father_phone,omitempty"`
	MotherPhone     string `json:"mother_phone,omitempty"`
	FatherJob       string `json:"father_job,omitempty"`
	MotherJob       string `json:"mother_job,omitempty"`
	SchoolName      string `json:"school_name,omitempty"`
	SchoolAddress   string `json:"school_address,omitempty"`
	HomeAddress     string `json:"home_address,omitempty"`
	AdvisorName     string `json:"advisor_name,omitempty"`
	AdvisorID       *uint  `json:"advisor_id,omitempty"`
	// Per paid payment: how the assigned advisor is compensated (see models.StudentAdvisorCommissionKind).
	AdvisorCommissionKind         string   `json:"advisor_commission_kind,omitempty"`
	AdvisorCommissionPercent      *float64 `json:"advisor_commission_percent,omitempty"`
	AdvisorCommissionFixedCents *int64   `json:"advisor_commission_fixed_cents,omitempty"`
	CurrentPlanName string `json:"current_plan_name,omitempty"`
	CurrentPlanID   *uint  `json:"current_plan_id,omitempty"`
	BalanceCents    int64  `json:"balance_cents"`
}

// toStudentDoc converts a Student model to a public DTO.
func toStudentDoc(s *models.Student) StudentDoc {
	doc := StudentDoc{
		ID:            s.ID,
		FirstName:     s.FirstName,
		LastName:      s.LastName,
		Email:         s.Email,
		Phone:         s.Phone,
		Status:        string(s.Status),
		FatherPhone:   s.FatherPhone,
		MotherPhone:   s.MotherPhone,
		FatherJob:     s.FatherJob,
		MotherJob:     s.MotherJob,
		SchoolName:    s.SchoolName,
		SchoolAddress: s.SchoolAddress,
		HomeAddress:   s.HomeAddress,
		BalanceCents:  s.BalanceCents,
		AdvisorID:                   s.AdvisorID,
		AdvisorCommissionKind:       string(s.AdvisorCommissionKind),
		AdvisorCommissionPercent:    s.AdvisorCommissionPercent,
		AdvisorCommissionFixedCents: s.AdvisorCommissionFixedCents,
		CurrentPlanID:               s.CurrentPlanID,
	}
	if s.Advisor != nil {
		doc.AdvisorName = s.Advisor.FirstName + " " + s.Advisor.LastName
	}
	if s.CurrentPlan != nil {
		doc.CurrentPlanName = s.CurrentPlan.Name
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

// StudentStatsDoc represents summary stats for the Students page.
type StudentStatsDoc struct {
	Total    int64 `json:"total"`
	Active   int64 `json:"active"`
	Inactive int64 `json:"inactive"`
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

	students, total, err := h.service.List(c.Request.Context(), pageSize, offset, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list students"})
		return
	}

	docs := toStudentDocSlice(students)
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
	total, active, inactive, debtors, err := h.service.Stats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load students summary"})
		return
	}

	c.JSON(http.StatusOK, StudentStatsDoc{
		Total:    total,
		Active:   active,
		Inactive: inactive,
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

	c.JSON(http.StatusOK, toStudentDoc(student))
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
		FirstName                   string   `json:"first_name" binding:"required,min=2,max=100"`
		LastName                    string   `json:"last_name" binding:"required,min=2,max=100"`
		Email                       string   `json:"email" binding:"omitempty,email,max=255"`
		Phone                       string   `json:"phone" binding:"omitempty,max=20"`
		FatherPhone                 string   `json:"father_phone" binding:"omitempty,max=20"`
		MotherPhone                 string   `json:"mother_phone" binding:"omitempty,max=20"`
		FatherJob                   string   `json:"father_job" binding:"omitempty,max=120"`
		MotherJob                   string   `json:"mother_job" binding:"omitempty,max=120"`
		SchoolName                  string   `json:"school_name" binding:"omitempty,max=200"`
		SchoolAddress               string   `json:"school_address" binding:"omitempty,max=500"`
		HomeAddress                 string   `json:"home_address" binding:"omitempty,max=500"`
		AdvisorID                   *uint    `json:"advisor_id" binding:"omitempty"`
		AdvisorCommissionKind       string   `json:"advisor_commission_kind" binding:"omitempty,oneof=NONE PERCENT FIXED_PER_PAYMENT"`
		AdvisorCommissionPercent    *float64 `json:"advisor_commission_percent" binding:"omitempty"`
		AdvisorCommissionFixedCents *int64   `json:"advisor_commission_fixed_cents" binding:"omitempty"`
		CurrentPlanID               *uint    `json:"current_plan_id" binding:"omitempty"`
		BalanceCents                *int64   `json:"balance_cents" binding:"omitempty"`
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
		FatherPhone:   payload.FatherPhone,
		MotherPhone:   payload.MotherPhone,
		FatherJob:     payload.FatherJob,
		MotherJob:     payload.MotherJob,
		SchoolName:    payload.SchoolName,
		SchoolAddress: payload.SchoolAddress,
		HomeAddress:   payload.HomeAddress,
	}
	if payload.AdvisorID != nil {
		student.AdvisorID = payload.AdvisorID
	}
	if payload.CurrentPlanID != nil {
		student.CurrentPlanID = payload.CurrentPlanID
	}
	if payload.BalanceCents != nil {
		student.BalanceCents = *payload.BalanceCents
	}
	applyAdvisorCommissionPayload(student, payload.AdvisorCommissionKind, payload.AdvisorCommissionPercent, payload.AdvisorCommissionFixedCents, true)

	if err := normalizeStudentAdvisorCommission(student); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.Create(c.Request.Context(), student); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create student"})
		return
	}

	c.JSON(http.StatusCreated, toStudentDoc(student))
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
		FirstName                   string   `json:"first_name" binding:"required,min=2,max=100"`
		LastName                    string   `json:"last_name" binding:"required,min=2,max=100"`
		Email                       string   `json:"email" binding:"omitempty,email,max=255"`
		Phone                       string   `json:"phone" binding:"omitempty,max=20"`
		FatherPhone                 string   `json:"father_phone" binding:"omitempty,max=20"`
		MotherPhone                 string   `json:"mother_phone" binding:"omitempty,max=20"`
		FatherJob                   string   `json:"father_job" binding:"omitempty,max=120"`
		MotherJob                   string   `json:"mother_job" binding:"omitempty,max=120"`
		SchoolName                  string   `json:"school_name" binding:"omitempty,max=200"`
		SchoolAddress               string   `json:"school_address" binding:"omitempty,max=500"`
		HomeAddress                 string   `json:"home_address" binding:"omitempty,max=500"`
		Status                      string   `json:"status" binding:"omitempty,oneof=ACTIVE INACTIVE"`
		AdvisorID                   *uint    `json:"advisor_id" binding:"omitempty"`
		AdvisorCommissionKind       string   `json:"advisor_commission_kind" binding:"omitempty,oneof=NONE PERCENT FIXED_PER_PAYMENT"`
		AdvisorCommissionPercent    *float64 `json:"advisor_commission_percent" binding:"omitempty"`
		AdvisorCommissionFixedCents *int64   `json:"advisor_commission_fixed_cents" binding:"omitempty"`
		CurrentPlanID               *uint    `json:"current_plan_id" binding:"omitempty"`
		BalanceCents                *int64   `json:"balance_cents" binding:"omitempty"`
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

	beforeSnap := snapshotStudentCommission(student)

	student.FirstName = payload.FirstName
	student.LastName = payload.LastName
	student.Email = payload.Email
	student.Phone = payload.Phone
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
	if payload.AdvisorID != nil {
		student.AdvisorID = payload.AdvisorID
	} else {
		student.AdvisorID = nil
	}
	if payload.CurrentPlanID != nil {
		student.CurrentPlanID = payload.CurrentPlanID
	} else {
		student.CurrentPlanID = nil
	}
	if payload.BalanceCents != nil {
		student.BalanceCents = *payload.BalanceCents
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

	if h.payments != nil && !beforeSnap.equals(student) {
		_ = h.payments.RecalculatePaidSharesForStudent(c.Request.Context(), uint(id))
	}

	updated, _ := h.service.GetByID(c.Request.Context(), uint(id))
	if updated != nil {
		student = updated
	}
	c.JSON(http.StatusOK, toStudentDoc(student))
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

	if err := h.service.Delete(c.Request.Context(), uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete student"})
		return
	}

	c.Status(http.StatusNoContent)
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

