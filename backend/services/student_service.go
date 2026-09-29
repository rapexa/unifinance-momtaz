package services

import (
	"context"
	"errors"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
)

var ErrStudentMustBeDeletedFirst = errors.New("student must be marked deleted before permanent removal")

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

func (s *StudentService) List(ctx context.Context, limit, offset int, filter repositories.StudentListFilter) ([]models.Student, int64, error) {
	return s.repo.List(ctx, limit, offset, filter)
}

// CountBySchoolContractIDs returns registered (non-deleted) student counts per school contract.
func (s *StudentService) CountBySchoolContractIDs(ctx context.Context, ids []uint) (map[uint]int64, error) {
	return s.repo.CountBySchoolContractIDs(ctx, ids)
}

// SumEnrollmentCentsBySchoolContractID sums enrollment amounts for non-deleted students on a contract.
func (s *StudentService) SumEnrollmentCentsBySchoolContractID(ctx context.Context, contractID uint) (int64, error) {
	return s.repo.SumEnrollmentAmountCentsBySchoolContractID(ctx, contractID)
}

// SchoolNames lists distinct school names for the students the user may see.
func (s *StudentService) SchoolNames(ctx context.Context, scopeUser *uint) ([]string, error) {
	return s.repo.DistinctSchoolNames(ctx, scopeUser)
}

// IsStudentVisibleToUser is true when the user is the student's advisor or has a student_role_payout row.
func (s *StudentService) IsStudentVisibleToUser(ctx context.Context, studentID uint, userID uint) (bool, error) {
	return s.repo.IsStudentVisibleToUser(ctx, studentID, userID)
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
	if st.Status == models.StudentStatusActive || st.EndDate == nil {
		now := time.Now()
		end := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		st.EndDate = &end
	}
	st.Status = models.StudentStatusDeleted
	if err := s.repo.Update(ctx, st); err != nil {
		return err
	}
	return s.repo.ReplaceActiveEnrollment(ctx, id, nil, 0)
}

// HardDelete permanently removes a student and related rows.
// Allowed when status is DELETED, or when the student has no PAID payments (test / mistaken entry).
// Students with PAID payments must be soft-deleted first so accounting history is not wiped by accident.
func (s *StudentService) HardDelete(ctx context.Context, id uint) error {
	st, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return err
	}
	if st.Status != models.StudentStatusDeleted {
		paidCount, err := s.repo.CountPaidPayments(ctx, id)
		if err != nil {
			return err
		}
		if paidCount > 0 {
			return ErrStudentMustBeDeletedFirst
		}
	}
	return s.repo.HardDelete(ctx, id)
}

// Stats returns aggregate student counters for use in the Students page stats.
func (s *StudentService) Stats(ctx context.Context, scopeUser *uint) (total, active, inactive, deleted, debtors int64, err error) {
	return s.repo.Stats(ctx, scopeUser)
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
