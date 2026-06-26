package repositories

import (
	"context"
	"errors"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// RoleRepository defines data access for roles and their default permissions.
type RoleRepository interface {
	List(ctx context.Context) ([]models.Role, error)
	GetByID(ctx context.Context, id uint) (*models.Role, error)
	GetByCode(ctx context.Context, code string) (*models.Role, error)
	Create(ctx context.Context, role *models.Role) error
	Update(ctx context.Context, role *models.Role) error
	Delete(ctx context.Context, id uint) error
	CountUsers(ctx context.Context, roleID uint) (int64, error)
	ListPermissions(ctx context.Context, roleID uint) ([]models.Permission, error)
	ReplacePermissions(ctx context.Context, roleID uint, permissions []models.Permission) error
}

type GormRoleRepository struct {
	db *gorm.DB
}

func NewRoleRepository(db *gorm.DB) RoleRepository {
	return &GormRoleRepository{db: db}
}

func (r *GormRoleRepository) List(ctx context.Context) ([]models.Role, error) {
	var roles []models.Role
	err := r.db.WithContext(ctx).Order("is_system DESC, name ASC").Find(&roles).Error
	return roles, err
}

func (r *GormRoleRepository) GetByID(ctx context.Context, id uint) (*models.Role, error) {
	var role models.Role
	if err := r.db.WithContext(ctx).First(&role, id).Error; err != nil {
		return nil, err
	}
	return &role, nil
}

func (r *GormRoleRepository) GetByCode(ctx context.Context, code string) (*models.Role, error) {
	var role models.Role
	if err := r.db.WithContext(ctx).Where("code = ?", code).First(&role).Error; err != nil {
		return nil, err
	}
	return &role, nil
}

func (r *GormRoleRepository) Create(ctx context.Context, role *models.Role) error {
	// The code unique index ignores deleted_at, so a soft-deleted role (e.g. archived by a
	// fiscal-year close) still occupies the code and a plain INSERT would fail with a
	// duplicate-key error. If such an archived row exists, revive it in place instead.
	var soft models.Role
	softErr := r.db.WithContext(ctx).Unscoped().
		Where("code = ? AND deleted_at IS NOT NULL", role.Code).
		First(&soft).Error
	if softErr == nil {
		if err := r.db.WithContext(ctx).Unscoped().Model(&models.Role{}).
			Where("id = ?", soft.ID).Updates(map[string]interface{}{
			"deleted_at":           gorm.Expr("NULL"),
			"name":                 role.Name,
			"description":          role.Description,
			"is_system":            role.IsSystem,
			"full_access":          role.FullAccess,
			"compensation_kind":    role.CompensationKind,
			"fixed_cents":          role.FixedCents,
			"payroll_months_count": role.PayrollMonthsCount,
		}).Error; err != nil {
			return err
		}
		role.ID = soft.ID
		return nil
	}
	if !errors.Is(softErr, gorm.ErrRecordNotFound) {
		return softErr
	}
	return r.db.WithContext(ctx).Create(role).Error
}

func (r *GormRoleRepository) Update(ctx context.Context, role *models.Role) error {
	return r.db.WithContext(ctx).Save(role).Error
}

func (r *GormRoleRepository) Delete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&models.Role{}, id).Error
}

func (r *GormRoleRepository) CountUsers(ctx context.Context, roleID uint) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&models.User{}).Where("role_id = ?", roleID).Count(&n).Error
	return n, err
}

func (r *GormRoleRepository) ListPermissions(ctx context.Context, roleID uint) ([]models.Permission, error) {
	var rows []models.RolePermission
	if err := r.db.WithContext(ctx).Where("role_id = ?", roleID).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]models.Permission, 0, len(rows))
	for _, row := range rows {
		out = append(out, row.Permission)
	}
	return out, nil
}

func (r *GormRoleRepository) ReplacePermissions(ctx context.Context, roleID uint, permissions []models.Permission) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Unscoped().Where("role_id = ?", roleID).Delete(&models.RolePermission{}).Error; err != nil {
			return err
		}
		for _, p := range permissions {
			if err := tx.Create(&models.RolePermission{RoleID: roleID, Permission: p}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
