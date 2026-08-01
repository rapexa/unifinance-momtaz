package services

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"gorm.io/gorm"
)

var (
	ErrSchoolContractNotFound = errors.New("school contract not found")
	ErrSchoolContractInvalid  = errors.New("invalid school contract")
)

type SchoolContractService struct {
	repo repositories.SchoolContractRepository
}

func NewSchoolContractService(repo repositories.SchoolContractRepository) *SchoolContractService {
	return &SchoolContractService{repo: repo}
}

type CreateSchoolContractParams struct {
	SchoolName     string
	StudentCount   int
	UnitPriceCents int64
	Notes          string
	StartDate      *time.Time
	Status         string
}

type UpdateSchoolContractParams struct {
	SchoolName     string
	StudentCount   int
	UnitPriceCents int64
	Notes          string
	StartDate      *time.Time
	Status         string
}

func validateSchoolContractFields(schoolName string, studentCount int, unitPriceCents int64) error {
	if strings.TrimSpace(schoolName) == "" {
		return errors.New("school name is required")
	}
	if studentCount <= 0 {
		return errors.New("student count must be greater than zero")
	}
	if unitPriceCents <= 0 {
		return errors.New("unit price must be greater than zero")
	}
	return nil
}

func (s *SchoolContractService) Create(ctx context.Context, p CreateSchoolContractParams) (*models.SchoolContract, error) {
	if err := validateSchoolContractFields(p.SchoolName, p.StudentCount, p.UnitPriceCents); err != nil {
		return nil, err
	}
	status := models.SchoolContractStatusActive
	if st := strings.ToUpper(strings.TrimSpace(p.Status)); st != "" {
		status = models.SchoolContractStatus(st)
	}
	c := &models.SchoolContract{
		SchoolName:     strings.TrimSpace(p.SchoolName),
		StudentCount:   p.StudentCount,
		UnitPriceCents: p.UnitPriceCents,
		Notes:          strings.TrimSpace(p.Notes),
		StartDate:      p.StartDate,
		Status:         status,
	}
	c.RecalcTotal()
	if err := s.repo.Create(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

func (s *SchoolContractService) Update(ctx context.Context, id uint, p UpdateSchoolContractParams) (*models.SchoolContract, error) {
	c, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrSchoolContractNotFound
		}
		return nil, err
	}
	if err := validateSchoolContractFields(p.SchoolName, p.StudentCount, p.UnitPriceCents); err != nil {
		return nil, err
	}
	c.SchoolName = strings.TrimSpace(p.SchoolName)
	c.StudentCount = p.StudentCount
	c.UnitPriceCents = p.UnitPriceCents
	c.Notes = strings.TrimSpace(p.Notes)
	c.StartDate = p.StartDate
	if st := strings.ToUpper(strings.TrimSpace(p.Status)); st != "" {
		c.Status = models.SchoolContractStatus(st)
	}
	c.RecalcTotal()
	if err := s.repo.Update(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

func (s *SchoolContractService) GetByID(ctx context.Context, id uint) (*models.SchoolContract, int64, error) {
	c, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, 0, ErrSchoolContractNotFound
		}
		return nil, 0, err
	}
	paid, err := s.repo.SumPaidCents(ctx, id)
	if err != nil {
		return nil, 0, err
	}
	return c, paid, nil
}

func (s *SchoolContractService) List(
	ctx context.Context,
	limit, offset int,
	f repositories.SchoolContractListFilter,
) ([]models.SchoolContract, map[uint]int64, int64, error) {
	rows, total, err := s.repo.List(ctx, limit, offset, f)
	if err != nil {
		return nil, nil, 0, err
	}
	ids := make([]uint, len(rows))
	for i := range rows {
		ids[i] = rows[i].ID
	}
	paidMap, err := s.repo.SumPaidCentsByIDs(ctx, ids)
	if err != nil {
		return nil, nil, 0, err
	}
	return rows, paidMap, total, nil
}

func (s *SchoolContractService) Delete(ctx context.Context, id uint) error {
	_, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrSchoolContractNotFound
		}
		return err
	}
	return s.repo.SoftDelete(ctx, id)
}
