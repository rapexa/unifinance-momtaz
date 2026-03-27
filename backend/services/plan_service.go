package services

import (
	"context"
	"errors"
	"strings"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"gorm.io/gorm"
)

var (
	ErrPlanNotFound      = errors.New("plan not found")
	ErrPlanNameExists    = errors.New("plan name already exists")
	ErrPlanInUse         = errors.New("plan has active enrollments")
	ErrInvalidPlanStatus = errors.New("invalid plan status")
	ErrInvalidPlanType   = errors.New("invalid plan type")
)

// PlanService encapsulates business logic for plans.
type PlanService struct {
	repo repositories.PlanRepository
}

func NewPlanService(repo repositories.PlanRepository) *PlanService {
	return &PlanService{repo: repo}
}

// PlanSummary holds aggregated stats for the plans page.
type PlanSummary struct {
	TotalPlans        int64
	ActivePlans       int64
	ActiveEnrollments int64
}

func (s *PlanService) List(ctx context.Context, limit, offset int, search, planType, status string) ([]models.Plan, int64, error) {
	planType = strings.ToUpper(planType)
	status = strings.ToLower(status)
	return s.repo.List(ctx, limit, offset, search, planType, status)
}

func (s *PlanService) GetByID(ctx context.Context, id uint) (*models.Plan, error) {
	p, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPlanNotFound
		}
		return nil, err
	}
	return p, nil
}

type CreatePlanParams struct {
	Name     string
	Type     string
	IsActive *bool
	Features []string
}

type UpdatePlanParams struct {
	Name     *string
	Type     *string
	IsActive *bool
	Features *[]string
}

func (s *PlanService) Create(ctx context.Context, p CreatePlanParams) (*models.Plan, error) {
	if existing, err := s.repo.FindByName(ctx, p.Name); err == nil && existing != nil {
		return nil, ErrPlanNameExists
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	planType := models.PlanType(strings.ToUpper(p.Type))

	plan := &models.Plan{
		Name:     p.Name,
		Type:     planType,
		IsActive: true,
	}
	if p.IsActive != nil {
		plan.IsActive = *p.IsActive
	}

	if err := s.repo.Create(ctx, plan, p.Features); err != nil {
		return nil, err
	}
	return plan, nil
}

func (s *PlanService) Update(ctx context.Context, id uint, p UpdatePlanParams) (*models.Plan, error) {
	plan, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if p.Name != nil && *p.Name != plan.Name {
		if existing, err := s.repo.FindByName(ctx, *p.Name); err == nil && existing != nil && existing.ID != plan.ID {
			return nil, ErrPlanNameExists
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		plan.Name = *p.Name
	}

	if p.Type != nil {
		plan.Type = models.PlanType(strings.ToUpper(*p.Type))
	}
	if p.IsActive != nil {
		plan.IsActive = *p.IsActive
	}

	features := []string(nil)
	if p.Features != nil {
		features = *p.Features
	}

	if err := s.repo.Update(ctx, plan, features); err != nil {
		return nil, err
	}
	return plan, nil
}

func (s *PlanService) Deactivate(ctx context.Context, id uint) error {
	if count, err := s.repo.CountEnrollments(ctx, id); err != nil {
		return err
	} else if count > 0 {
		return ErrPlanInUse
	}

	if err := s.repo.Deactivate(ctx, id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrPlanNotFound
		}
		return err
	}
	return nil
}

// Summary returns aggregated stats for the plans page.
func (s *PlanService) Summary(ctx context.Context) (PlanSummary, error) {
	total, active, enrollments, _, err := s.repo.Stats(ctx)
	if err != nil {
		return PlanSummary{}, err
	}
	return PlanSummary{
		TotalPlans:        total,
		ActivePlans:       active,
		ActiveEnrollments: enrollments,
	}, nil
}
