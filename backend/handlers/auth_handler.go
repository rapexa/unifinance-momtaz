package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/middleware"
	"github.com/soheilsshh/unifinance-momtaz/services"
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

type registerRequest struct {
	FirstName string `json:"first_name" binding:"required"`
	LastName  string `json:"last_name" binding:"required"`
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required,min=6"`
	Phone     string `json:"phone"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type forgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type resetPasswordRequest struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// --- Swagger DTOs (used only for documentation) ---

// AuthUserDoc represents the public user shape in auth responses.
type AuthUserDoc struct {
	ID        uint   `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
	Role      string `json:"role"`
}

type AuthTokensDoc struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// AuthResultDoc mirrors services.AuthResult for Swagger docs.
type AuthResultDoc struct {
	User   AuthUserDoc   `json:"user"`
	Tokens AuthTokensDoc `json:"tokens"`
}

// Register handles POST /api/v1/auth/register
// @Summary      Register new user
// @Description  Create a new user and return access & refresh tokens
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      registerRequest true "Register data"
// @Success      201   {object}  AuthResultDoc
// @Failure      400   {object}  map[string]string
// @Router       /auth/register [post]
func (h *AuthHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.authService.Register(c.Request.Context(), req.FirstName, req.LastName, req.Email, req.Password, req.Phone)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, result)
}

// Login handles POST /api/v1/auth/login
// @Summary      Login
// @Description  Authenticate user with email and password and get access & refresh tokens
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      loginRequest true "Login credentials"
// @Success      200   {object}  AuthResultDoc
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Router       /auth/login [post]
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
		case services.ErrAdminOnly:
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied: Admin only"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		}
		return
	}

	c.JSON(http.StatusOK, result)
}

// Refresh handles POST /api/v1/auth/refresh
// @Summary      Refresh tokens
// @Description  Use refresh token to get new access & refresh tokens
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      refreshRequest true "Refresh token"
// @Success      200   {object}  AuthResultDoc
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Router       /auth/refresh [post]
func (h *AuthHandler) Refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.authService.Refresh(c.Request.Context(), req.RefreshToken)
	if err != nil {
		switch err {
		case services.ErrInvalidCredentials:
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
		case services.ErrInactiveUser:
			c.JSON(http.StatusForbidden, gin.H{"error": "user is inactive"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		}
		return
	}

	c.JSON(http.StatusOK, result)
}

// Me handles GET /api/v1/auth/me
// @Summary      Get current user
// @Description  Returns the authenticated user's profile
// @Tags         auth
// @Security     BearerAuth
// @Produce      json
// @Success      200   {object}  AuthUserDoc
// @Failure      401   {object}  map[string]string
// @Failure      404   {object}  map[string]string
// @Router       /auth/me [get]
func (h *AuthHandler) Me(c *gin.Context) {
	userIDVal, exists := c.Get(middleware.ContextUserIDKey)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user in context"})
		return
	}

	userID, ok := userIDVal.(uint)
	if !ok {
		// Gin stores values as interface{}, type assertion may fail if other types used.
		if id64, ok2 := userIDVal.(int64); ok2 && id64 >= 0 {
			userID = uint(id64)
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user id type"})
			return
		}
	}

	user, err := h.authService.GetByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// Logout handles POST /api/v1/auth/logout
// Since JWT is stateless here, logout is effectively a no-op on the server.
// @Summary      Logout
// @Description  Logout current user (stateless JWT, client should discard tokens)
// @Tags         auth
// @Security     BearerAuth
// @Produce      json
// @Success      204   "No Content"
// @Failure      401   {object}  map[string]string
// @Router       /auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	// In a real implementation, you could blacklist the token (e.g., Redis) or rotate keys.
	c.Status(http.StatusNoContent)
}

// ForgotPassword handles POST /api/v1/auth/forgot-password
// @Summary      Forgot password
// @Description  Request a password reset link (stubbed, no email integration yet)
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      forgotPasswordRequest true "Forgot password data"
// @Success      200   {object}  map[string]string
// @Failure      400   {object}  map[string]string
// @Router       /auth/forgot-password [post]
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req forgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Currently stubbed; email integration is not implemented.
	if err := h.authService.ForgotPassword(c.Request.Context(), req.Email); err != nil && err != services.ErrNotImplemented {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "if this email exists, a reset link will be sent"})
}

// ResetPassword handles POST /api/v1/auth/reset-password
// @Summary      Reset password
// @Description  Reset password using a reset token (currently not implemented)
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      resetPasswordRequest true "Reset password data"
// @Success      204   "No Content"
// @Failure      400   {object}  map[string]string
// @Failure      501   {object}  map[string]string
// @Router       /auth/reset-password [post]
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req resetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.authService.ResetPassword(c.Request.Context(), req.Token, req.NewPassword); err != nil {
		if err == services.ErrNotImplemented {
			c.JSON(http.StatusNotImplemented, gin.H{"error": "reset-password not implemented"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.Status(http.StatusNoContent)
}


