package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// LeadHandler serves the public sales page API and the vendor's demo-request inbox.
type LeadHandler struct {
	service *services.LeadService
	cfg     *config.Config
}

func NewLeadHandler(service *services.LeadService, cfg *config.Config) *LeadHandler {
	return &LeadHandler{service: service, cfg: cfg}
}

// SiteInfo handles GET /public/site: tells the web app whether this is the vendor site.
func (h *LeadHandler) SiteInfo(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"vendor":            h.cfg.SaaS.Vendor,
		"product_name":      h.cfg.SaaS.ProductName,
		"organization_name": h.service.OrganizationName(c.Request.Context()),
	})
}

func leadDTO(l *models.Lead) gin.H {
	return gin.H{
		"id": l.ID, "name": l.Name, "phone": l.Phone, "organization": l.Organization, "city": l.City,
		"students_range": l.StudentsRange, "plan": l.Plan, "hosting": l.Hosting, "message": l.Message,
		"status": l.Status, "note": l.Note, "created_at": l.CreatedAt, "updated_at": l.UpdatedAt,
	}
}

// Submit handles POST /public/leads (demo/purchase request from the sales page).
func (h *LeadHandler) Submit(c *gin.Context) {
	if !h.cfg.SaaS.Vendor {
		c.JSON(http.StatusNotFound, gin.H{"error": "مسیر یافت نشد"})
		return
	}
	var req struct {
		Name          string `json:"name"`
		Phone         string `json:"phone"`
		Organization  string `json:"organization"`
		City          string `json:"city"`
		StudentsRange string `json:"students_range"`
		Plan          string `json:"plan"`
		Hosting       string `json:"hosting"`
		Message       string `json:"message"`
		Website       string `json:"website"` // honeypot: real visitors leave it empty
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "اطلاعات ارسالی نامعتبر است"})
		return
	}
	if req.Website != "" {
		c.JSON(http.StatusCreated, gin.H{"ok": true}) // silently drop bots
		return
	}
	lead, err := h.service.Create(c.Request.Context(), models.Lead{
		Name: req.Name, Phone: req.Phone, Organization: req.Organization, City: req.City,
		StudentsRange: req.StudentsRange, Plan: req.Plan, Hosting: req.Hosting, Message: req.Message,
		IP: c.ClientIP(), UserAgent: c.Request.UserAgent(),
	})
	switch err {
	case nil:
		c.JSON(http.StatusCreated, gin.H{"ok": true, "id": lead.ID})
	case services.ErrLeadInvalidName, services.ErrLeadInvalidPhone:
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case services.ErrLeadRateLimited:
		c.JSON(http.StatusTooManyRequests, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در ثبت درخواست"})
	}
}

func (h *LeadHandler) vendorAdmin(c *gin.Context) bool {
	if !h.cfg.SaaS.Vendor {
		c.JSON(http.StatusNotFound, gin.H{"error": "مسیر یافت نشد"})
		return false
	}
	return requireAdmin(c)
}

// List handles GET /leads?status=
func (h *LeadHandler) List(c *gin.Context) {
	if !h.vendorAdmin(c) {
		return
	}
	leads, err := h.service.List(c.Request.Context(), c.Query("status"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت درخواست‌ها"})
		return
	}
	out := make([]gin.H, len(leads))
	for i := range leads {
		out[i] = leadDTO(&leads[i])
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// Update handles PATCH /leads/:id {status?, note?}
func (h *LeadHandler) Update(c *gin.Context) {
	if !h.vendorAdmin(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}
	var req struct {
		Status *string `json:"status"`
		Note   *string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "اطلاعات ارسالی نامعتبر است"})
		return
	}
	lead, err := h.service.Update(c.Request.Context(), uint(id), req.Status, req.Note)
	switch err {
	case nil:
		c.JSON(http.StatusOK, leadDTO(lead))
	case services.ErrLeadNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case services.ErrLeadBadStatus:
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در ذخیره"})
	}
}

// Delete handles DELETE /leads/:id
func (h *LeadHandler) Delete(c *gin.Context) {
	if !h.vendorAdmin(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}
	if err := h.service.Delete(c.Request.Context(), uint(id)); err != nil {
		if err == services.ErrLeadNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در حذف"})
		return
	}
	c.Status(http.StatusNoContent)
}
