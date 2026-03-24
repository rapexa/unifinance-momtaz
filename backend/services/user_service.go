package services

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"gorm.io/gorm"
)

var (
	ErrUserNotFound       = errors.New("user not found")
	ErrEmailAlreadyExists = errors.New("email already exists")
	ErrInvalidRoleID      = errors.New("invalid role_id")
)

// UserService encapsulates business logic for users.
type UserService struct {
	repo    repositories.UserRepository
	permSvc *PermissionService
}

func NewUserService(repo repositories.UserRepository, permSvc *PermissionService) *UserService {
	return &UserService{repo: repo, permSvc: permSvc}
}

// List returns paginated users based on filters. roleFilter can be a numeric role_id or a role code (slug).
func (s *UserService) List(ctx context.Context, limit, offset int, search, roleFilter, status string) ([]models.User, int64, error) {
	var isActive *bool
	if status != "" {
		switch strings.ToLower(status) {
		case "active":
			v := true
			isActive = &v
		case "inactive":
			v := false
			isActive = &v
		default:
		}
	}

	roleID, roleCode := parseRoleFilter(roleFilter)
	return s.repo.List(ctx, limit, offset, search, roleCode, roleID, isActive)
}

func parseRoleFilter(s string) (uint, string) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, ""
	}
	if id, err := strconv.ParseUint(s, 10, 64); err == nil && id > 0 {
		return uint(id), ""
	}
	legacy := map[string]string{
		"ADMIN":      models.RoleCodeGeneralManager,
		"ADVISOR":    models.RoleCodeAdvisor,
		"ACCOUNTANT": models.RoleCodeExecutiveManager,
		"OPERATOR":   models.RoleCodeSupport,
	}
	if u := strings.ToUpper(s); legacy[u] != "" {
		return 0, legacy[u]
	}
	return 0, strings.ToLower(s)
}

func (s *UserService) GetByID(ctx context.Context, id uint) (*models.User, error) {
	u, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return u, nil
}

type CreateUserParams struct {
	FirstName      string
	LastName       string
	Email          string
	Phone          string
	RoleID         uint
	Password       string
	OrganizationID *uint
	IsActive       *bool
}

type UpdateUserParams struct {
	FirstName      *string
	LastName       *string
	Email          *string
	Phone          *string
	RoleID         *uint
	IsActive       *bool
	OrganizationID *uint
	Password       *string // admin can set user password
	Permissions    []models.Permission
}

func (s *UserService) Create(ctx context.Context, p CreateUserParams) (*models.User, error) {
	if p.RoleID == 0 {
		return nil, ErrInvalidRoleID
	}
	if existing, err := s.repo.FindByEmail(ctx, p.Email); err == nil && existing != nil {
		return nil, ErrEmailAlreadyExists
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	u := &models.User{
		FirstName:      p.FirstName,
		LastName:       p.LastName,
		Email:          p.Email,
		Phone:          p.Phone,
		RoleID:         p.RoleID,
		OrganizationID: p.OrganizationID,
		PlainPassword:  p.Password,
		IsActive:       true,
	}
	if p.IsActive != nil {
		u.IsActive = *p.IsActive
	}

	if err := s.repo.Create(ctx, u); err != nil {
		return nil, err
	}

	if s.permSvc != nil {
		_ = s.permSvc.SyncFromRole(ctx, u.ID, u.RoleID)
	}

	return s.repo.FindByID(ctx, u.ID)
}

func (s *UserService) Update(ctx context.Context, id uint, p UpdateUserParams) (*models.User, error) {
	u, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if p.Email != nil && *p.Email != u.Email {
		if existing, err := s.repo.FindByEmail(ctx, *p.Email); err == nil && existing != nil && existing.ID != u.ID {
			return nil, ErrEmailAlreadyExists
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		u.Email = *p.Email
	}

	if p.FirstName != nil {
		u.FirstName = *p.FirstName
	}
	if p.LastName != nil {
		u.LastName = *p.LastName
	}
	if p.Phone != nil {
		u.Phone = *p.Phone
	}
	if p.RoleID != nil {
		if *p.RoleID == 0 {
			return nil, ErrInvalidRoleID
		}
		u.RoleID = *p.RoleID
	}
	if p.IsActive != nil {
		u.IsActive = *p.IsActive
	}
	if p.OrganizationID != nil {
		u.OrganizationID = p.OrganizationID
	}
	if p.Password != nil && *p.Password != "" {
		u.PlainPassword = *p.Password
	}

	if err := s.repo.Update(ctx, u); err != nil {
		return nil, err
	}

	if p.RoleID != nil && p.Permissions == nil && s.permSvc != nil {
		_ = s.permSvc.SyncFromRole(ctx, id, u.RoleID)
	}
	if p.Permissions != nil && s.permSvc != nil {
		if err := s.permSvc.SetForUser(ctx, id, p.Permissions); err != nil {
			return nil, err
		}
	}

	return s.repo.FindByID(ctx, id)
}

// Deactivate performs a soft deactivation by setting IsActive=false.
func (s *UserService) Deactivate(ctx context.Context, id uint) error {
	u, err := s.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if !u.IsActive {
		return nil
	}
	u.IsActive = false
	return s.repo.Update(ctx, u)
}

// RoleStats returns counts of users per role.
func (s *UserService) RoleStats(ctx context.Context) ([]repositories.UserRoleStat, error) {
	return s.repo.RoleStats(ctx)
}
