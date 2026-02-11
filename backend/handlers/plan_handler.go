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
	ID          uint      `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	PriceCents  int64     `json:"price_cents"`
	Interval    string    `json:"interval"`
	Type        string    `json:"type,omitempty"`
	IsActive    bool      `json:"is_active"`
	MaxUsers    *int      `json:"max_users,omitempty"`
	Features    []string  `json:"features,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at,omitempty"`
}

func planError(c *gin.Context, status int, msg string) {
	c.AbortWithStatusJSON(status, gin.H{
		"error": msg,
		"code":  status,
	})
}

func toPlanDTO(p *models.Plan, features []string) PlanDTO {
	dto := PlanDTO{
		ID:         p.ID,
		Name:       p.Name,
		PriceCents: p.PriceCents,
		Interval:   "", // interval not persisted separately yet
		Type:       string(p.Type),
		IsActive:   p.IsActive,
		MaxUsers:   p.MaxUsers,
		CreatedAt:  p.CreatedAt,
		UpdatedAt:  p.UpdatedAt,
		Features:   features,
	}
	return dto
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
	Name        string   `json:"name" binding:"required,min=2,max=255"`
	Description string   `json:"description" binding:"omitempty,max=1000"`
	PriceCents  int64    `json:"price_cents" binding:"required,gt=0"`
	Interval    string   `json:"interval" binding:"required,oneof=monthly yearly"`
	Type        string   `json:"type" binding:"omitempty,max=50"`
	IsActive    *bool    `json:"is_active" binding:"omitempty"`
	MaxUsers    *int     `json:"max_users" binding:"omitempty"`
	Features    []string `json:"features" binding:"omitempty,dive,required"`
}

type updatePlanRequest struct {
	Name        *string   `json:"name" binding:"omitempty,min=2,max=255"`
	Description *string   `json:"description" binding:"omitempty,max=1000"`
	PriceCents  *int64    `json:"price_cents" binding:"omitempty,gt=0"`
	Interval    *string   `json:"interval" binding:"omitempty,oneof=monthly yearly"`
	Type        *string   `json:"type" binding:"omitempty,max=50"`
	IsActive    *bool     `json:"is_active" binding:"omitempty"`
	MaxUsers    *int      `json:"max_users" binding:"omitempty"`
	Features    *[]string `json:"features" binding:"omitempty,dive,required"`
}

// List handles GET /plans
// @Summary      List plans
// @Description  List plans with pagination and optional search/filters (admin only)
// @Tags         plans
// @Security     BearerAuth
// @Produce      json
// @Param        page       query     int     false "Page number (1-based)" default(1)
// @Param        page_size  query     int     false "Page size" default(20)
// @Param        search     query     string  false "Search by name or description"
// @Param        type       query     string  false "Filter by type (e.g. MONTHLY, YEARLY)"
// @Param        status     query     string  false "Filter by status: active, inactive, archived"
// @Success      200        {object}  map[string]interface{}
// @Failure      400        {object}  map[string]string
// @Failure      401        {object}  map[string]string
// @Failure      403        {object}  map[string]string
// @Failure      500        {object}  map[string]string
// @Router       /plans [get]
func (h *PlanHandler) List(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "20")
	search := c.DefaultQuery("search", "")
	planType := c.DefaultQuery("type", "")
	status := c.DefaultQuery("status", "")

	if status != "" && status != "active" && status != "inactive" && status != "archived" {
		planError(c, http.StatusBadRequest, "invalid status; must be 'active', 'inactive', or 'archived'")
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
// @Summary      Get plan
// @Description  Get plan by ID (admin only)
// @Tags         plans
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      int  true "Plan ID"
// @Success      200  {object}  PlanDTO
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Router       /plans/{id} [get]
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
// @Summary      Create plan
// @Description  Create a new plan (admin only)
// @Tags         plans
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      createPlanRequest true "Plan data"
// @Success      201   {object}  PlanDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      409   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /plans [post]
func (h *PlanHandler) Create(c *gin.Context) {
	var req createPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		planError(c, http.StatusBadRequest, err.Error())
		return
	}

	params := services.CreatePlanParams{
		Name:        req.Name,
		Description: req.Description,
		PriceCents:  req.PriceCents,
		Interval:    req.Interval,
		Type:        req.Type,
		IsActive:    req.IsActive,
		MaxUsers:    req.MaxUsers,
		Features:    req.Features,
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

	features := req.Features
	c.JSON(http.StatusCreated, toPlanDTO(p, features))
}

// Update handles PUT /plans/:id
// @Summary      Update plan
// @Description  Update an existing plan (admin only)
// @Tags         plans
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path      int               true  "Plan ID"
// @Param        body  body      updatePlanRequest true  "Plan data"
// @Success      200   {object}  PlanDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      404   {object}  map[string]string
// @Failure      409   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /plans/{id} [put]
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
		Name:        req.Name,
		Description: req.Description,
		PriceCents:  req.PriceCents,
		Interval:    req.Interval,
		Type:        req.Type,
		IsActive:    req.IsActive,
		MaxUsers:    req.MaxUsers,
		Features:    &features,
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
// @Summary      Deactivate plan
// @Description  Soft deactivate a plan by setting is_active=false (admin only). Optionally prevents deactivation when enrollments exist.
// @Tags         plans
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      int  true "Plan ID"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      409  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /plans/{id} [delete]
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

