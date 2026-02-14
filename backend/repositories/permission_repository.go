package repositories

import (
	"context"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// PermissionRepository defines data access for user permissions.
type PermissionRepository interface {
	ListByUserID(ctx context.Context, userID uint) ([]models.Permission, error)
	ReplaceForUser(ctx context.Context, userID uint, permissions []models.Permission) error
}

type GormPermissionRepository struct {
	db *gorm.DB
}

func NewPermissionRepository(db *gorm.DB) PermissionRepository {
	return &GormPermissionRepository{db: db}
}

func (r *GormPermissionRepository) ListByUserID(ctx context.Context, userID uint) ([]models.Permission, error) {
	var rows []models.UserPermission
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]models.Permission, 0, len(rows))
	for _, row := range rows {
		out = append(out, row.Permission)
	}
	return out, nil
}

func (r *GormPermissionRepository) ReplaceForUser(ctx context.Context, userID uint, permissions []models.Permission) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ?", userID).Delete(&models.UserPermission{}).Error; err != nil {
			return err
		}
		for _, p := range permissions {
			if err := tx.Create(&models.UserPermission{UserID: userID, Permission: p}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
