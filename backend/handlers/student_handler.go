package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// StudentHandler exposes student-related endpoints.
type StudentHandler struct {
	service *services.StudentService
}

func NewStudentHandler(service *services.StudentService) *StudentHandler {
	return &StudentHandler{service: service}
}

// StudentDoc is a simplified representation of Student for Swagger docs.
type StudentDoc struct {
	ID        uint   `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email,omitempty"`
	Phone     string `json:"phone,omitempty"`
	Status    string `json:"status"`
}

// toStudentDoc converts a Student model to a public DTO.
func toStudentDoc(s *models.Student) StudentDoc {
	return StudentDoc{
		ID:        s.ID,
		FirstName: s.FirstName,
		LastName:  s.LastName,
		Email:     s.Email,
		Phone:     s.Phone,
		Status:    string(s.Status),
	}
}

func toStudentDocSlice(students []models.Student) []StudentDoc {
	out := make([]StudentDoc, len(students))
	for i, s := range students {
		out[i] = toStudentDoc(&s)
	}
	return out
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
		FirstName string `json:"first_name" binding:"required,min=2,max=100"`
		LastName  string `json:"last_name" binding:"required,min=2,max=100"`
		Email     string `json:"email" binding:"omitempty,email,max=255"`
		Phone     string `json:"phone" binding:"omitempty,max=20"`
	}

	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	student := &models.Student{
		FirstName: payload.FirstName,
		LastName:  payload.LastName,
		Email:     payload.Email,
		Phone:     payload.Phone,
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
		FirstName string `json:"first_name" binding:"required,min=2,max=100"`
		LastName  string `json:"last_name" binding:"required,min=2,max=100"`
		Email     string `json:"email" binding:"omitempty,email,max=255"`
		Phone     string `json:"phone" binding:"omitempty,max=20"`
		Status    string `json:"status" binding:"omitempty,oneof=ACTIVE INACTIVE"`
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

	student.FirstName = payload.FirstName
	student.LastName = payload.LastName
	student.Email = payload.Email
	student.Phone = payload.Phone
	if payload.Status != "" {
		student.Status = models.StudentStatus(payload.Status)
	}

	if err := h.service.Update(c.Request.Context(), student); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update student"})
		return
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

