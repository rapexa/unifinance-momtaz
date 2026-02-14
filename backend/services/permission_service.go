package services

import (
	"context"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
)

// Default permissions per role (applied when creating a new user).
var defaultPermissionsByRole = map[models.UserRole][]models.Permission{
	models.UserRoleAdmin:      {models.PermDashboard, models.PermStudents, models.PermUsers, models.PermPlans, models.PermPayments, models.PermPayroll, models.PermReminders, models.PermReports, models.PermSettings},
	models.UserRoleAdvisor:    {models.PermStudents, models.PermPayments, models.PermPlans},
	models.UserRoleAccountant: {models.PermPayments, models.PermPayroll, models.PermPlans},
	models.UserRoleOperator:  {models.PermStudents},
}

// PermissionService handles RBAC permission logic.
type PermissionService struct {
	repo repositories.PermissionRepository
}

func NewPermissionService(repo repositories.PermissionRepository) *PermissionService {
	return &PermissionService{repo: repo}
}

// GetForUser returns the effective permissions for a user. Admin has all; others from DB.
func (s *PermissionService) GetForUser(ctx context.Context, userID uint, role models.UserRole) ([]models.Permission, error) {
	if role == models.UserRoleAdmin {
		return models.AllPermissions, nil
	}
	return s.repo.ListByUserID(ctx, userID)
}

// SetDefaultsForRole inserts default permissions for a newly created user.
func (s *PermissionService) SetDefaultsForRole(ctx context.Context, userID uint, role models.UserRole) error {
	perms := defaultPermissionsByRole[role]
	if len(perms) == 0 {
		return nil
	}
	return s.repo.ReplaceForUser(ctx, userID, perms)
}

// SetForUser replaces all permissions for a user (admin only).
func (s *PermissionService) SetForUser(ctx context.Context, userID uint, permissions []models.Permission) error {
	return s.repo.ReplaceForUser(ctx, userID, permissions)
}

// HasPermission returns true if the user (by role and stored permissions) has the given permission.
func (s *PermissionService) HasPermission(ctx context.Context, userID uint, role models.UserRole, perm models.Permission) (bool, error) {
	if role == models.UserRoleAdmin {
		return true, nil
	}
	list, err := s.repo.ListByUserID(ctx, userID)
	if err != nil {
		return false, err
	}
	for _, p := range list {
		if p == perm {
			return true, nil
		}
	}
	return false, nil
}
