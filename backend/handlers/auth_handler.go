package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/backend/services"
)

// AuthHandler wires HTTP (Gin) to AuthService.
// This is the Controller layer in a classic Controller-Service-Repository split.
type AuthHandler struct {
	authService *services.AuthService
}

func NewAuthHandler(authService *services.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

// Login godoc
// @Summary Login and get JWT
// @Accept json
// @Produce json
// @Param body body loginRequest true "Login credentials"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.authService.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		switch err {
		case services.ErrInvalidCredentials:
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		case services.ErrInactiveUser:
			c.JSON(http.StatusForbidden, gin.H{"error": "user is inactive"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": result.Token,
		"user": gin.H{
			"id":         result.User.ID,
			"first_name": result.User.FirstName,
			"last_name":  result.User.LastName,
			"email":      result.User.Email,
			"role":       result.User.Role,
		},
	})
}

