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
	st, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return err
	}
	st.Status = models.StudentStatusDeleted
	if err := s.repo.Update(ctx, st); err != nil {
		return err
	}
	return s.repo.ReplaceActiveEnrollment(ctx, id, nil, 0)
}

// Stats returns aggregate student counters for use in the Students page stats.
func (s *StudentService) Stats(ctx context.Context) (total, active, inactive, deleted, debtors int64, err error) {
	return s.repo.Stats(ctx)
}

// SyncEnrollmentForStudent aligns ACTIVE enrollment with CurrentPlanID and the provided enrollment amount.
// amountCents is the per-student enrollment price (0 means keep existing or use 0 if new).
func (s *StudentService) SyncEnrollmentForStudent(ctx context.Context, studentID uint, amountCents int64) error {
	st, err := s.repo.FindByID(ctx, studentID)
	if err != nil {
		return err
	}
	if st.Status != models.StudentStatusActive {
		return s.repo.ReplaceActiveEnrollment(ctx, studentID, nil, 0)
	}
	if st.CurrentPlanID == nil {
		return s.repo.ReplaceActiveEnrollment(ctx, studentID, nil, 0)
	}
	pid := *st.CurrentPlanID
	return s.repo.ReplaceActiveEnrollment(ctx, studentID, &pid, amountCents)
}

func (s *StudentService) ReplaceStudentRolePayouts(ctx context.Context, studentID uint, rows []models.StudentRolePayout) error {
	return s.repo.ReplaceStudentRolePayouts(ctx, studentID, rows)
}
