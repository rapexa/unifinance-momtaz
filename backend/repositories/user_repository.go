package repositories

import (
	"context"
	"strings"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// UserRepository defines data-access behavior for users.
// This is the core of the Repository Pattern for the User aggregate.
type UserRepository interface {
	FindByID(ctx context.Context, id uint) (*models.User, error)
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	Create(ctx context.Context, user *models.User) error
	Update(ctx context.Context, user *models.User) error
	List(ctx context.Context, limit, offset int, search, roleCode string, roleID uint, isActive *bool) ([]models.User, int64, error)
	RoleStats(ctx context.Context) ([]UserRoleStat, error)
}

// UserRoleStat is one row for the users summary endpoint.
type UserRoleStat struct {
	RoleID uint   `json:"role_id"`
	Code   string `json:"code"`
	Name   string `json:"name"`
	Count  int64  `json:"count"`
}

type GormUserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) UserRepository {
	return &GormUserRepository{db: db}
}

func (r *GormUserRepository) FindByID(ctx context.Context, id uint) (*models.User, error) {
	var u models.User
	if err := r.db.WithContext(ctx).Preload("Role").First(&u, id).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *GormUserRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	if err := r.db.WithContext(ctx).Preload("Role").Where("email = ?", email).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *GormUserRepository) Create(ctx context.Context, user *models.User) error {
	return r.db.WithContext(ctx).Create(user).Error
}

func (r *GormUserRepository) Update(ctx context.Context, user *models.User) error {
	return r.db.WithContext(ctx).Save(user).Error
}

// List returns a paginated list of users with optional search, role and status filters.
func (r *GormUserRepository) List(ctx context.Context, limit, offset int, search, roleCode string, roleID uint, isActive *bool) ([]models.User, int64, error) {
	var (
		users []models.User
		count int64
	)

	query := r.db.WithContext(ctx).Model(&models.User{})

	if search != "" {
		like := "%" + search + "%"
		query = query.Where(
			r.db.Where("first_name LIKE ?", like).
				Or("last_name LIKE ?", like).
				Or("email LIKE ?", like),
		)
	}

	if roleID > 0 {
		query = query.Where("users.role_id = ?", roleID)
	} else if roleCode != "" {
		query = query.Joins("LEFT JOIN roles ON roles.id = users.role_id").
			Where("roles.code = ?", strings.ToLower(strings.TrimSpace(roleCode)))
	}

	if isActive != nil {
		query = query.Where("users.is_active = ?", *isActive)
	}

	if err := query.Count(&count).Error; err != nil {
		return nil, 0, err
	}

	q2 := r.db.WithContext(ctx).Model(&models.User{}).Preload("Role")
	if search != "" {
		like := "%" + search + "%"
		q2 = q2.Where(
			r.db.Where("first_name LIKE ?", like).
				Or("last_name LIKE ?", like).
				Or("email LIKE ?", like),
		)
	}
	if roleID > 0 {
		q2 = q2.Where("users.role_id = ?", roleID)
	} else if roleCode != "" {
		q2 = q2.Joins("LEFT JOIN roles ON roles.id = users.role_id").
			Where("roles.code = ?", strings.ToLower(strings.TrimSpace(roleCode)))
	}
	if isActive != nil {
		q2 = q2.Where("users.is_active = ?", *isActive)
	}

	if err := q2.
		Order("users.created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&users).Error; err != nil {
		return nil, 0, err
	}

	return users, count, nil
}

// RoleStats returns user counts grouped by role.
func (r *GormUserRepository) RoleStats(ctx context.Context) ([]UserRoleStat, error) {
	var rows []UserRoleStat
	err := r.db.WithContext(ctx).Model(&models.User{}).
		Select("users.role_id as role_id, COALESCE(roles.code, '') as code, COALESCE(roles.name, '') as name, COUNT(*) as count").
		Joins("LEFT JOIN roles ON roles.id = users.role_id").
		Group("users.role_id, roles.code, roles.name").
		Scan(&rows).Error
	return rows, err
}
