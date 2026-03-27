package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
	"gorm.io/gorm"
)

// RoleHandler exposes CRUD for job roles and compensation templates.
type RoleHandler struct {
	service *services.RoleService
}

func NewRoleHandler(service *services.RoleService, _ *services.PaymentService) *RoleHandler {
	return &RoleHandler{service: service}
}

// RoleDTO is the public JSON shape for a role.
type RoleDTO struct {
	ID               uint     `json:"id"`
	Code             string   `json:"code"`
	Name             string   `json:"name"`
	Description      string   `json:"description,omitempty"`
	IsSystem         bool     `json:"is_system"`
	FullAccess       bool     `json:"full_access"`
	CompensationKind string   `json:"compensation_kind"`
	FixedCents       *int64   `json:"fixed_cents,omitempty"`
	Permissions      []string `json:"permissions,omitempty"`
}

func roleToDTO(r *models.Role, perms []models.Permission) RoleDTO {
	dto := RoleDTO{
		ID:               r.ID,
		Code:             r.Code,
		Name:             r.Name,
		Description:      r.Description,
		IsSystem:         r.IsSystem,
		FullAccess:       r.FullAccess,
		CompensationKind: string(r.CompensationKind),
		FixedCents:       r.FixedCents,
	}
	for _, p := range perms {
		dto.Permissions = append(dto.Permissions, string(p))
	}
	return dto
}

type createRoleRequest struct {
	Code             string   `json:"code" binding:"required"`
	Name             string   `json:"name" binding:"required,min=1,max=128"`
	Description      string   `json:"description" binding:"omitempty,max=500"`
	FullAccess       bool     `json:"full_access"`
	CompensationKind string   `json:"compensation_kind" binding:"required,oneof=FIXED VARIABLE"`
	FixedCents       *int64   `json:"fixed_cents"`
	Permissions      []string `json:"permissions" binding:"omitempty,dive,oneof=DASHBOARD STUDENTS USERS PLANS PAYMENTS PAYROLL REMINDERS REPORTS SETTINGS"`
}

type updateRoleRequest struct {
	Name             *string  `json:"name" binding:"omitempty,min=1,max=128"`
	Description      *string  `json:"description" binding:"omitempty,max=500"`
	FullAccess       *bool    `json:"full_access"`
	CompensationKind *string  `json:"compensation_kind" binding:"omitempty,oneof=FIXED VARIABLE"`
	FixedCents       *int64   `json:"fixed_cents"`
	Permissions      []string `json:"permissions" binding:"omitempty,dive,oneof=DASHBOARD STUDENTS USERS PLANS PAYMENTS PAYROLL REMINDERS REPORTS SETTINGS"`
}

func parsePermissions(ss []string) []models.Permission {
	out := make([]models.Permission, 0, len(ss))
	for _, s := range ss {
		out = append(out, models.Permission(s))
	}
	return out
}

// List handles GET /roles
func (h *RoleHandler) List(c *gin.Context) {
	roles, err := h.service.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list roles"})
		return
	}
	out := make([]RoleDTO, 0, len(roles))
	for i := range roles {
		perms, _ := h.service.ListPermissions(c.Request.Context(), roles[i].ID)
		out = append(out, roleToDTO(&roles[i], perms))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// Get handles GET /roles/:id
func (h *RoleHandler) Get(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, err := h.service.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		if errorsIsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "role not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load role"})
		return
	}
	perms, _ := h.service.ListPermissions(c.Request.Context(), role.ID)
	c.JSON(http.StatusOK, roleToDTO(role, perms))
}

// Create handles POST /roles
func (h *RoleHandler) Create(c *gin.Context) {
	var req createRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	params := services.CreateRoleParams{
		Code:             req.Code,
		Name:             req.Name,
		Description:      req.Description,
		FullAccess:       req.FullAccess,
		CompensationKind: models.CompensationKind(req.CompensationKind),
		FixedCents:       req.FixedCents,
		Permissions:      parsePermissions(req.Permissions),
	}
	role, err := h.service.Create(c.Request.Context(), params)
	if err != nil {
		switch err {
		case services.ErrRoleCodeExists:
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		case services.ErrInvalidRoleCode, services.ErrInvalidCompensation:
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create role"})
		}
		return
	}
	perms, _ := h.service.ListPermissions(c.Request.Context(), role.ID)
	c.JSON(http.StatusCreated, roleToDTO(role, perms))
}

// Update handles PUT /roles/:id
func (h *RoleHandler) Update(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req updateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	params := services.UpdateRoleParams{
		Name:        req.Name,
		Description: req.Description,
		FullAccess:  req.FullAccess,
		FixedCents:  req.FixedCents,
	}
	if req.CompensationKind != nil {
		k := models.CompensationKind(*req.CompensationKind)
		params.CompensationKind = &k
	}
	if req.Permissions != nil {
		p := parsePermissions(req.Permissions)
		params.Permissions = p
	}
	role, err := h.service.Update(c.Request.Context(), uint(id), params)
	if err != nil {
		if errorsIsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "role not found"})
			return
		}
		if err == services.ErrInvalidCompensation {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update role"})
		return
	}
	perms, _ := h.service.ListPermissions(c.Request.Context(), role.ID)
	c.JSON(http.StatusOK, roleToDTO(role, perms))
}

// Delete handles DELETE /roles/:id
func (h *RoleHandler) Delete(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.service.Delete(c.Request.Context(), uint(id)); err != nil {
		switch err {
		case services.ErrSystemRoleDelete:
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		case services.ErrRoleInUse:
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			if errorsIsNotFound(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "role not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete role"})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func errorsIsNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}
