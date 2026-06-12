package repositories

import (
	"context"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/access"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// StudentRepository encapsulates DB access for students.
type StudentRepository interface {
	FindByID(ctx context.Context, id uint) (*models.Student, error)
	List(ctx context.Context, limit, offset int, search string, scopeUser *uint) ([]models.Student, int64, error)
	Create(ctx context.Context, student *models.Student) error
	Update(ctx context.Context, student *models.Student) error
	Delete(ctx context.Context, id uint) error
	HardDelete(ctx context.Context, id uint) error
	Stats(ctx context.Context, scopeUser *uint) (total, active, inactive, deleted, debtors int64, err error)
	IsStudentVisibleToUser(ctx context.Context, studentID uint, userID uint) (bool, error)
	// ReplaceActiveEnrollment cancels active enrollments for the student; if planID is non-nil, creates a new ACTIVE row.
	ReplaceActiveEnrollment(ctx context.Context, studentID uint, planID *uint, priceCents int64) error
	ReplaceStudentRolePayouts(ctx context.Context, studentID uint, rows []models.StudentRolePayout) error
	CountPaidPayments(ctx context.Context, studentID uint) (int64, error)
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
		Preload("Enrollments", "status = ?", models.EnrollmentStatusActive).
		Preload("StudentRolePayouts").
		Preload("StudentRolePayouts.Role").
		Preload("StudentRolePayouts.User").
		First(&s, id).Error; err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *GormStudentRepository) IsStudentVisibleToUser(ctx context.Context, studentID uint, userID uint) (bool, error) {
	var st models.Student
	if err := r.db.WithContext(ctx).Select("id", "advisor_id").First(&st, studentID).Error; err != nil {
		return false, err
	}
	if st.AdvisorID != nil && *st.AdvisorID == userID {
		return true, nil
	}
	var n int64
	if err := r.db.WithContext(ctx).Model(&models.StudentRolePayout{}).
		Where("student_id = ? AND user_id = ?", studentID, userID).
		Count(&n).Error; err != nil {
		return false, err
	}
	return n > 0, nil
}

func (r *GormStudentRepository) List(ctx context.Context, limit, offset int, search string, scopeUser *uint) ([]models.Student, int64, error) {
	var (
		students []models.Student
		count    int64
	)

	query := r.db.WithContext(ctx).Model(&models.Student{})
	if scopeUser != nil {
		query = access.ScopeStudentRows(query, *scopeUser)
	}

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
		Preload("Enrollments", "status = ?", models.EnrollmentStatusActive).
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

// HardDelete permanently removes the student and all dependent rows (payments, enrollments, etc.).
func (r *GormStudentRepository) HardDelete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Unscoped().Where("student_id = ?", id).
			Delete(&models.CompensationRuleStudent{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("student_id = ?", id).
			Delete(&models.CompensationRuleUserStudent{}).Error; err != nil {
			return err
		}

		var paymentIDs []uint
		if err := tx.Unscoped().Model(&models.Payment{}).
			Where("student_id = ?", id).
			Pluck("id", &paymentIDs).Error; err != nil {
			return err
		}
		if len(paymentIDs) > 0 {
			if err := tx.Unscoped().Where("payment_id IN ?", paymentIDs).
				Delete(&models.PaymentPayrollShare{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Unscoped().Where("student_id = ?", id).Delete(&models.Payment{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("student_id = ?", id).Delete(&models.Enrollment{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("student_id = ?", id).Delete(&models.PaymentReminder{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("student_id = ?", id).Delete(&models.StudentRolePayout{}).Error; err != nil {
			return err
		}
		res := tx.Unscoped().Delete(&models.Student{}, id)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}

func (r *GormStudentRepository) CountPaidPayments(ctx context.Context, studentID uint) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&models.Payment{}).
		Where("student_id = ? AND status = ?", studentID, models.PaymentStatusPaid).
		Count(&n).Error
	return n, err
}

// Stats returns aggregate counts for students: total, active, inactive, and debtors (balance < 0).
// Each count uses a fresh query so Where conditions do not accumulate.
func (r *GormStudentRepository) Stats(ctx context.Context, scopeUser *uint) (total, active, inactive, deleted, debtors int64, err error) {
	ctxDB := r.db.WithContext(ctx)
	scoped := func() *gorm.DB {
		q := ctxDB.Model(&models.Student{})
		if scopeUser != nil {
			q = access.ScopeStudentRows(q, *scopeUser)
		}
		return q
	}

	if err = scoped().Count(&total).Error; err != nil {
		return
	}
	if err = scoped().Where("status = ?", models.StudentStatusActive).Count(&active).Error; err != nil {
		return
	}
	if err = scoped().Where("status = ?", models.StudentStatusInactive).Count(&inactive).Error; err != nil {
		return
	}
	if err = scoped().Where("status = ?", models.StudentStatusDeleted).Count(&deleted).Error; err != nil {
		return
	}
	if err = scoped().Where("balance_cents < 0").Count(&debtors).Error; err != nil {
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

func (r *GormStudentRepository) ReplaceStudentRolePayouts(ctx context.Context, studentID uint, rows []models.StudentRolePayout) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Hard-delete (Unscoped) so the unique index on (student_id, role_id, user_id)
		// does not block subsequent inserts with the same keys.
		if err := tx.Unscoped().Where("student_id = ?", studentID).Delete(&models.StudentRolePayout{}).Error; err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		for i := range rows {
			rows[i].StudentID = studentID
			rows[i].Model = gorm.Model{} // clear any stale ID/timestamps before insert
		}
		return tx.Create(&rows).Error
	})
}
