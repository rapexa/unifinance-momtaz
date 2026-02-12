package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/middleware"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// SettingsHandler exposes settings-related endpoints (organization, profile, security, notifications, payments).
type SettingsHandler struct {
	service *services.SettingsService
}

func NewSettingsHandler(service *services.SettingsService) *SettingsHandler {
	return &SettingsHandler{service: service}
}

// --- DTOs ---

type OrganizationSettingsDTO struct {
	ID      uint   `json:"id"`
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
	Email   string `json:"email"`
}

type ProfileDTO struct {
	ID              uint   `json:"id"`
	FirstName       string `json:"first_name"`
	LastName        string `json:"last_name"`
	Email           string `json:"email"`
	Phone           string `json:"phone,omitempty"`
	Role            string `json:"role"`
	AvatarURL       string `json:"avatar_url,omitempty"`
	Bio             string `json:"bio,omitempty"`
	TwoFactorEnabled bool   `json:"two_factor_enabled"`
}

type NotificationSettingDTO struct {
	Type    string `json:"type"`
	Enabled bool   `json:"enabled"`
}

type PaymentSettingsDTO struct {
	CardNumber         string `json:"card_number"`
	IBAN               string `json:"iban"`
	GatewayProvider    string `json:"gateway_provider"`
	GatewayMerchantID  string `json:"gateway_merchant_id"`
	GatewayCallbackURL string `json:"gateway_callback_url"`
	IsGatewayConnected bool   `json:"is_gateway_connected"`
}

// getCurrentUserID extracts user ID from Gin context.
func getCurrentUserID(c *gin.Context) (uint, bool) {
	userIDVal, exists := c.Get(middleware.ContextUserIDKey)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user in context"})
		return 0, false
	}
	switch v := userIDVal.(type) {
	case uint:
		return v, true
	case int64:
		if v >= 0 {
			return uint(v), true
		}
	default:
	}
	c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user id type"})
	return 0, false
}

// --- Organization (Settings > General) ---

type updateOrganizationRequest struct {
	Name    *string `json:"name" binding:"omitempty,min=1,max=255"`
	Phone   *string `json:"phone" binding:"omitempty,max=20"`
	Address *string `json:"address" binding:"omitempty,max=500"`
	Email   *string `json:"email" binding:"omitempty,email,max=255"`
}

// GetOrganization handles GET /settings/organization
// @Summary      Get organization settings
// @Description  Get general organization settings (admin only, Settings > General)
// @Tags         settings
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  OrganizationSettingsDTO
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /settings/organization [get]
func (h *SettingsHandler) GetOrganization(c *gin.Context) {
	userID, ok := getCurrentUserID(c)
	if !ok {
		return
	}

	org, err := h.service.GetOrganizationSettings(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load organization settings"})
		return
	}

	c.JSON(http.StatusOK, OrganizationSettingsDTO{
		ID:      org.ID,
		Name:    org.Name,
		Phone:   org.Phone,
		Address: org.Address,
		Email:   org.Email,
	})
}

// UpdateOrganization handles PUT /settings/organization
// @Summary      Update organization settings
// @Description  Update general organization settings (admin only, Settings > General)
// @Tags         settings
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      updateOrganizationRequest true "Organization settings"
// @Success      200   {object}  OrganizationSettingsDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /settings/organization [put]
func (h *SettingsHandler) UpdateOrganization(c *gin.Context) {
	userID, ok := getCurrentUserID(c)
	if !ok {
		return
	}

	var req updateOrganizationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	params := services.UpdateOrganizationParams{
		Name:    req.Name,
		Phone:   req.Phone,
		Address: req.Address,
		Email:   req.Email,
	}
	org, err := h.service.UpdateOrganizationSettings(c.Request.Context(), userID, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update organization settings"})
		return
	}

	c.JSON(http.StatusOK, OrganizationSettingsDTO{
		ID:      org.ID,
		Name:    org.Name,
		Phone:   org.Phone,
		Address: org.Address,
		Email:   org.Email,
	})
}

// --- Profile (Settings > Profile) ---

type updateProfileRequest struct {
	FirstName *string `json:"first_name" binding:"omitempty,min=2,max=100"`
	LastName  *string `json:"last_name" binding:"omitempty,min=2,max=100"`
	Email     *string `json:"email" binding:"omitempty,email,max=255"`
	Phone     *string `json:"phone" binding:"omitempty,max=20"`
	AvatarURL *string `json:"avatar_url" binding:"omitempty,max=512"`
	Bio       *string `json:"bio" binding:"omitempty"`
}

// GetProfile handles GET /settings/profile
// @Summary      Get current user profile
// @Description  Get profile info for the current user (Settings > Profile)
// @Tags         settings
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  ProfileDTO
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /settings/profile [get]
func (h *SettingsHandler) GetProfile(c *gin.Context) {
	userID, ok := getCurrentUserID(c)
	if !ok {
		return
	}

	user, err := h.service.GetProfile(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load profile"})
		return
	}

	c.JSON(http.StatusOK, ProfileDTO{
		ID:               user.ID,
		FirstName:        user.FirstName,
		LastName:         user.LastName,
		Email:            user.Email,
		Phone:            user.Phone,
		Role:             string(user.Role),
		AvatarURL:        user.AvatarURL,
		Bio:              user.Bio,
		TwoFactorEnabled: user.TwoFactorEnabled,
	})
}

// UpdateProfile handles PUT /settings/profile
// @Summary      Update current user profile
// @Description  Update profile info for the current user (Settings > Profile)
// @Tags         settings
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      updateProfileRequest true "Profile data"
// @Success      200   {object}  ProfileDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      409   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /settings/profile [put]
func (h *SettingsHandler) UpdateProfile(c *gin.Context) {
	userID, ok := getCurrentUserID(c)
	if !ok {
		return
	}

	var req updateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	params := services.UpdateProfileParams{
		FirstName: req.FirstName,
		LastName:  req.LastName,
		Email:     req.Email,
		Phone:     req.Phone,
		AvatarURL: req.AvatarURL,
		Bio:       req.Bio,
	}

	user, err := h.service.UpdateProfile(c.Request.Context(), userID, params)
	if err != nil {
		if errors.Is(err, services.ErrEmailAlreadyExists) {
			c.JSON(http.StatusConflict, gin.H{"error": "email already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update profile"})
		return
	}

	c.JSON(http.StatusOK, ProfileDTO{
		ID:               user.ID,
		FirstName:        user.FirstName,
		LastName:         user.LastName,
		Email:            user.Email,
		Phone:            user.Phone,
		Role:             string(user.Role),
		AvatarURL:        user.AvatarURL,
		Bio:              user.Bio,
		TwoFactorEnabled: user.TwoFactorEnabled,
	})
}

// --- Security (Settings > Security) ---

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required,min=6"`
	NewPassword     string `json:"new_password" binding:"required,min=6"`
}

// ChangePassword handles PUT /settings/security/password
// @Summary      Change password
// @Description  Change current user's password (Settings > Security)
// @Tags         settings
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      changePasswordRequest true "Password data"
// @Success      204   "No Content"
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /settings/security/password [put]
func (h *SettingsHandler) ChangePassword(c *gin.Context) {
	userID, ok := getCurrentUserID(c)
	if !ok {
		return
	}

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.ChangePassword(c.Request.Context(), userID, req.CurrentPassword, req.NewPassword); err != nil {
		switch {
		case errors.Is(err, services.ErrCurrentPasswordInvalid):
			c.JSON(http.StatusBadRequest, gin.H{"error": "current password is incorrect"})
		case errors.Is(err, services.ErrPasswordTooShort):
			c.JSON(http.StatusBadRequest, gin.H{"error": "new password is too short"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to change password"})
		}
		return
	}

	c.Status(http.StatusNoContent)
}

type toggleTwoFARequest struct {
	Enabled bool `json:"enabled"`
}

// ToggleTwoFactor handles PUT /settings/security/2fa
// @Summary      Toggle two-factor authentication
// @Description  Enable or disable 2FA for current user (Settings > Security)
// @Tags         settings
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      toggleTwoFARequest true "2FA toggle"
// @Success      204   "No Content"
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /settings/security/2fa [put]
func (h *SettingsHandler) ToggleTwoFactor(c *gin.Context) {
	userID, ok := getCurrentUserID(c)
	if !ok {
		return
	}

	var req toggleTwoFARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.SetTwoFactorEnabled(c.Request.Context(), userID, req.Enabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update 2FA setting"})
		return
	}

	c.Status(http.StatusNoContent)
}

// --- Notifications (Settings > Notifications) ---

// GetNotifications handles GET /settings/notifications
// @Summary      Get notification settings
// @Description  Get notification preferences for current user (Settings > Notifications)
// @Tags         settings
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}   NotificationSettingDTO
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /settings/notifications [get]
func (h *SettingsHandler) GetNotifications(c *gin.Context) {
	userID, ok := getCurrentUserID(c)
	if !ok {
		return
	}

	settings, err := h.service.GetNotificationSettings(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load notifications settings"})
		return
	}

	out := make([]NotificationSettingDTO, len(settings))
	for i, s := range settings {
		out[i] = NotificationSettingDTO{
			Type:    string(s.Type),
			Enabled: s.Enabled,
		}
	}
	c.JSON(http.StatusOK, out)
}

type updateNotificationsRequest struct {
	Settings []NotificationSettingDTO `json:"settings" binding:"required,dive"`
}

// UpdateNotifications handles PUT /settings/notifications
// @Summary      Update notification settings
// @Description  Update notification preferences for current user (Settings > Notifications)
// @Tags         settings
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      updateNotificationsRequest true "Notifications settings"
// @Success      204   "No Content"
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /settings/notifications [put]
func (h *SettingsHandler) UpdateNotifications(c *gin.Context) {
	userID, ok := getCurrentUserID(c)
	if !ok {
		return
	}

	var req updateNotificationsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	toggles := make([]services.NotificationToggle, len(req.Settings))
	for i, s := range req.Settings {
		toggles[i] = services.NotificationToggle{
			Type:    models.NotificationType(s.Type),
			Enabled: s.Enabled,
		}
	}

	if err := h.service.SetNotificationSettings(c.Request.Context(), userID, toggles); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update notifications settings"})
		return
	}

	c.Status(http.StatusNoContent)
}

// --- Payments (Settings > Payments) ---

type updatePaymentSettingsRequest struct {
	CardNumber         *string `json:"card_number" binding:"omitempty,max=32"`
	IBAN               *string `json:"iban" binding:"omitempty,max=50"`
	GatewayProvider    *string `json:"gateway_provider" binding:"omitempty,max=50"`
	GatewayMerchantID  *string `json:"gateway_merchant_id" binding:"omitempty,max=128"`
	GatewayCallbackURL *string `json:"gateway_callback_url" binding:"omitempty,max=255"`
	IsGatewayConnected *bool   `json:"is_gateway_connected" binding:"omitempty"`
}

// GetPaymentSettings handles GET /settings/payments
// @Summary      Get payment settings
// @Description  Get payment configuration for the organization (Settings > Payments, admin only)
// @Tags         settings
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  PaymentSettingsDTO
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /settings/payments [get]
func (h *SettingsHandler) GetPaymentSettings(c *gin.Context) {
	userID, ok := getCurrentUserID(c)
	if !ok {
		return
	}

	ps, err := h.service.GetPaymentSettings(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load payment settings"})
		return
	}

	c.JSON(http.StatusOK, PaymentSettingsDTO{
		CardNumber:         ps.CardNumber,
		IBAN:               ps.IBAN,
		GatewayProvider:    ps.GatewayProvider,
		GatewayMerchantID:  ps.GatewayMerchantID,
		GatewayCallbackURL: ps.GatewayCallbackURL,
		IsGatewayConnected: ps.IsGatewayConnected,
	})
}

// UpdatePaymentSettings handles PUT /settings/payments
// @Summary      Update payment settings
// @Description  Update payment configuration for the organization (Settings > Payments, admin only)
// @Tags         settings
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      updatePaymentSettingsRequest true "Payment settings"
// @Success      200   {object}  PaymentSettingsDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /settings/payments [put]
func (h *SettingsHandler) UpdatePaymentSettings(c *gin.Context) {
	userID, ok := getCurrentUserID(c)
	if !ok {
		return
	}

	var req updatePaymentSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	params := services.UpdatePaymentSettingsParams{
		CardNumber:         req.CardNumber,
		IBAN:               req.IBAN,
		GatewayProvider:    req.GatewayProvider,
		GatewayMerchantID:  req.GatewayMerchantID,
		GatewayCallbackURL: req.GatewayCallbackURL,
		IsGatewayConnected: req.IsGatewayConnected,
	}

	ps, err := h.service.UpdatePaymentSettings(c.Request.Context(), userID, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update payment settings"})
		return
	}

	c.JSON(http.StatusOK, PaymentSettingsDTO{
		CardNumber:         ps.CardNumber,
		IBAN:               ps.IBAN,
		GatewayProvider:    ps.GatewayProvider,
		GatewayMerchantID:  ps.GatewayMerchantID,
		GatewayCallbackURL: ps.GatewayCallbackURL,
		IsGatewayConnected: ps.IsGatewayConnected,
	})
}

