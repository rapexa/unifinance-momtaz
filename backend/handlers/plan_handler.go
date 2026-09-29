package handlers

import (
	"fmt"
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
		planError(c, http.StatusBadRequest, "وضعیت نامعتبر است؛ باید active یا inactive باشد")
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
		planError(c, http.StatusInternalServerError, "خطا در دریافت لیست پلن‌ها")
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
		planError(c, http.StatusBadRequest, "شناسه نامعتبر است")
		return
	}

	p, err := h.service.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		if err == services.ErrPlanNotFound {
			planError(c, http.StatusNotFound, "پلن یافت نشد")
			return
		}
		planError(c, http.StatusInternalServerError, "خطا در دریافت پلن")
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
			planError(c, http.StatusInternalServerError, "ثبت پلن با خطا مواجه شد")
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
		planError(c, http.StatusBadRequest, "شناسه نامعتبر است")
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
			planError(c, http.StatusNotFound, "پلن یافت نشد")
		case services.ErrPlanNameExists:
			planError(c, http.StatusConflict, "plan name already exists")
		default:
			planError(c, http.StatusInternalServerError, "ویرایش پلن با خطا مواجه شد")
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
		planError(c, http.StatusBadRequest, "شناسه نامعتبر است")
		return
	}

	if err := h.service.Deactivate(c.Request.Context(), uint(id)); err != nil {
		switch err {
		case services.ErrPlanNotFound:
			planError(c, http.StatusNotFound, "پلن یافت نشد")
		case services.ErrPlanInUse:
			planError(c, http.StatusConflict, "این پلن ثبت‌نام فعال دارد و قابل غیرفعال‌سازی نیست")
		default:
			planError(c, http.StatusInternalServerError, "غیرفعال‌سازی پلن با خطا مواجه شد")
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Plan deactivated",
		"code":    http.StatusOK,
	})
}

// HardDelete handles DELETE /plans/:id/permanent — removes the plan completely
// when no ACTIVE student is on it (enrollment history of former students goes with it).
func (h *PlanHandler) HardDelete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		planError(c, http.StatusBadRequest, "شناسه نامعتبر است")
		return
	}
	n, err := h.service.HardDelete(c.Request.Context(), uint(id))
	if err != nil {
		switch err {
		case services.ErrPlanNotFound:
			planError(c, http.StatusNotFound, "پلن یافت نشد")
		case services.ErrPlanHasStudents:
			planError(c, http.StatusConflict, fmt.Sprintf("%d دانش‌آموز فعال روی این پلن هستند؛ ابتدا پلن آن‌ها را تغییر دهید", n))
		default:
			planError(c, http.StatusInternalServerError, "حذف کامل پلن با خطا مواجه شد")
		}
		return
	}
	c.Status(http.StatusNoContent)
}

// Summary handles GET /plans/summary
func (h *PlanHandler) Summary(c *gin.Context) {
	summary, err := h.service.Summary(c.Request.Context())
	if err != nil {
		planError(c, http.StatusInternalServerError, "خطا در دریافت خلاصه پلن‌ها")
		return
	}

	c.JSON(http.StatusOK, PlanSummaryDTO{
		TotalPlans:        summary.TotalPlans,
		ActivePlans:       summary.ActivePlans,
		ActiveEnrollments: summary.ActiveEnrollments,
	})
}
