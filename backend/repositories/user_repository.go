package repositories

import (
	"context"

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
	List(ctx context.Context, limit, offset int, search, role string, isActive *bool) ([]models.User, int64, error)
}

type GormUserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) UserRepository {
	return &GormUserRepository{db: db}
}

func (r *GormUserRepository) FindByID(ctx context.Context, id uint) (*models.User, error) {
	var u models.User
	if err := r.db.WithContext(ctx).First(&u, id).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *GormUserRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	if err := r.db.WithContext(ctx).Where("email = ?", email).First(&u).Error; err != nil {
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
func (r *GormUserRepository) List(ctx context.Context, limit, offset int, search, role string, isActive *bool) ([]models.User, int64, error) {
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

	if role != "" {
		query = query.Where("role = ?", role)
	}

	if isActive != nil {
		query = query.Where("is_active = ?", *isActive)
	}

	if err := query.Count(&count).Error; err != nil {
		return nil, 0, err
	}

	if err := query.
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&users).Error; err != nil {
		return nil, 0, err
	}

	return users, count, nil
}


