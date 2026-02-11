package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/backend/models"
	"github.com/soheilsshh/unifinance-momtaz/backend/services"
)

// StudentHandler exposes student-related endpoints.
type StudentHandler struct {
	service *services.StudentService
}

func NewStudentHandler(service *services.StudentService) *StudentHandler {
	return &StudentHandler{service: service}
}

// List handles GET /students
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

