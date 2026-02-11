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

