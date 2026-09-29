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
	ErrInvalidRoleCode     = errors.New("invalid role code; use 1-64 lowercase letters, numbers and underscores")
	ErrRoleHasStudents     = errors.New("role has linked students")
	ErrRoleNeedsReassign   = errors.New("role has users; choose a replacement role")
	ErrRoleInvalidReassign = errors.New("invalid replacement role")
)

// RoleDeleteCheck describes whether a role can be removed permanently.
type RoleDeleteCheck struct {
	UsersCount    int64
	StudentsCount int64
	IsSystem      bool
}

var roleCodeRe = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)

type CreateRoleParams struct {
	Code               string
	Name               string
	Description        string
	FullAccess         bool
	CompensationKind   models.CompensationKind
	FixedCents         *int64
	PayrollMonthsCount *int
	Permissions        []models.Permission
}

type UpdateRoleParams struct {
	Name               *string
	Description        *string
	FullAccess         *bool
	CompensationKind   *models.CompensationKind
	FixedCents         *int64
	PayrollMonthsCount *int
	Permissions        []models.Permission
}

type RoleService struct {
	repo repositories.RoleRepository
}

func NewRoleService(repo repositories.RoleRepository) *RoleService {
	return &RoleService{repo: repo}
}

func validatePayrollMonths(n *int) error {
	if n == nil {
		return nil
	}
	if *n < 1 || *n > 12 {
		return ErrInvalidCompensation
	}
	return nil
}

func normalizePayrollMonths(kind models.CompensationKind, n *int) *int {
	if n != nil && *n > 0 {
		v := *n
		if v > 12 {
			v = 12
		}
		return &v
	}
	d := models.DefaultPayrollMonthsForKind(kind)
	return &d
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
		// NET_REVENUE: variable salary = total payments − role/advisor shares on those payments.
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
	if err := validatePayrollMonths(p.PayrollMonthsCount); err != nil {
		return nil, err
	}

	perms := p.Permissions
	if p.FullAccess {
		perms = models.AllPermissions
	}

	months := normalizePayrollMonths(p.CompensationKind, p.PayrollMonthsCount)
	role := &models.Role{
		Code:               code,
		Name:               strings.TrimSpace(p.Name),
		Description:        strings.TrimSpace(p.Description),
		IsSystem:           false,
		FullAccess:         p.FullAccess,
		CompensationKind:   p.CompensationKind,
		FixedCents:         p.FixedCents,
		PayrollMonthsCount: months,
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
	if p.PayrollMonthsCount != nil {
		role.PayrollMonthsCount = normalizePayrollMonths(kind, p.PayrollMonthsCount)
	}

	if err := validateCompensation(kind, fixed); err != nil {
		return nil, err
	}
	if err := validatePayrollMonths(role.PayrollMonthsCount); err != nil {
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

// DeleteCheck reports users/students linked to a role (for the delete dialog).
func (s *RoleService) DeleteCheck(ctx context.Context, id uint) (*RoleDeleteCheck, error) {
	role, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	users, err := s.repo.CountUsers(ctx, id)
	if err != nil {
		return nil, err
	}
	students, err := s.repo.CountLinkedStudents(ctx, id)
	if err != nil {
		return nil, err
	}
	return &RoleDeleteCheck{UsersCount: users, StudentsCount: students, IsSystem: role.IsSystem}, nil
}

// HardDelete permanently removes a role that has no linked students. Users on the role
// (if any) are moved to reassignTo, which is required in that case.
func (s *RoleService) HardDelete(ctx context.Context, id uint, reassignTo *uint) error {
	check, err := s.DeleteCheck(ctx, id)
	if err != nil {
		return err
	}
	if check.IsSystem {
		return ErrSystemRoleDelete
	}
	if check.StudentsCount > 0 {
		return ErrRoleHasStudents
	}
	if reassignTo != nil {
		if *reassignTo == id {
			return ErrRoleInvalidReassign
		}
		if _, err := s.repo.GetByID(ctx, *reassignTo); err != nil {
			return ErrRoleInvalidReassign
		}
	}
	var unscopedUsers int64
	if err := s.repo.CountUsersUnscoped(ctx, id, &unscopedUsers); err != nil {
		return err
	}
	if unscopedUsers > 0 && reassignTo == nil {
		return ErrRoleNeedsReassign
	}
	return s.repo.HardDelete(ctx, id, reassignTo)
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
