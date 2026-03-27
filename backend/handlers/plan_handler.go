package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// PlanHandler exposes plan management endpoints.
type PlanHandler struct {
	service *services.PlanService
}

func NewPlanHandler(service *services.PlanService) *PlanHandler {
	return &PlanHandler{service: service}
}

// PlanDTO is the public representation of a plan.
type PlanDTO struct {
	ID        uint      `json:"id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	IsActive  bool      `json:"is_active"`
	Features  []string  `json:"features,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

// PlanSummaryDTO represents aggregated stats for plans page.
type PlanSummaryDTO struct {
	TotalPlans        int64 `json:"total_plans"`
	ActivePlans       int64 `json:"active_plans"`
	ActiveEnrollments int64 `json:"active_enrollments"`
}

func planError(c *gin.Context, status int, msg string) {
	c.AbortWithStatusJSON(status, gin.H{
		"error": msg,
		"code":  status,
	})
}

func toPlanDTO(p *models.Plan, features []string) PlanDTO {
	return PlanDTO{
		ID:        p.ID,
		Name:      p.Name,
		Type:      string(p.Type),
		IsActive:  p.IsActive,
		Features:  features,
		CreatedAt: p.CreatedAt,
		UpdatedAt: p.UpdatedAt,
	}
}

func toPlanDTOSlice(plans []models.Plan) []PlanDTO {
	out := make([]PlanDTO, len(plans))
	for i, p := range plans {
		features := make([]string, len(p.Features))
		for j, f := range p.Features {
			features[j] = f.Description
		}
		out[i] = toPlanDTO(&p, features)
	}
	return out
}

type createPlanRequest struct {
	Name     string   `json:"name" binding:"required,min=2,max=255"`
	Type     string   `json:"type" binding:"required,oneof=MONTHLY YEARLY SINGLE_SESSION COURSE"`
	IsActive *bool    `json:"is_active" binding:"omitempty"`
	Features []string `json:"features" binding:"omitempty,dive,required"`
}

type updatePlanRequest struct {
	Name     *string   `json:"name" binding:"omitempty,min=2,max=255"`
	Type     *string   `json:"type" binding:"omitempty,oneof=MONTHLY YEARLY SINGLE_SESSION COURSE"`
	IsActive *bool     `json:"is_active" binding:"omitempty"`
	Features *[]string `json:"features" binding:"omitempty,dive,required"`
}

// List handles GET /plans
func (h *PlanHandler) List(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "20")
	search := c.DefaultQuery("search", "")
	planType := c.DefaultQuery("type", "")
	status := c.DefaultQuery("status", "")

	if status != "" && status != "active" && status != "inactive" {
		planError(c, http.StatusBadRequest, "invalid status; must be 'active' or 'inactive'")
		return
	}

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

	plans, total, err := h.service.List(c.Request.Context(), pageSize, offset, search, planType, status)
	if err != nil {
		planError(c, http.StatusInternalServerError, "failed to list plans")
		return
	}

	dtos := toPlanDTOSlice(plans)
	totalPages := int((total + int64(pageSize) - 1) / int64(pageSize))

	c.JSON(http.StatusOK, gin.H{
		"data": dtos,
		"meta": gin.H{
			"current_page": page,
			"page_size":    pageSize,
			"total_items":  total,
			"total_pages":  totalPages,
		},
	})
}

// Get handles GET /plans/:id
func (h *PlanHandler) Get(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		planError(c, http.StatusBadRequest, "invalid id")
		return
	}

	p, err := h.service.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		if err == services.ErrPlanNotFound {
			planError(c, http.StatusNotFound, "plan not found")
			return
		}
		planError(c, http.StatusInternalServerError, "failed to get plan")
		return
	}

	features := make([]string, len(p.Features))
	for i, f := range p.Features {
		features[i] = f.Description
	}

	c.JSON(http.StatusOK, toPlanDTO(p, features))
}

// Create handles POST /plans
func (h *PlanHandler) Create(c *gin.Context) {
	var req createPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		planError(c, http.StatusBadRequest, err.Error())
		return
	}

	params := services.CreatePlanParams{
		Name:     req.Name,
		Type:     req.Type,
		IsActive: req.IsActive,
		Features: req.Features,
	}

	p, err := h.service.Create(c.Request.Context(), params)
	if err != nil {
		switch err {
		case services.ErrPlanNameExists:
			planError(c, http.StatusConflict, "plan name already exists")
		default:
			planError(c, http.StatusInternalServerError, "failed to create plan")
		}
		return
	}

	c.JSON(http.StatusCreated, toPlanDTO(p, req.Features))
}

// Update handles PUT /plans/:id
func (h *PlanHandler) Update(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		planError(c, http.StatusBadRequest, "invalid id")
		return
	}

	var req updatePlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		planError(c, http.StatusBadRequest, err.Error())
		return
	}

	var features []string
	if req.Features != nil {
		features = *req.Features
	}

	params := services.UpdatePlanParams{
		Name:     req.Name,
		Type:     req.Type,
		IsActive: req.IsActive,
		Features: &features,
	}

	p, err := h.service.Update(c.Request.Context(), uint(id), params)
	if err != nil {
		switch err {
		case services.ErrPlanNotFound:
			planError(c, http.StatusNotFound, "plan not found")
		case services.ErrPlanNameExists:
			planError(c, http.StatusConflict, "plan name already exists")
		default:
			planError(c, http.StatusInternalServerError, "failed to update plan")
		}
		return
	}

	if req.Features == nil {
		features = make([]string, len(p.Features))
		for i, f := range p.Features {
			features[i] = f.Description
		}
	}

	c.JSON(http.StatusOK, toPlanDTO(p, features))
}

// Deactivate handles DELETE /plans/:id
func (h *PlanHandler) Deactivate(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		planError(c, http.StatusBadRequest, "invalid id")
		return
	}

	if err := h.service.Deactivate(c.Request.Context(), uint(id)); err != nil {
		switch err {
		case services.ErrPlanNotFound:
			planError(c, http.StatusNotFound, "plan not found")
		case services.ErrPlanInUse:
			planError(c, http.StatusConflict, "cannot deactivate plan with active enrollments")
		default:
			planError(c, http.StatusInternalServerError, "failed to deactivate plan")
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Plan deactivated",
		"code":    http.StatusOK,
	})
}

// Summary handles GET /plans/summary
func (h *PlanHandler) Summary(c *gin.Context) {
	summary, err := h.service.Summary(c.Request.Context())
	if err != nil {
		planError(c, http.StatusInternalServerError, "failed to load plans summary")
		return
	}

	c.JSON(http.StatusOK, PlanSummaryDTO{
		TotalPlans:        summary.TotalPlans,
		ActivePlans:       summary.ActivePlans,
		ActiveEnrollments: summary.ActiveEnrollments,
	})
}
