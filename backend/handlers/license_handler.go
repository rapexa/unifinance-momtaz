package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// LicenseHandler exposes the subscription status and lets an admin paste a renewal key.
type LicenseHandler struct {
	service *services.LicenseService
}

func NewLicenseHandler(service *services.LicenseService) *LicenseHandler {
	return &LicenseHandler{service: service}
}

func licenseDTO(st *services.LicenseStatus) gin.H {
	out := gin.H{
		"enabled":    st.Enabled,
		"state":      st.State,
		"read_only":  st.ReadOnly,
		"students":   st.Students,
		"users":      st.Users,
		"grace_days": services.LicenseGraceDays,
	}
	if st.Error != "" {
		out["error_detail"] = st.Error
	}
	if c := st.Claims; c != nil {
		out["license_id"] = c.ID
		out["customer"] = c.Customer
		out["plan"] = c.Plan
		out["max_students"] = c.MaxStudents
		out["max_users"] = c.MaxUsers
		out["issued_at"] = c.IssuedAt
		out["expires_at"] = c.ExpiresAt
		out["days_left"] = st.DaysLeft
	}
	return out
}

// Get handles GET /license (any signed-in user: drives the renewal banner).
func (h *LicenseHandler) Get(c *gin.Context) {
	c.JSON(http.StatusOK, licenseDTO(h.service.Status(c.Request.Context())))
}

// Update handles PUT /license {key} (admins only).
func (h *LicenseHandler) Update(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}
	var req struct {
		Key string `json:"key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Key) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "کلید لایسنس را وارد کنید"})
		return
	}
	st, err := h.service.Save(c.Request.Context(), req.Key)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, licenseDTO(st))
}
