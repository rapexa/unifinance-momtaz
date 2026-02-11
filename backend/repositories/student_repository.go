package repositories

import (
	"context"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// StudentRepository encapsulates DB access for students.
type StudentRepository interface {
	FindByID(ctx context.Context, id uint) (*models.Student, error)
	List(ctx context.Context, limit, offset int, search string) ([]models.Student, int64, error)
	Create(ctx context.Context, student *models.Student) error
	Update(ctx context.Context, student *models.Student) error
}

type GormStudentRepository struct {
	db *gorm.DB
}

func NewStudentRepository(db *gorm.DB) StudentRepository {
	return &GormStudentRepository{db: db}
}

func (r *GormStudentRepository) FindByID(ctx context.Context, id uint) (*models.Student, error) {
	var s models.Student
	if err := r.db.WithContext(ctx).
		Preload("Advisor").
		Preload("CurrentPlan").
		First(&s, id).Error; err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *GormStudentRepository) List(ctx context.Context, limit, offset int, search string) ([]models.Student, int64, error) {
	var (
		students []models.Student
		count    int64
	)

	query := r.db.WithContext(ctx).Model(&models.Student{})

	if search != "" {
		like := "%" + search + "%"
		query = query.Where("first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR email LIKE ?", like, like, like, like)
	}

	if err := query.Count(&count).Error; err != nil {
		return nil, 0, err
	}

	if err := query.
		Preload("Advisor").
		Preload("CurrentPlan").
		Limit(limit).
		Offset(offset).
		Find(&students).Error; err != nil {
		return nil, 0, err
	}

	return students, count, nil
}

func (r *GormStudentRepository) Create(ctx context.Context, student *models.Student) error {
	return r.db.WithContext(ctx).Create(student).Error
}

func (r *GormStudentRepository) Update(ctx context.Context, student *models.Student) error {
	return r.db.WithContext(ctx).Save(student).Error
}

