package repositories

import (
	"context"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// StudentRepository encapsulates DB access for students.
type StudentRepository interface {
	FindByID(ctx context.Context, id uint) (*models.Student, error)
	List(ctx context.Context, limit, offset int, search string) ([]models.Student, int64, error)
	Create(ctx context.Context, student *models.Student) error
	Update(ctx context.Context, student *models.Student) error
	Delete(ctx context.Context, id uint) error
	Stats(ctx context.Context) (total, active, inactive, debtors int64, err error)
	// ReplaceActiveEnrollment cancels active enrollments for the student; if planID is non-nil, creates a new ACTIVE row.
	ReplaceActiveEnrollment(ctx context.Context, studentID uint, planID *uint, priceCents int64) error
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

func (r *GormStudentRepository) Delete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&models.Student{}, id).Error
}

// Stats returns aggregate counts for students: total, active, inactive, and debtors (balance < 0).
// Each count uses a fresh query so Where conditions do not accumulate.
func (r *GormStudentRepository) Stats(ctx context.Context) (total, active, inactive, debtors int64, err error) {
	ctxDB := r.db.WithContext(ctx)
	m := func() *gorm.DB { return ctxDB.Model(&models.Student{}) }

	if err = m().Count(&total).Error; err != nil {
		return
	}
	if err = m().Where("status = ?", models.StudentStatusActive).Count(&active).Error; err != nil {
		return
	}
	if err = m().Where("status = ?", models.StudentStatusInactive).Count(&inactive).Error; err != nil {
		return
	}
	if err = m().Where("balance_cents < 0").Count(&debtors).Error; err != nil {
		return
	}
	return
}

func (r *GormStudentRepository) ReplaceActiveEnrollment(ctx context.Context, studentID uint, planID *uint, priceCents int64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Enrollment{}).
			Where("student_id = ? AND status = ?", studentID, models.EnrollmentStatusActive).
			Update("status", models.EnrollmentStatusCancelled).Error; err != nil {
			return err
		}
		if planID == nil {
			return nil
		}
		e := models.Enrollment{
			StudentID:  studentID,
			PlanID:     *planID,
			StartDate:  time.Now(),
			EndDate:    nil,
			Status:     models.EnrollmentStatusActive,
			PriceCents: priceCents,
		}
		return tx.Create(&e).Error
	})
}

