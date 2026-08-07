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
		writeBindError(c, err)
		return
	}

	result, err := h.authService.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		switch err {
		case services.ErrInvalidCredentials:
			writeAPIError(c, http.StatusUnauthorized, "ایمیل یا رمز عبور نامعتبر است.", err)
		case services.ErrInactiveUser:
			writeAPIError(c, http.StatusForbidden, "حساب کاربری غیرفعال است.", err)
		case services.ErrAdminOnly:
			writeAPIError(c, http.StatusForbidden, "دسترسی فقط برای مدیر مجاز است.", err)
		default:
			writeAPIError(c, http.StatusInternalServerError, "خطای داخلی سرور. لطفاً دوباره تلاش کنید.", err)
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
		writeBindError(c, err)
		return
	}

	result, err := h.authService.Refresh(c.Request.Context(), req.RefreshToken)
	if err != nil {
		switch err {
		case services.ErrInvalidCredentials:
			writeAPIError(c, http.StatusUnauthorized, "نشست نامعتبر است. دوباره وارد شوید.", err)
		case services.ErrInactiveUser:
			writeAPIError(c, http.StatusForbidden, "حساب کاربری غیرفعال است.", err)
		default:
			writeAPIError(c, http.StatusInternalServerError, "خطای داخلی سرور. لطفاً دوباره تلاش کنید.", err)
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
		writeAPIError(c, http.StatusUnauthorized, "نشست نامعتبر است. دوباره وارد شوید.", nil)
		return
	}

	userID, ok := userIDVal.(uint)
	if !ok {
		if id64, ok2 := userIDVal.(int64); ok2 && id64 >= 0 {
			userID = uint(id64)
		} else {
			writeAPIError(c, http.StatusUnauthorized, "نشست نامعتبر است. دوباره وارد شوید.", nil)
			return
		}
	}

	user, err := h.authService.GetByID(c.Request.Context(), userID)
	if err != nil {
		writeAPIError(c, http.StatusNotFound, "کاربر یافت نشد.", err)
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
	userIDVal, exists := c.Get(middleware.ContextUserIDKey)
	if exists {
		if userID, ok := userIDVal.(uint); ok {
			if err := h.authService.Logout(c.Request.Context(), userID); err != nil {
				writeAPIError(c, http.StatusInternalServerError, "خروج با خطا مواجه شد.", err)
				return
			}
		}
	}
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
		writeBindError(c, err)
		return
	}

	if err := h.authService.ForgotPassword(c.Request.Context(), req.Email); err != nil {
		writeAPIError(c, http.StatusInternalServerError, "خطای داخلی سرور. لطفاً دوباره تلاش کنید.", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "اگر این ایمیل ثبت شده باشد، لینک بازیابی ارسال می‌شود."})
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
		writeBindError(c, err)
		return
	}

	if err := h.authService.ResetPassword(c.Request.Context(), req.Token, req.NewPassword); err != nil {
		if err == services.ErrInvalidResetToken {
			writeAPIError(c, http.StatusBadRequest, "لینک بازنشانی نامعتبر یا منقضی شده است.", err)
			return
		}
		writeAPIError(c, http.StatusInternalServerError, "خطای داخلی سرور. لطفاً دوباره تلاش کنید.", err)
		return
	}

	c.Status(http.StatusNoContent)
}
