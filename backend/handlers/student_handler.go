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

// List handles GET /students
// @Summary      List students
// @Description  List students with optional search and pagination
// @Tags         students
// @Security     BearerAuth
// @Produce      json
// @Param        limit   query     int     false "Page size" default(20)
// @Param        offset  query     int     false "Offset" default(0)
// @Param        search  query     string  false "Search by name, phone or email"
// @Success      200     {object}  map[string]interface{}
// @Failure      400     {object}  map[string]string
// @Failure      401     {object}  map[string]string
// @Failure      500     {object}  map[string]string
// @Router       /students [get]
func (h *StudentHandler) List(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "20")
	offsetStr := c.DefaultQuery("offset", "0")
	search := c.DefaultQuery("search", "")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 20
	}
	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	students, total, err := h.service.List(c.Request.Context(), limit, offset, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list students"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  students,
		"total": total,
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

	c.JSON(http.StatusOK, student)
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
		FirstName string `json:"first_name" binding:"required"`
		LastName  string `json:"last_name" binding:"required"`
		Email     string `json:"email"`
		Phone     string `json:"phone"`
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

	c.JSON(http.StatusCreated, student)
}

