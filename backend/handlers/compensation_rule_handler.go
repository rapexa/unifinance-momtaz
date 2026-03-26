package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

type CompensationRuleHandler struct {
	service  *services.CompensationRuleService
	payments *services.PaymentService
}

func NewCompensationRuleHandler(service *services.CompensationRuleService, payments *services.PaymentService) *CompensationRuleHandler {
	return &CompensationRuleHandler{service: service, payments: payments}
}

type compensationRuleRequest struct {
	Name          string   `json:"name" binding:"required"`
	IsActive      bool     `json:"is_active"`
	Priority      int      `json:"priority"`
	TargetKind    string   `json:"target_kind" binding:"required,oneof=ADVISOR_CONTRACT ROLE USER"`
	AmountKind    string   `json:"amount_kind" binding:"required,oneof=FIXED PERCENT"`
	ScopeKind     string   `json:"scope_kind" binding:"required,oneof=ALL_STUDENTS SELECTED_STUDENTS CAPACITY"`
	PaymentType   string   `json:"payment_type" binding:"required,oneof=ALL SINGLE_SESSION MONTHLY COURSE"`
	RoleID        *uint    `json:"role_id"`
	UserID        *uint    `json:"user_id"`
	FixedCents    *int64   `json:"fixed_cents"`
	Percent       *float64 `json:"percent"`
	CapacityLimit *int     `json:"capacity_limit"`
}

type compensationRuleStudentsRequest struct {
	StudentIDs []uint `json:"student_ids"`
}

func (h *CompensationRuleHandler) List(c *gin.Context) {
	rows, err := h.service.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list compensation rules"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func toRuleParams(req compensationRuleRequest) services.CreateCompensationRuleParams {
	return services.CreateCompensationRuleParams{
		Name:          req.Name,
		IsActive:      req.IsActive,
		Priority:      req.Priority,
		TargetKind:    models.CompensationTargetKind(req.TargetKind),
		AmountKind:    models.CompensationAmountKind(req.AmountKind),
		ScopeKind:     models.CompensationScopeKind(req.ScopeKind),
		PaymentType:   models.CompensationPaymentType(req.PaymentType),
		RoleID:        req.RoleID,
		UserID:        req.UserID,
		FixedCents:    req.FixedCents,
		Percent:       req.Percent,
		CapacityLimit: req.CapacityLimit,
	}
}

func (h *CompensationRuleHandler) Create(c *gin.Context) {
	var req compensationRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row, err := h.service.Create(c.Request.Context(), toRuleParams(req))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create compensation rule"})
		return
	}
	_ = h.payments.RebuildAllPaidPaymentPayrollShares(c.Request.Context())
	c.JSON(http.StatusCreated, row)
}

func (h *CompensationRuleHandler) Update(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var req compensationRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row, err := h.service.Update(c.Request.Context(), uint(id64), toRuleParams(req))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update compensation rule"})
		return
	}
	_ = h.payments.RebuildAllPaidPaymentPayrollShares(c.Request.Context())
	c.JSON(http.StatusOK, row)
}

func (h *CompensationRuleHandler) Delete(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.service.Delete(c.Request.Context(), uint(id64)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete compensation rule"})
		return
	}
	_ = h.payments.RebuildAllPaidPaymentPayrollShares(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *CompensationRuleHandler) ReplaceStudents(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var req compensationRuleStudentsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.service.ReplaceStudents(c.Request.Context(), uint(id64), req.StudentIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update rule students"})
		return
	}
	_ = h.payments.RebuildAllPaidPaymentPayrollShares(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

