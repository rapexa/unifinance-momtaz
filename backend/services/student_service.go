package services

import (
	"context"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
)

// StudentService encapsulates business logic for students.
type StudentService struct {
	repo repositories.StudentRepository
}

func NewStudentService(repo repositories.StudentRepository) *StudentService {
	return &StudentService{repo: repo}
}

func (s *StudentService) GetByID(ctx context.Context, id uint) (*models.Student, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *StudentService) List(ctx context.Context, limit, offset int, search string) ([]models.Student, int64, error) {
	return s.repo.List(ctx, limit, offset, search)
}

func (s *StudentService) Create(ctx context.Context, student *models.Student) error {
	// Place for validation rules in future (e.g., required phone/email).
	return s.repo.Create(ctx, student)
}

func (s *StudentService) Update(ctx context.Context, student *models.Student) error {
	return s.repo.Update(ctx, student)
}

func (s *StudentService) Delete(ctx context.Context, id uint) error {
	return s.repo.Delete(ctx, id)
}

// Stats returns aggregate student counters for use in the Students page stats.
func (s *StudentService) Stats(ctx context.Context) (total, active, inactive, debtors int64, err error) {
	return s.repo.Stats(ctx)
}

// SyncEnrollmentForStudent aligns ACTIVE enrollment with CurrentPlanID and plan discount rules (ثبت‌نام / انتساب پلن).
func (s *StudentService) SyncEnrollmentForStudent(ctx context.Context, studentID uint) error {
	st, err := s.repo.FindByID(ctx, studentID)
	if err != nil {
		return err
	}
	if st.CurrentPlanID == nil {
		return s.repo.ReplaceActiveEnrollment(ctx, studentID, nil, 0)
	}
	if st.CurrentPlan == nil {
		return s.repo.ReplaceActiveEnrollment(ctx, studentID, nil, 0)
	}
	price := models.EffectiveEnrollmentPriceCents(st.CurrentPlan)
	pid := st.CurrentPlan.ID
	return s.repo.ReplaceActiveEnrollment(ctx, studentID, &pid, price)
}

