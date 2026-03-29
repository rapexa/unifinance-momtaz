package services

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"gorm.io/gorm"
)

var (
	ErrRoleCodeExists      = errors.New("role code already exists")
	ErrRoleInUse           = errors.New("role is assigned to users")
	ErrSystemRoleDelete    = errors.New("cannot delete system role")
	ErrInvalidCompensation = errors.New("invalid compensation fields for selected kind")
	ErrInvalidRoleCode     = errors.New("invalid role code; use lowercase letters, numbers and underscores")
)

var roleCodeRe = regexp.MustCompile(`^[a-z][a-z0-9_]{1,62}$`)

type CreateRoleParams struct {
	Code             string
	Name             string
	Description      string
	FullAccess       bool
	CompensationKind models.CompensationKind
	FixedCents       *int64
	Permissions      []models.Permission
}

type UpdateRoleParams struct {
	Name             *string
	Description      *string
	FullAccess       *bool
	CompensationKind *models.CompensationKind
	FixedCents       *int64
	Permissions      []models.Permission
}

type RoleService struct {
	repo repositories.RoleRepository
}

func NewRoleService(repo repositories.RoleRepository) *RoleService {
	return &RoleService{repo: repo}
}

func validateCompensation(kind models.CompensationKind, fixed *int64) error {
	switch kind {
	case models.CompFixed:
		if fixed == nil {
			return ErrInvalidCompensation
		}
	case models.CompVariable:
		// Variable salary comes from per-student role payouts; no extra fields needed.
	case models.CompNetRevenue:
		// NET_REVENUE: salary is calculated as total_payments − other_salaries.
		// No manual fixed_cents required; calculated at payroll time.
	default:
		return ErrInvalidCompensation
	}
	return nil
}

func normalizeRoleCode(code string) string {
	return strings.ToLower(strings.TrimSpace(code))
}

// Create adds a new role with compensation and default permissions.
func (s *RoleService) Create(ctx context.Context, p CreateRoleParams) (*models.Role, error) {
	code := normalizeRoleCode(p.Code)
	if !roleCodeRe.MatchString(code) {
		return nil, ErrInvalidRoleCode
	}
	if _, err := s.repo.GetByCode(ctx, code); err == nil {
		return nil, ErrRoleCodeExists
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	if err := validateCompensation(p.CompensationKind, p.FixedCents); err != nil {
		return nil, err
	}

	perms := p.Permissions
	if p.FullAccess {
		perms = models.AllPermissions
	}

	role := &models.Role{
		Code:             code,
		Name:             strings.TrimSpace(p.Name),
		Description:      strings.TrimSpace(p.Description),
		IsSystem:         false,
		FullAccess:       p.FullAccess,
		CompensationKind: p.CompensationKind,
		FixedCents:       p.FixedCents,
	}
	if role.Name == "" {
		return nil, errors.New("name is required")
	}

	if err := s.repo.Create(ctx, role); err != nil {
		return nil, err
	}
	if err := s.repo.ReplacePermissions(ctx, role.ID, perms); err != nil {
		return nil, err
	}
	return s.repo.GetByID(ctx, role.ID)
}

// Update modifies an existing role.
func (s *RoleService) Update(ctx context.Context, id uint, p UpdateRoleParams) (*models.Role, error) {
	role, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}

	kind := role.CompensationKind
	fixed := role.FixedCents
	fullAccess := role.FullAccess

	if p.Name != nil {
		role.Name = strings.TrimSpace(*p.Name)
	}
	if p.Description != nil {
		role.Description = strings.TrimSpace(*p.Description)
	}
	if p.FullAccess != nil {
		role.FullAccess = *p.FullAccess
		fullAccess = role.FullAccess
	}
	if p.CompensationKind != nil {
		role.CompensationKind = *p.CompensationKind
		kind = role.CompensationKind
	}
	if p.FixedCents != nil {
		role.FixedCents = p.FixedCents
		fixed = role.FixedCents
	}

	if err := validateCompensation(kind, fixed); err != nil {
		return nil, err
	}
	if role.Name == "" {
		return nil, errors.New("name is required")
	}

	if err := s.repo.Update(ctx, role); err != nil {
		return nil, err
	}

	if p.Permissions != nil {
		perms := p.Permissions
		if fullAccess {
			perms = models.AllPermissions
		}
		if err := s.repo.ReplacePermissions(ctx, role.ID, perms); err != nil {
			return nil, err
		}
	}

	return s.repo.GetByID(ctx, id)
}

// Delete removes a custom role (no users, not system).
func (s *RoleService) Delete(ctx context.Context, id uint) error {
	role, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if role.IsSystem {
		return ErrSystemRoleDelete
	}
	n, err := s.repo.CountUsers(ctx, id)
	if err != nil {
		return err
	}
	if n > 0 {
		return ErrRoleInUse
	}
	return s.repo.Delete(ctx, id)
}

func (s *RoleService) List(ctx context.Context) ([]models.Role, error) {
	return s.repo.List(ctx)
}

func (s *RoleService) GetByID(ctx context.Context, id uint) (*models.Role, error) {
	return s.repo.GetByID(ctx, id)
}

// ListPermissions returns default permissions configured for the role.
func (s *RoleService) ListPermissions(ctx context.Context, roleID uint) ([]models.Permission, error) {
	return s.repo.ListPermissions(ctx, roleID)
}
