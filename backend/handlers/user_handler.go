package handlers

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// UserHandler exposes user management endpoints.
type UserHandler struct {
	service *services.UserService
	permSvc *services.PermissionService
}

func NewUserHandler(service *services.UserService, permSvc *services.PermissionService) *UserHandler {
	return &UserHandler{service: service, permSvc: permSvc}
}

// UserDTO is the public representation of a user.
type UserDTO struct {
	ID             uint      `json:"id"`
	FirstName      string    `json:"first_name"`
	LastName       string    `json:"last_name"`
	Email          string    `json:"email"`
	Phone          string    `json:"phone,omitempty"`
	RoleID         uint      `json:"role_id"`
	RoleCode       string    `json:"role_code"`
	RoleName       string    `json:"role_name"`
	Role           string    `json:"role"` // same as role_code (backward compatible)
	IsActive       bool      `json:"is_active"`
	OrganizationID *uint     `json:"organization_id,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	Permissions    []string  `json:"permissions,omitempty"` // only for GET when caller has USERS permission
}

func toUserDTO(u *models.User) UserDTO {
	dto := UserDTO{
		ID:             u.ID,
		FirstName:      u.FirstName,
		LastName:       u.LastName,
		Email:          u.Email,
		Phone:          u.Phone,
		RoleID:         u.RoleID,
		IsActive:       u.IsActive,
		OrganizationID: u.OrganizationID,
		CreatedAt:      u.CreatedAt,
	}
	if u.Role != nil {
		dto.RoleCode = u.Role.Code
		dto.RoleName = u.Role.Name
		dto.Role = u.Role.Code
	}
	return dto
}

func toUserDTOSlice(users []models.User) []UserDTO {
	out := make([]UserDTO, len(users))
	for i, u := range users {
		out[i] = toUserDTO(&u)
	}
	return out
}

func userError(c *gin.Context, status int, msg string) {
	c.AbortWithStatusJSON(status, gin.H{
		"error": msg,
		"code":  status,
	})
}

type createUserRequest struct {
	FirstName      string `json:"first_name" binding:"required,min=2,max=100"`
	LastName       string `json:"last_name" binding:"required,min=2,max=100"`
	Email          string `json:"email" binding:"required,email,max=255"`
	Phone          string `json:"phone" binding:"omitempty,max=20"`
	RoleID         uint   `json:"role_id" binding:"required"`
	Password       string `json:"password" binding:"required,min=8"`
	OrganizationID *uint  `json:"organization_id" binding:"omitempty"`
	IsActive       *bool  `json:"is_active" binding:"omitempty"`
}

type updateUserRequest struct {
	FirstName      *string  `json:"first_name" binding:"omitempty,min=2,max=100"`
	LastName       *string  `json:"last_name" binding:"omitempty,min=2,max=100"`
	Email          *string  `json:"email" binding:"omitempty,email,max=255"`
	Phone          *string  `json:"phone" binding:"omitempty,max=20"`
	RoleID         *uint    `json:"role_id" binding:"omitempty"`
	IsActive       *bool    `json:"is_active" binding:"omitempty"`
	OrganizationID *uint    `json:"organization_id" binding:"omitempty"`
	Password       *string  `json:"password" binding:"omitempty,min=8"` // admin can set user password
	Permissions    []string `json:"permissions" binding:"omitempty,dive,oneof=DASHBOARD STUDENTS USERS PLANS PAYMENTS PAYROLL REMINDERS REPORTS SETTINGS"`
}

// List handles GET /users
// @Summary      List users
// @Description  List users with pagination and optional search/filters (admin only)
// @Tags         users
// @Security     BearerAuth
// @Produce      json
// @Param        page       query     int     false "Page number (1-based)" default(1)
// @Param        page_size  query     int     false "Page size" default(20)
// @Param        search     query     string  false "Search by first name, last name or email"
// @Param        role       query     string  false "Filter by role_id (number) or role code (slug), or legacy ADMIN/ADVISOR"
// @Param        role_id    query     int     false "Filter by role id"
// @Param        role_code  query     string  false "Filter by role code"
// @Param        status     query     string  false "Filter by status: active or inactive"
// @Success      200        {object}  map[string]interface{}
// @Failure      400        {object}  map[string]string
// @Failure      401        {object}  map[string]string
// @Failure      403        {object}  map[string]string
// @Failure      500        {object}  map[string]string
// @Router       /users [get]
func (h *UserHandler) List(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "20")
	search := c.DefaultQuery("search", "")
	role := c.DefaultQuery("role", "")
	if rc := c.Query("role_code"); rc != "" {
		role = rc
	}
	if rid := c.Query("role_id"); rid != "" {
		role = rid
	}
	status := c.DefaultQuery("status", "")

	if status != "" && status != "active" && status != "inactive" {
		userError(c, http.StatusBadRequest, "invalid status; must be 'active' or 'inactive'")
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

	users, total, err := h.service.List(c.Request.Context(), pageSize, offset, search, role, status)
	if err != nil {
		userError(c, http.StatusInternalServerError, "failed to list users")
		return
	}

	dtos := toUserDTOSlice(users)
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

// Summary handles GET /users/summary
// @Summary      Users summary
// @Description  Counts of users per role (admin, accountant, advisor, operator)
// @Tags         users
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /users/summary [get]
func (h *UserHandler) Summary(c *gin.Context) {
	stats, err := h.service.RoleStats(c.Request.Context())
	if err != nil {
		userError(c, http.StatusInternalServerError, "failed to load users summary")
		return
	}
	type row struct {
		RoleID uint   `json:"role_id"`
		Code   string `json:"code"`
		Name   string `json:"name"`
		Count  int64  `json:"count"`
	}
	rows := make([]row, 0, len(stats))
	for _, s := range stats {
		rows = append(rows, row{RoleID: s.RoleID, Code: s.Code, Name: s.Name, Count: s.Count})
	}
	c.JSON(http.StatusOK, gin.H{"by_role": rows})
}

// Get handles GET /users/:id
// @Summary      Get user
// @Description  Get user by ID (admin only)
// @Tags         users
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      int  true "User ID"
// @Success      200  {object}  UserDTO
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Router       /users/{id} [get]
func (h *UserHandler) Get(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		userError(c, http.StatusBadRequest, "invalid id")
		return
	}

	u, err := h.service.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		if err == services.ErrUserNotFound {
			userError(c, http.StatusNotFound, "user not found")
			return
		}
		userError(c, http.StatusInternalServerError, "failed to get user")
		return
	}

	dto := toUserDTO(u)
	if h.permSvc != nil {
		full := u.Role != nil && u.Role.FullAccess
		perms, _ := h.permSvc.GetForUser(c.Request.Context(), u.ID, full)
		for _, p := range perms {
			dto.Permissions = append(dto.Permissions, string(p))
		}
	}
	c.JSON(http.StatusOK, dto)
}

// Create handles POST /users
// @Summary      Create user
// @Description  Create a new user (admin only)
// @Tags         users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body      createUserRequest true "User data"
// @Success      201   {object}  UserDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      409   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /users [post]
func (h *UserHandler) Create(c *gin.Context) {
	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		userError(c, http.StatusBadRequest, err.Error())
		return
	}

	params := services.CreateUserParams{
		FirstName:      req.FirstName,
		LastName:       req.LastName,
		Email:          req.Email,
		Phone:          req.Phone,
		RoleID:         req.RoleID,
		Password:       req.Password,
		OrganizationID: req.OrganizationID,
		IsActive:       req.IsActive,
	}

	u, err := h.service.Create(c.Request.Context(), params)
	if err != nil {
		if err == services.ErrEmailAlreadyExists {
			userError(c, http.StatusConflict, "email already exists")
			return
		}
		if err == services.ErrInvalidRoleID {
			userError(c, http.StatusBadRequest, "invalid role_id")
			return
		}
		userError(c, http.StatusInternalServerError, "failed to create user")
		return
	}

	c.JSON(http.StatusCreated, toUserDTO(u))
}

// Update handles PUT /users/:id
// @Summary      Update user
// @Description  Update an existing user (admin only, password not changeable here)
// @Tags         users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path      int               true  "User ID"
// @Param        body  body      updateUserRequest true  "User data"
// @Success      200   {object}  UserDTO
// @Failure      400   {object}  map[string]string
// @Failure      401   {object}  map[string]string
// @Failure      403   {object}  map[string]string
// @Failure      404   {object}  map[string]string
// @Failure      409   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /users/{id} [put]
func (h *UserHandler) Update(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		userError(c, http.StatusBadRequest, "invalid id")
		return
	}

	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		userError(c, http.StatusBadRequest, err.Error())
		return
	}

	params := services.UpdateUserParams{
		FirstName:      req.FirstName,
		LastName:       req.LastName,
		Email:          req.Email,
		Phone:          req.Phone,
		RoleID:         req.RoleID,
		IsActive:       req.IsActive,
		OrganizationID: req.OrganizationID,
		Password:       req.Password,
	}
	if req.Permissions != nil {
		params.Permissions = make([]models.Permission, 0, len(req.Permissions))
		for _, s := range req.Permissions {
			params.Permissions = append(params.Permissions, models.Permission(s))
		}
	}

	u, err := h.service.Update(c.Request.Context(), uint(id), params)
	if err != nil {
		switch err {
		case services.ErrUserNotFound:
			userError(c, http.StatusNotFound, "user not found")
		case services.ErrEmailAlreadyExists:
			userError(c, http.StatusConflict, "email already exists")
		case services.ErrInvalidRoleID:
			userError(c, http.StatusBadRequest, "invalid role_id")
		default:
			userError(c, http.StatusInternalServerError, "failed to update user")
		}
		return
	}

	c.JSON(http.StatusOK, toUserDTO(u))
}

// Deactivate handles DELETE /users/:id
// @Summary      Deactivate user
// @Description  Soft deactivate user by setting is_active=false (admin only)
// @Tags         users
// @Security     BearerAuth
// @Produce      json
// @Param        id   path      int  true "User ID"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /users/{id} [delete]
func (h *UserHandler) Deactivate(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		userError(c, http.StatusBadRequest, "invalid id")
		return
	}

	if err := h.service.Deactivate(c.Request.Context(), uint(id)); err != nil {
		if err == services.ErrUserNotFound {
			userError(c, http.StatusNotFound, "user not found")
			return
		}
		userError(c, http.StatusInternalServerError, "failed to deactivate user")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "User deactivated",
		"code":    http.StatusOK,
	})
}

// Export handles GET /users/export
// @Summary      Export users
// @Description  Export users as CSV with optional search/filters (admin only)
// @Tags         users
// @Security     BearerAuth
// @Produce      text/csv
// @Param        search     query     string  false "Search by first name, last name or email"
// @Param        role       query     string  false "Filter by role_id (number) or role code (slug), or legacy ADMIN/ADVISOR"
// @Param        role_id    query     int     false "Filter by role id"
// @Param        role_code  query     string  false "Filter by role code"
// @Param        status     query     string  false "Filter by status: active or inactive"
// @Success      200        "CSV file"
// @Failure      400        {object}  map[string]string
// @Failure      401        {object}  map[string]string
// @Failure      403        {object}  map[string]string
// @Failure      500        {object}  map[string]string
// @Router       /users/export [get]
func (h *UserHandler) Export(c *gin.Context) {
	search := c.DefaultQuery("search", "")
	role := c.DefaultQuery("role", "")
	status := c.DefaultQuery("status", "")

	if status != "" && status != "active" && status != "inactive" {
		userError(c, http.StatusBadRequest, "invalid status; must be 'active' or 'inactive'")
		return
	}

	// For export, fetch up to 10k rows in one shot.
	const pageSize = 10000
	users, _, err := h.service.List(c.Request.Context(), pageSize, 0, search, role, status)
	if err != nil {
		userError(c, http.StatusInternalServerError, "failed to export users")
		return
	}

	filename := "users_export.csv"
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", "attachment; filename="+filename)

	w := csv.NewWriter(c.Writer)
	defer w.Flush()

	_ = w.Write([]string{"ID", "FirstName", "LastName", "Email", "Phone", "RoleID", "RoleCode", "RoleName", "IsActive", "CreatedAt"})

	for _, u := range users {
		rc, rn := "", ""
		if u.Role != nil {
			rc = u.Role.Code
			rn = u.Role.Name
		}
		row := []string{
			strconv.FormatUint(uint64(u.ID), 10),
			u.FirstName,
			u.LastName,
			u.Email,
			u.Phone,
			strconv.FormatUint(uint64(u.RoleID), 10),
			rc,
			rn,
			strconv.FormatBool(u.IsActive),
			u.CreatedAt.Format(time.RFC3339),
		}
		_ = w.Write(row)
	}
}

