package services

import (
	"context"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
)

// PermissionService handles RBAC permission logic.
type PermissionService struct {
	repo     repositories.PermissionRepository
	roleRepo repositories.RoleRepository
}

func NewPermissionService(repo repositories.PermissionRepository, roleRepo repositories.RoleRepository) *PermissionService {
	return &PermissionService{repo: repo, roleRepo: roleRepo}
}

// GetForUser returns effective permissions. FullAccess users get all permissions without reading the DB.
func (s *PermissionService) GetForUser(ctx context.Context, userID uint, fullAccess bool) ([]models.Permission, error) {
	if fullAccess {
		return models.AllPermissions, nil
	}
	return s.repo.ListByUserID(ctx, userID)
}

// SyncFromRole replaces the user's permissions with the role template (or all if full access).
func (s *PermissionService) SyncFromRole(ctx context.Context, userID, roleID uint) error {
	role, err := s.roleRepo.GetByID(ctx, roleID)
	if err != nil {
		return err
	}
	if role.FullAccess {
		return s.repo.ReplaceForUser(ctx, userID, models.AllPermissions)
	}
	perms, err := s.roleRepo.ListPermissions(ctx, roleID)
	if err != nil {
		return err
	}
	return s.repo.ReplaceForUser(ctx, userID, perms)
}

// SetForUser replaces all permissions for a user (admin editing overrides).
func (s *PermissionService) SetForUser(ctx context.Context, userID uint, permissions []models.Permission) error {
	return s.repo.ReplaceForUser(ctx, userID, permissions)
}

// HasPermission returns true if the user has the given permission.
func (s *PermissionService) HasPermission(ctx context.Context, userID uint, fullAccess bool, perm models.Permission) (bool, error) {
	if fullAccess {
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
